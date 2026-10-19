import "server-only";
import { and, eq } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import { criadores_automacoes as auto, criadores_funis, criadores_paginas, criadores_tags, produtos } from "@/lib/db/schema";
import type { GatilhoAutomacao, SituacaoAutomacao } from "@/lib/db/schema/_enums";
import type { ConteudoMarketing } from "@/lib/db/schema/marketing";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { ROTULO_GATILHO } from "./regras";

/**
 * AUTOMAÇÕES (RN-224): gatilho (+ curso opcional, + N dias na varredura, + página/funil no gatilho de
 * lead, RN-252), atraso opcional, ação =
 * e-mail e/ou tag. Nascem PAUSADAS: só disparam depois de ativadas (e só para o que acontecer depois).
 * Trava por `updated_at` e trilha na transação de quem chama. O gatilho não muda depois de criada
 * (o histórico de execuções é dele); para outro gatilho, crie outra automação.
 */

const TABELA = "criadores_automacoes";

export interface DadosAutomacao {
  nome: string;
  produtoId: string | null;
  dias: number | null;
  atrasoMinutos: number;
  conteudo: ConteudoMarketing | null;
  tagId: string | null;
  /** Filtro do gatilho de lead (ausente = qualquer página/funil). */
  paginaId?: string | null;
  funilId?: string | null;
}

async function conferir(tx: Transacao, criadorId: string, d: DadosAutomacao) {
  if (d.produtoId) {
    const [p] = await tx.select({ id: produtos.id }).from(produtos).where(and(eq(produtos.id, d.produtoId), eq(produtos.criador_id, criadorId), vivos(produtos)));
    if (!p) throw new ErroDeNegocio("Curso não encontrado.");
  }
  if (d.paginaId) {
    const [p] = await tx.select({ id: criadores_paginas.id }).from(criadores_paginas).where(and(eq(criadores_paginas.id, d.paginaId), eq(criadores_paginas.criador_id, criadorId), vivos(criadores_paginas)));
    if (!p) throw new ErroDeNegocio("Página não encontrada.");
  }
  if (d.funilId) {
    const [f] = await tx.select({ id: criadores_funis.id }).from(criadores_funis).where(and(eq(criadores_funis.id, d.funilId), eq(criadores_funis.criador_id, criadorId), vivos(criadores_funis)));
    if (!f) throw new ErroDeNegocio("Funil não encontrado.");
  }
  if (d.tagId) {
    const [t] = await tx.select({ id: criadores_tags.id }).from(criadores_tags).where(and(eq(criadores_tags.id, d.tagId), eq(criadores_tags.criador_id, criadorId), vivos(criadores_tags)));
    if (!t) throw new ErroDeNegocio("Tag não encontrada.");
  }
}

const colunas = (d: DadosAutomacao) => ({ nome: d.nome, produto_id: d.produtoId, dias: d.dias, atraso_minutos: d.atrasoMinutos, conteudo: d.conteudo, tag_id: d.tagId, pagina_id: d.paginaId ?? null, funil_id: d.funilId ?? null });
const resumo = (d: DadosAutomacao) => ({ nome: d.nome, produto_id: d.produtoId, dias: d.dias, atraso_minutos: d.atrasoMinutos, assunto: d.conteudo?.assunto ?? null, tag_id: d.tagId, pagina_id: d.paginaId ?? null, funil_id: d.funilId ?? null });

export async function criarAutomacao(tx: Transacao, p: { criadorId: string; autor: string; gatilho: GatilhoAutomacao } & DadosAutomacao): Promise<{ id: string; versao: Date }> {
  await conferir(tx, p.criadorId, p);
  const [a] = await tx
    .insert(auto)
    .values({ criador_id: p.criadorId, gatilho: p.gatilho, ...colunas(p), modified_by: p.autor })
    .returning({ id: auto.id, versao: auto.updated_at });
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "criar",
    tabela: TABELA,
    registroId: a.id,
    detalhes: `Criou a automação "${p.nome}" (${ROTULO_GATILHO[p.gatilho]}), pausada`,
    dadosNovos: { gatilho: p.gatilho, ...resumo(p) },
  });
  return a;
}

async function travada(tx: Transacao, criadorId: string, automacaoId: string, versao: Date) {
  const [a] = await tx
    .select({ nome: auto.nome, gatilho: auto.gatilho, situacao: auto.situacao })
    .from(auto)
    .where(and(travaDeColisao(auto, automacaoId, versao), eq(auto.criador_id, criadorId)))
    .for("update");
  if (!a) throw new ErroDeNegocio(MSG_COLISAO);
  return a;
}

async function gravar(tx: Transacao, p: { criadorId: string; autor: string; automacaoId: string; versao: Date }, campos: Partial<typeof auto.$inferInsert>) {
  const [a] = await tx
    .update(auto)
    .set({ ...campos, updated_at: new Date(), modified_by: p.autor })
    .where(and(travaDeColisao(auto, p.automacaoId, p.versao), eq(auto.criador_id, p.criadorId)))
    .returning({ versao: auto.updated_at });
  if (!a) throw new ErroDeNegocio(MSG_COLISAO);
  return a;
}

/** O banco confere de novo (CHECK) curso só nos gatilhos de curso e dias só nos da varredura. */
export async function salvarAutomacao(tx: Transacao, p: { criadorId: string; autor: string; automacaoId: string; versao: Date; gatilho: GatilhoAutomacao } & DadosAutomacao): Promise<{ versao: Date }> {
  const antes = await travada(tx, p.criadorId, p.automacaoId, p.versao);
  if (antes.gatilho !== p.gatilho) throw new ErroDeNegocio("O gatilho não muda depois de criada: crie outra automação.");
  await conferir(tx, p.criadorId, p);
  const a = await gravar(tx, p, colunas(p));
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "atualizar", tabela: TABELA, registroId: p.automacaoId, detalhes: `Editou a automação "${p.nome}"`, dadosAnteriores: antes, dadosNovos: resumo(p) });
  return a;
}

export async function mudarSituacaoAutomacao(tx: Transacao, p: { criadorId: string; autor: string; automacaoId: string; versao: Date; situacao: SituacaoAutomacao }): Promise<{ versao: Date }> {
  const antes = await travada(tx, p.criadorId, p.automacaoId, p.versao);
  const a = await gravar(tx, p, { situacao: p.situacao });
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: p.automacaoId,
    detalhes: `${p.situacao === "ATIVA" ? "Ativou" : "Pausou"} a automação "${antes.nome}"`,
    dadosAnteriores: { situacao: antes.situacao },
    dadosNovos: { situacao: p.situacao },
  });
  return a;
}

/** Soft delete: o histórico fica; execuções ainda agendadas viram IGNORADA quando o job sair. */
export async function excluirAutomacao(tx: Transacao, p: { criadorId: string; autor: string; automacaoId: string; versao: Date }): Promise<void> {
  const antes = await travada(tx, p.criadorId, p.automacaoId, p.versao);
  const [a] = await tx.update(auto).set(marcaDeExclusao(p.autor)).where(and(travaDeColisao(auto, p.automacaoId, p.versao), eq(auto.criador_id, p.criadorId))).returning({ id: auto.id });
  if (!a) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "excluir", tabela: TABELA, registroId: p.automacaoId, detalhes: `Excluiu a automação "${antes.nome}"`, dadosAnteriores: antes });
}
