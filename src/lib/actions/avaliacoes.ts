"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { concederTentativa } from "@/lib/avaliacoes/tentativas";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { compactar, proximaOrdem, QUESTOES, reordenar } from "@/lib/catalogo/ordem";
import { db, type Transacao } from "@/lib/db";
import { criadores_trilhas_itens, produtos, produtos_avaliacoes as av, produtos_avaliacoes_questoes as qst, produtos_modulos } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import {
  camposAvaliacaoSchema,
  concederTentativaSchema,
  criarAvaliacaoSchema,
  criarQuestaoSchema,
  idSchema,
  removerQuestaoSchema,
  reordenarQuestoesSchema,
  salvarAvaliacaoSchema,
  salvarQuestaoSchema,
  situacaoAvaliacaoSchema,
  versaoSchema,
} from "@/lib/validators/avaliacoes";

/**
 * Avaliações — equipe (DONO e ADMIN, criador do HOST): CRUD da avaliação e das questões (ordem
 * 1..n com trava), publicar (exige ≥ 1 questão) e conceder tentativa. Campo a campo, trava de
 * colisão e trilha antes → depois em toda escrita. RN-123 a RN-125.
 */

const NAO_ENCONTRADA = "Avaliação não encontrada nesta área. Recarregue a página.";
type Campos = z.infer<typeof camposAvaliacaoSchema>;

/** Colunas da avaliação a partir dos campos da tela (nada além disto vem do corpo). */
const colunas = (c: Campos) => ({
  titulo: c.titulo,
  tipo: c.tipo,
  modulo_id: c.moduloId,
  instrucoes: c.instrucoes,
  nota_minima: c.notaMinima,
  tentativas_max: c.tentativasMax,
  tempo_limite_min: c.tempoLimiteMin,
  obrigatoria_para_certificado: c.obrigatoriaParaCertificado,
  libera_proximo_modulo: c.liberaProximoModulo,
  embaralhar: c.embaralhar,
  exige_aulas_concluidas: c.exigeAulasConcluidas,
});

type Questao = z.infer<typeof criarQuestaoSchema>["questao"];
const colunasQuestao = (q: Questao) => ({ tipo: q.tipo, enunciado: q.enunciado, opcoes: q.opcoes, gabarito: q.gabarito, peso: q.peso, explicacao: q.explicacao });

/** Só o que mudou, antes e depois (trilha). */
function diferenca<T extends Record<string, unknown>>(antes: T, depois: Partial<T>) {
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(depois)) if (JSON.stringify(antes[k]) !== JSON.stringify(v)) [a[k], d[k]] = [antes[k], v];
  return { antes: a, depois: d };
}

async function conferirModulo(tx: Transacao, criadorId: string, produtoId: string, moduloId: string | null) {
  if (!moduloId) return;
  const [m] = await tx
    .select({ id: produtos_modulos.id })
    .from(produtos_modulos)
    .where(and(eq(produtos_modulos.id, moduloId), eq(produtos_modulos.produto_id, produtoId), eq(produtos_modulos.criador_id, criadorId), vivos(produtos_modulos)));
  if (!m) throw new ErroDeNegocio("Módulo não encontrado neste curso.");
}

/** Avaliação viva deste criador, travada (pai das questões). */
async function travarAvaliacao(tx: Transacao, criadorId: string, avaliacaoId: string) {
  const [a] = await tx
    .select()
    .from(av)
    .where(and(eq(av.id, avaliacaoId), eq(av.criador_id, criadorId), vivos(av)))
    .for("update");
  if (!a) throw new ErroDeNegocio(NAO_ENCONTRADA);
  return a;
}

export async function acaoCriarAvaliacao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = criarAvaliacaoSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const [p] = await tx.select({ titulo: produtos.titulo }).from(produtos).where(and(eq(produtos.id, e.produtoId), eq(produtos.criador_id, criador.id), vivos(produtos)));
      if (!p) throw new ErroDeNegocio("Curso não encontrado nesta área.");
      await conferirModulo(tx, criador.id, e.produtoId, e.campos.moduloId);
      const [a] = await tx
        .insert(av)
        .values({ criador_id: criador.id, produto_id: e.produtoId, ...colunas(e.campos), modified_by: usuario.id })
        .returning({ id: av.id, updated_at: av.updated_at });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "criar",
        tabela: "produtos_avaliacoes",
        registroId: a.id,
        detalhes: `Criou a avaliação "${e.campos.titulo}" em "${p.titulo}" (rascunho)`,
        dadosNovos: { produto_id: e.produtoId, ...colunas(e.campos) },
      });
      return { id: a.id, versao: a.updated_at.toISOString() };
    });
  });
}

export async function acaoSalvarAvaliacao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = salvarAvaliacaoSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const atual = await travarAvaliacao(tx, criador.id, e.avaliacaoId);
      await conferirModulo(tx, criador.id, atual.produto_id, e.campos.moduloId);
      const novo = colunas(e.campos);
      const [l] = await tx
        .update(av)
        .set({ ...novo, updated_at: new Date(), modified_by: usuario.id })
        .where(and(travaDeColisao(av, e.avaliacaoId, e.versao), eq(av.criador_id, criador.id)))
        .returning({ updated_at: av.updated_at });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      const d = diferenca(atual as unknown as Record<string, unknown>, novo);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "produtos_avaliacoes",
        registroId: atual.id,
        detalhes: `Editou a avaliação "${atual.titulo}" (${Object.keys(d.depois).join(", ") || "sem mudança"})`,
        dadosAnteriores: d.antes,
        dadosNovos: d.depois,
      });
      return { versao: l.updated_at.toISOString() };
    });
  });
}

/** Publicar (exige ≥ 1 questão) ou voltar para rascunho (some da tela do aluno). */
export async function acaoAlterarSituacaoAvaliacao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = situacaoAvaliacaoSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const atual = await travarAvaliacao(tx, criador.id, e.avaliacaoId);
      if (e.status === "PUBLICADA") {
        const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(qst).where(and(eq(qst.avaliacao_id, atual.id), vivos(qst)));
        if (n === 0) throw new ErroDeNegocio("Para publicar, cadastre ao menos 1 questão.");
      }
      const agora = new Date();
      const [l] = await tx
        .update(av)
        .set({ status: e.status, publicada_em: e.status === "PUBLICADA" ? (atual.publicada_em ?? agora) : atual.publicada_em, updated_at: agora, modified_by: usuario.id })
        .where(and(travaDeColisao(av, e.avaliacaoId, e.versao), eq(av.criador_id, criador.id)))
        .returning({ updated_at: av.updated_at });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "publicar",
        tabela: "produtos_avaliacoes",
        registroId: atual.id,
        detalhes: `Avaliação "${atual.titulo}": ${atual.status} → ${e.status}`,
        dadosAnteriores: { status: atual.status },
        dadosNovos: { status: e.status },
      });
      return { versao: l.updated_at.toISOString() };
    });
  });
}

/** Soft delete da avaliação e das questões. Recusa se estiver numa trilha (tire de lá antes). */
export async function acaoRemoverAvaliacao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ avaliacaoId: idSchema, versao: versaoSchema }).parse(entrada);
    await db.transaction(async (tx) => {
      const atual = await travarAvaliacao(tx, criador.id, e.avaliacaoId);
      const [naTrilha] = await tx
        .select({ id: criadores_trilhas_itens.id })
        .from(criadores_trilhas_itens)
        .where(and(eq(criadores_trilhas_itens.avaliacao_id, atual.id), vivos(criadores_trilhas_itens)))
        .limit(1);
      if (naTrilha) throw new ErroDeNegocio("Esta avaliação está numa trilha. Tire-a da trilha antes.");
      const [l] = await tx
        .update(av)
        .set(marcaDeExclusao(usuario.id))
        .where(and(travaDeColisao(av, e.avaliacaoId, e.versao), eq(av.criador_id, criador.id)))
        .returning({ id: av.id });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      const q = await tx.update(qst).set(marcaDeExclusao(usuario.id)).where(and(eq(qst.avaliacao_id, atual.id), vivos(qst))).returning({ id: qst.id });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "excluir",
        tabela: "produtos_avaliacoes",
        registroId: atual.id,
        detalhes: `Removeu a avaliação "${atual.titulo}" com ${q.length} questão(ões) (exclusão lógica; tentativas ficam no histórico)`,
        dadosAnteriores: { titulo: atual.titulo, status: atual.status },
      });
    });
    return null;
  });
}

export async function acaoCriarQuestao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = criarQuestaoSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const a = await travarAvaliacao(tx, criador.id, e.avaliacaoId);
      const ordem = await proximaOrdem(tx, QUESTOES, a.id, criador.id);
      const [q] = await tx
        .insert(qst)
        .values({ criador_id: criador.id, avaliacao_id: a.id, ordem, ...colunasQuestao(e.questao), modified_by: usuario.id })
        .returning({ id: qst.id, updated_at: qst.updated_at });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "criar",
        tabela: "produtos_avaliacoes_questoes",
        registroId: q.id,
        detalhes: `Criou a questão ${ordem} da avaliação "${a.titulo}"`,
        dadosNovos: { ordem, ...colunasQuestao(e.questao) },
      });
      return { id: q.id, versao: q.updated_at.toISOString() };
    });
  });
}

export async function acaoSalvarQuestao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = salvarQuestaoSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const [alvo] = await tx.select({ avaliacaoId: qst.avaliacao_id }).from(qst).where(and(eq(qst.id, e.questaoId), eq(qst.criador_id, criador.id), vivos(qst)));
      if (!alvo) throw new ErroDeNegocio(MSG_COLISAO);
      const a = await travarAvaliacao(tx, criador.id, alvo.avaliacaoId);
      const [antes] = await tx.select().from(qst).where(eq(qst.id, e.questaoId));
      const [l] = await tx
        .update(qst)
        .set({ ...colunasQuestao(e.questao), updated_at: new Date(), modified_by: usuario.id })
        .where(and(travaDeColisao(qst, e.questaoId, e.versao), eq(qst.criador_id, criador.id)))
        .returning({ updated_at: qst.updated_at });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      const d = diferenca(antes as unknown as Record<string, unknown>, colunasQuestao(e.questao));
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "produtos_avaliacoes_questoes",
        registroId: e.questaoId,
        detalhes: `Editou a questão ${antes.ordem} de "${a.titulo}" (${Object.keys(d.depois).join(", ") || "sem mudança"})`,
        dadosAnteriores: d.antes,
        dadosNovos: d.depois,
      });
      return { versao: l.updated_at.toISOString() };
    });
  });
}

/** Remove (soft delete) e fecha o buraco. Avaliação publicada não fica sem questão. */
export async function acaoRemoverQuestao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = removerQuestaoSchema.parse(entrada);
    await db.transaction(async (tx) => {
      const [alvo] = await tx.select({ avaliacaoId: qst.avaliacao_id }).from(qst).where(and(eq(qst.id, e.questaoId), eq(qst.criador_id, criador.id), vivos(qst)));
      if (!alvo) throw new ErroDeNegocio(MSG_COLISAO);
      const a = await travarAvaliacao(tx, criador.id, alvo.avaliacaoId);
      const [l] = await tx
        .update(qst)
        .set(marcaDeExclusao(usuario.id))
        .where(and(travaDeColisao(qst, e.questaoId, e.versao), eq(qst.criador_id, criador.id)))
        .returning({ ordem: qst.ordem, enunciado: qst.enunciado });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(qst).where(and(eq(qst.avaliacao_id, a.id), vivos(qst)));
      if (n === 0 && a.status === "PUBLICADA") throw new ErroDeNegocio("Avaliação publicada precisa de ao menos 1 questão. Volte-a para rascunho antes.");
      await compactar(tx, QUESTOES, a.id, criador.id);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "excluir",
        tabela: "produtos_avaliacoes_questoes",
        registroId: e.questaoId,
        detalhes: `Removeu a questão ${l.ordem} de "${a.titulo}" (exclusão lógica)`,
        dadosAnteriores: l,
      });
    });
    return null;
  });
}

export async function acaoReordenarQuestoes(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = reordenarQuestoesSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const a = await travarAvaliacao(tx, criador.id, e.avaliacaoId);
      const r = await reordenar(tx, QUESTOES, { paiId: a.id, criadorId: criador.id, autorId: usuario.id, itens: e.itens });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "reordenar",
        tabela: "produtos_avaliacoes_questoes",
        registroId: a.id,
        detalhes: `Reordenou as questões de "${a.titulo}"`,
        dadosAnteriores: { ordem: r.antes },
        dadosNovos: { ordem: r.depois },
      });
      return { versao: r.versao.toISOString() };
    });
  });
}

/** +N tentativas a um aluno que esgotou sem aprovar (trilha com o motivo). */
export async function acaoConcederTentativa(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = concederTentativaSchema.parse(entrada);
    return concederTentativa({ criadorId: criador.id, autorId: usuario.id, avaliacaoId: e.avaliacaoId, membroId: e.membroId, quantidade: e.quantidade, motivo: e.motivo });
  });
}
