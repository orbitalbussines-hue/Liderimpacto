import "server-only";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import {
  criadores_assistentes_conversas as conversas,
  criadores_assistentes_conversas_mensagens as mensagens,
  produtos_modulos_aulas as aulas,
  type FonteMensagem,
} from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { LIMITES_ASSISTENTE, MSG_RECUSA, recusaDoLimite, tituloDaConversa, type Recusa, type Uso } from "./regras";

/**
 * Conversas e mensagens do assistente (ADR-0014, RN-195/196). Sempre do PRÓPRIO membro no criador
 * do host: conversa de outra pessoa ou de outro criador = "não encontrada". O limite diário é
 * contado no banco DENTRO de um `pg_advisory_xact_lock` por criador (a contagem do aluno, o teto
 * do criador e a inserção da pergunta não correm em paralelo: N+1 é recusada mesmo com cliques
 * simultâneos). Contam também as mensagens de conversas apagadas (apagar não devolve a cota).
 */

export class ErroDeLimite extends ErroDeNegocio {
  constructor(readonly motivo: Recusa) {
    super(MSG_RECUSA[motivo]);
  }
}

const MSG_CONVERSA = "Conversa não encontrada. Comece uma nova.";

/** Início do dia de Brasília do instante `agora` (para o limite e o consumo). */
export const inicioDoDiaSql = (agora: Date) => sql`((${agora}::timestamptz at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo')`;

export interface NovaPergunta {
  criadorId: string;
  membroId: string;
  usuarioId: string;
  equipe: boolean;
  pergunta: string;
  conversaId: string | null;
  aulaId: string | null;
  teste: boolean;
  limiteMembro: number;
  tetoCriador: number;
}

export interface PerguntaRegistrada {
  conversaId: string;
  /** Mensagens ANTERIORES da conversa (as últimas, em ordem), só texto. */
  historico: { papel: "USUARIO" | "ASSISTENTE"; texto: string }[];
  /** Perguntas que o aluno ainda pode fazer hoje (null = equipe). */
  restantes: number | null;
}

export async function registrarPergunta(p: NovaPergunta, agora: Date = new Date()): Promise<PerguntaRegistrada> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`assistente:${p.criadorId}`}, 0))`);
    const hoje = sql`${mensagens.created_at} >= ${inicioDoDiaSql(agora)}`;
    // Sem vivos(): apagadas contam (a cota não volta). O índice parcial de USUARIO serve as duas.
    const [[doMembro], [doCriador]] = await Promise.all([
      tx.select({ n: count() }).from(mensagens).where(and(eq(mensagens.membro_id, p.membroId), eq(mensagens.papel, "USUARIO"), hoje)),
      tx.select({ n: count() }).from(mensagens).where(and(eq(mensagens.criador_id, p.criadorId), eq(mensagens.papel, "USUARIO"), hoje)),
    ]);
    const recusa = recusaDoLimite({ equipe: p.equipe, doMembroHoje: doMembro.n, limiteMembro: p.limiteMembro, doCriadorHoje: doCriador.n, tetoCriador: p.tetoCriador });
    if (recusa) throw new ErroDeLimite(recusa);

    let conversaId = p.conversaId;
    let historico: PerguntaRegistrada["historico"] = [];
    if (conversaId) {
      const [c] = await tx
        .select({ id: conversas.id })
        .from(conversas)
        .where(and(eq(conversas.id, conversaId), eq(conversas.criador_id, p.criadorId), eq(conversas.membro_id, p.membroId), eq(conversas.teste, p.teste), vivos(conversas)))
        .for("update");
      if (!c) throw new ErroDeNegocio(MSG_CONVERSA);
      const anteriores = await tx
        .select({ papel: mensagens.papel, texto: mensagens.texto })
        .from(mensagens)
        .where(and(eq(mensagens.conversa_id, conversaId), vivos(mensagens)))
        .orderBy(desc(mensagens.created_at))
        .limit(LIMITES_ASSISTENTE.historico);
      historico = anteriores.reverse().filter((m) => m.texto.trim());
      await tx.update(conversas).set({ updated_at: agora, modified_by: p.usuarioId }).where(eq(conversas.id, conversaId));
    } else {
      const [c] = await tx
        .insert(conversas)
        .values({ criador_id: p.criadorId, membro_id: p.membroId, aula_id: p.aulaId, titulo: tituloDaConversa(p.pergunta), teste: p.teste, created_at: agora, updated_at: agora, modified_by: p.usuarioId })
        .returning({ id: conversas.id });
      conversaId = c.id;
    }
    await tx.insert(mensagens).values({ criador_id: p.criadorId, conversa_id: conversaId, membro_id: p.membroId, papel: "USUARIO", texto: p.pergunta, created_at: agora, updated_at: agora, modified_by: p.usuarioId });
    return { conversaId, historico, restantes: p.equipe ? null : Math.max(0, p.limiteMembro - doMembro.n - 1) };
  });
}

export interface RespostaFinal {
  criadorId: string;
  conversaId: string;
  membroId: string;
  usuarioId: string;
  texto: string;
  fontes: FonteMensagem[];
  uso: Uso;
  modelo: string | null;
  semResposta: boolean;
  interrompida: boolean;
}

/** Grava a resposta (com os tokens) e devolve a versão nova da conversa (para "apagar"). */
export async function gravarResposta(r: RespostaFinal): Promise<{ mensagemId: string; versao: Date }> {
  return db.transaction(async (tx) => {
    const agora = new Date();
    const [m] = await tx
      .insert(mensagens)
      .values({
        criador_id: r.criadorId,
        conversa_id: r.conversaId,
        membro_id: r.membroId,
        papel: "ASSISTENTE",
        texto: r.texto.slice(0, 20_000),
        fontes: r.fontes,
        tokens_entrada: r.uso.entrada,
        tokens_saida: r.uso.saida,
        tokens_cache_leitura: r.uso.cacheLeitura,
        tokens_cache_escrita: r.uso.cacheEscrita,
        modelo: r.modelo,
        sem_resposta: r.semResposta,
        interrompida: r.interrompida,
        modified_by: r.usuarioId,
      })
      .returning({ id: mensagens.id });
    const [c] = await tx
      .update(conversas)
      .set({ updated_at: agora, modified_by: r.usuarioId })
      .where(and(eq(conversas.id, r.conversaId), eq(conversas.criador_id, r.criadorId)))
      .returning({ versao: conversas.updated_at });
    return { mensagemId: m.id, versao: c?.versao ?? agora };
  });
}

export interface ConversaResumo {
  id: string;
  titulo: string;
  aulaTitulo: string | null;
  atualizadaEm: Date;
  versao: string;
}

/** Histórico do PRÓPRIO membro (sem as de teste), mais recentes primeiro. */
export async function conversasDoMembro(criadorId: string, membroId: string, limite = 50): Promise<ConversaResumo[]> {
  const l = await db
    .select({ id: conversas.id, titulo: conversas.titulo, aulaTitulo: aulas.titulo, atualizadaEm: conversas.updated_at })
    .from(conversas)
    .leftJoin(aulas, and(eq(aulas.id, conversas.aula_id), vivos(aulas)))
    .where(and(eq(conversas.criador_id, criadorId), eq(conversas.membro_id, membroId), eq(conversas.teste, false), vivos(conversas)))
    .orderBy(desc(conversas.updated_at))
    .limit(limite);
  return l.map((c) => ({ ...c, versao: c.atualizadaEm.toISOString() }));
}

export interface MensagemDaConversa {
  id: string;
  papel: "USUARIO" | "ASSISTENTE";
  texto: string;
  fontes: FonteMensagem[];
  semResposta: boolean;
  criadaEm: Date;
}

/** Mensagens de UMA conversa do próprio membro (`null` = não é dele / não existe). */
export async function conversaDoMembro(criadorId: string, membroId: string, conversaId: string, teste = false) {
  const [c] = await db
    .select({ id: conversas.id, titulo: conversas.titulo, versao: conversas.updated_at, aulaId: conversas.aula_id })
    .from(conversas)
    .where(and(eq(conversas.id, conversaId), eq(conversas.criador_id, criadorId), eq(conversas.membro_id, membroId), eq(conversas.teste, teste), vivos(conversas)));
  if (!c) return null;
  const lista = await db
    .select({ id: mensagens.id, papel: mensagens.papel, texto: mensagens.texto, fontes: mensagens.fontes, semResposta: mensagens.sem_resposta, criadaEm: mensagens.created_at })
    .from(mensagens)
    .where(and(eq(mensagens.conversa_id, c.id), eq(mensagens.criador_id, criadorId), vivos(mensagens)))
    // Empate de instante: a pergunta (USUARIO) antes da resposta.
    .orderBy(asc(mensagens.created_at), desc(mensagens.papel));
  return { ...c, versao: c.versao.toISOString(), mensagens: lista as MensagemDaConversa[] };
}

/** Conversa mais recente que o membro começou NESTA aula (painel da aula). */
export async function ultimaConversaDaAula(criadorId: string, membroId: string, aulaId: string) {
  const [c] = await db
    .select({ id: conversas.id })
    .from(conversas)
    .where(and(eq(conversas.criador_id, criadorId), eq(conversas.membro_id, membroId), eq(conversas.aula_id, aulaId), eq(conversas.teste, false), vivos(conversas)))
    .orderBy(desc(conversas.updated_at))
    .limit(1);
  return c ? conversaDoMembro(criadorId, membroId, c.id) : null;
}

/** O aluno apaga a PRÓPRIA conversa (lógico, com trava e trilha). As mensagens saem junto. */
export async function apagarConversa(p: { criadorId: string; membroId: string; usuarioId: string; conversaId: string; versao: Date }): Promise<void> {
  await db.transaction(async (tx) => {
    const [c] = await tx
      .update(conversas)
      .set(marcaDeExclusao(p.usuarioId))
      .where(and(travaDeColisao(conversas, p.conversaId, p.versao), eq(conversas.criador_id, p.criadorId), eq(conversas.membro_id, p.membroId)))
      .returning({ titulo: conversas.titulo });
    if (!c) throw new ErroDeNegocio(MSG_COLISAO);
    const apagadas = await tx
      .update(mensagens)
      .set(marcaDeExclusao(p.usuarioId))
      .where(and(eq(mensagens.conversa_id, p.conversaId), eq(mensagens.criador_id, p.criadorId), vivos(mensagens)))
      .returning({ id: mensagens.id });
    await registrarAuditoria(tx, {
      userId: p.usuarioId,
      criadorId: p.criadorId,
      acao: "excluir",
      tabela: "criadores_assistentes_conversas",
      registroId: p.conversaId,
      // Sem o conteúdo: só o tamanho (a conversa é do aluno).
      detalhes: `Apagou uma conversa com o assistente (${apagadas.length} mensagens; exclusão lógica)`,
    });
  });
}
