import "server-only";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { verificarEmissao } from "@/lib/certificados/emissao";
import { db } from "@/lib/db";
import type { FinalizacaoTentativa } from "@/lib/db/schema/_enums";
import { registrarConquista } from "@/lib/gamificacao/pontos";
import { criadores_membros, produtos_avaliacoes as av, produtos_avaliacoes_concessoes, produtos_avaliacoes_questoes as qst, produtos_avaliacoes_tentativas as tent } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { webhookAvaliacaoAprovada } from "@/lib/webhooks/emitir";
import { aprovou, corrigir, montarOrdem, prazoEstourado, TEXTO_MOTIVO_AVALIACAO } from "./regras";
import { situacoesDoMembro, type QuemAvalia } from "./situacao";

/**
 * Tentativas (RN-124): iniciar (uma aberta por vez; retomar a aberta), responder (autosave por
 * questão), finalizar (correção NO SERVIDOR) e conceder tentativa extra. Tempo limite conferido
 * no servidor: resposta depois do prazo não grava e a tentativa fecha com o que já tinha
 * (`TEMPO`). Sem job: a tentativa vencida fecha na próxima vez que alguém a toca.
 */

export interface QuemFaz extends QuemAvalia {
  membroId: string;
  /** Autor (`modified_by`). */
  usuarioId: string;
}

export const MSG_TENTATIVA_NAO_ENCONTRADA = "Tentativa não encontrada.";

/** Inicia ou RETOMA. `retomada` = já havia uma aberta (não conta como nova). */
export async function iniciarTentativa(quem: QuemFaz, avaliacaoId: string, agora: Date = new Date()): Promise<{ tentativaId: string; retomada: boolean }> {
  await finalizarVencidas(quem, agora, [avaliacaoId]);
  return db.transaction(async (tx) => {
    // Serializa o par (membro, avaliação): dois cliques em "Iniciar" = uma tentativa.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${quem.membroId}), hashtext(${avaliacaoId}))`);
    const [s] = await situacoesDoMembro(quem, { avaliacaoIds: [avaliacaoId] }, agora, tx);
    if (!s) throw new ErroDeNegocio("Avaliação não encontrada.");
    if (s.aberta) return { tentativaId: s.aberta.id, retomada: true };
    if (s.motivo) throw new ErroDeNegocio(`Não dá para iniciar: ${TEXTO_MOTIVO_AVALIACAO[s.motivo].toLowerCase()}.`);
    const questoes = await tx
      .select({ id: qst.id, tipo: qst.tipo, opcoes: qst.opcoes })
      .from(qst)
      .where(and(eq(qst.avaliacao_id, avaliacaoId), eq(qst.criador_id, quem.criadorId), vivos(qst)))
      .orderBy(asc(qst.ordem));
    if (questoes.length === 0) throw new ErroDeNegocio("Esta avaliação ainda não tem questões.");
    const [{ proximo }] = await tx
      .select({ proximo: sql<number>`coalesce(max(${tent.numero}), 0)::int + 1` })
      .from(tent)
      .where(and(eq(tent.avaliacao_id, avaliacaoId), eq(tent.membro_id, quem.membroId), vivos(tent)));
    const prazo = s.tempoLimiteMin ? new Date(agora.getTime() + s.tempoLimiteMin * 60_000) : null;
    const [t] = await tx
      .insert(tent)
      .values({
        criador_id: quem.criadorId,
        avaliacao_id: avaliacaoId,
        membro_id: quem.membroId,
        numero: proximo,
        iniciada_em: agora,
        prazo_em: prazo,
        ordem: montarOrdem(questoes, s.embaralhar),
        modified_by: quem.usuarioId,
      })
      .returning({ id: tent.id });
    await registrarAuditoria(tx, {
      userId: quem.usuarioId,
      criadorId: quem.criadorId,
      acao: "criar",
      tabela: "produtos_avaliacoes_tentativas",
      registroId: t.id,
      detalhes: `Iniciou a tentativa ${proximo} da avaliação "${s.titulo}"${prazo ? ` (prazo ${prazo.toISOString()})` : ""}`,
      dadosNovos: { avaliacao_id: avaliacaoId, numero: proximo, prazo_em: prazo },
    });
    return { tentativaId: t.id, retomada: false };
  });
}

/** Tentativa aberta DO membro (deste criador), ou erro. */
async function tentativaDoMembro(quem: QuemFaz, tentativaId: string) {
  const [t] = await db
    .select()
    .from(tent)
    .where(and(eq(tent.id, tentativaId), eq(tent.criador_id, quem.criadorId), eq(tent.membro_id, quem.membroId), vivos(tent)));
  if (!t) throw new ErroDeNegocio(MSG_TENTATIVA_NAO_ENCONTRADA);
  return t;
}

export type RespostaGravada = { situacao: "salva" } | { situacao: "encerrada"; tentativaId: string };

/**
 * Autosave de UMA questão (sem trilha: dado quente, como o progresso; a correção vai para a
 * trilha). Merge atômico no jsonb (`||`): duas questões salvas ao mesmo tempo não se perdem.
 * Prazo estourado ou já finalizada: `encerrada` (a tela vai para o resultado).
 */
export async function responder(quem: QuemFaz, e: { tentativaId: string; questaoId: string; opcoes: readonly string[] }, agora: Date = new Date()): Promise<RespostaGravada> {
  const t = await tentativaDoMembro(quem, e.tentativaId);
  if (t.finalizada_em) return { situacao: "encerrada", tentativaId: t.id };
  if (prazoEstourado(t.prazo_em, agora)) {
    await finalizarTentativa(quem, t.id, "TEMPO", agora);
    return { situacao: "encerrada", tentativaId: t.id };
  }
  const daOrdem = t.ordem.find((o) => o.q === e.questaoId);
  if (!daOrdem) throw new ErroDeNegocio("Questão não faz parte desta tentativa.");
  if (!e.opcoes.every((o) => daOrdem.o.includes(o))) throw new ErroDeNegocio("Opção inválida.");
  const [q] = await db.select({ tipo: qst.tipo }).from(qst).where(and(eq(qst.id, e.questaoId), eq(qst.criador_id, quem.criadorId), vivos(qst)));
  if (!q) throw new ErroDeNegocio("Esta questão foi removida da avaliação.");
  if (q.tipo !== "MULTIPLA" && e.opcoes.length > 1) throw new ErroDeNegocio("Marque só uma opção.");
  const gravou = await db
    .update(tent)
    .set({
      respostas: sql`${tent.respostas} || jsonb_build_object(${e.questaoId}::text, ${JSON.stringify(e.opcoes)}::jsonb)`,
      updated_at: agora,
      modified_by: quem.usuarioId,
    })
    .where(and(eq(tent.id, t.id), isNull(tent.finalizada_em), sql`(${tent.prazo_em} is null or ${tent.prazo_em} > ${agora})`))
    .returning({ id: tent.id });
  if (gravou.length) return { situacao: "salva" };
  // Fechou entre a leitura e a escrita (outra aba finalizou ou o prazo acabou).
  await finalizarTentativa(quem, t.id, "TEMPO", agora);
  return { situacao: "encerrada", tentativaId: t.id };
}

export interface TentativaCorrigida {
  tentativaId: string;
  nota: number;
  aprovada: boolean;
  finalizadaPor: FinalizacaoTentativa;
}

/**
 * Corrige e fecha. Idempotente: já finalizada devolve o resultado gravado. "Finalizar" depois do
 * prazo vira `TEMPO` (vale o que foi salvo até o prazo). Aprovou: confere o certificado depois do commit.
 */
export async function finalizarTentativa(quem: QuemFaz, tentativaId: string, por: FinalizacaoTentativa, agora: Date = new Date()): Promise<TentativaCorrigida> {
  const r = await db.transaction(async (tx) => {
    const [t] = await tx
      .select()
      .from(tent)
      .where(and(eq(tent.id, tentativaId), eq(tent.criador_id, quem.criadorId), eq(tent.membro_id, quem.membroId), vivos(tent)))
      .for("update");
    if (!t) throw new ErroDeNegocio(MSG_TENTATIVA_NAO_ENCONTRADA);
    if (t.finalizada_em) return { tentativaId: t.id, nota: t.nota!, aprovada: t.aprovada!, finalizadaPor: t.finalizada_por!, novo: false, produtoId: "", avaliacaoId: t.avaliacao_id, fim: t.finalizada_em };
    const [a] = await tx.select({ titulo: av.titulo, notaMinima: av.nota_minima, produtoId: av.produto_id }).from(av).where(eq(av.id, t.avaliacao_id));
    const ids = t.ordem.map((o) => o.q);
    const questoes = ids.length
      ? await tx.select({ id: qst.id, tipo: qst.tipo, gabarito: qst.gabarito, peso: qst.peso }).from(qst).where(and(inArray(qst.id, ids), eq(qst.criador_id, quem.criadorId), vivos(qst)))
      : [];
    const { nota, correcao } = corrigir(questoes, t.respostas);
    const aprovada = aprovou(nota, a.notaMinima);
    const finalizadaPor: FinalizacaoTentativa = prazoEstourado(t.prazo_em, agora) ? "TEMPO" : por;
    // No prazo estourado a hora de fim registrada é o próprio prazo.
    const fim = finalizadaPor === "TEMPO" && t.prazo_em && t.prazo_em < agora ? t.prazo_em : agora;
    await tx
      .update(tent)
      .set({ finalizada_em: fim, finalizada_por: finalizadaPor, nota, aprovada, correcao, updated_at: agora, modified_by: quem.usuarioId })
      .where(eq(tent.id, t.id));
    await registrarAuditoria(tx, {
      userId: quem.usuarioId,
      criadorId: quem.criadorId,
      acao: "atualizar",
      tabela: "produtos_avaliacoes_tentativas",
      registroId: t.id,
      detalhes: `Tentativa ${t.numero} de "${a.titulo}" finalizada (${finalizadaPor === "TEMPO" ? "tempo esgotado" : "pelo aluno"}): nota ${nota} — ${aprovada ? "aprovada" : "reprovada"}`,
      dadosNovos: { nota, aprovada, finalizada_por: finalizadaPor, acertos: correcao.filter((c) => c.correta).length, questoes: correcao.length },
    });
    return { tentativaId: t.id, nota, aprovada, finalizadaPor, novo: true, produtoId: a.produtoId, avaliacaoId: t.avaliacao_id, fim };
  });
  if (r.novo && r.aprovada) {
    // Pontos da 1ª aprovação (razão idempotente por avaliação; nunca lança) — ADR-0012.
    await registrarConquista({ criadorId: quem.criadorId, membroId: quem.membroId, conquista: { motivo: "AVALIACAO_APROVADA", avaliacaoId: r.avaliacaoId }, ocorridoEm: r.fim });
    await webhookAvaliacaoAprovada(quem.criadorId, quem.membroId, r.avaliacaoId, r.nota); // nunca lança (RN-204)
    await verificarEmissao(quem.criadorId, quem.membroId, r.produtoId);
  }
  return { tentativaId: r.tentativaId, nota: r.nota, aprovada: r.aprovada, finalizadaPor: r.finalizadaPor };
}

/** Fecha (TEMPO) as tentativas abertas do membro cujo prazo já passou. Chamado antes de ler. */
export async function finalizarVencidas(quem: QuemFaz, agora: Date = new Date(), avaliacaoIds?: readonly string[]): Promise<number> {
  const vencidas = await db
    .select({ id: tent.id })
    .from(tent)
    .where(
      and(
        eq(tent.criador_id, quem.criadorId),
        eq(tent.membro_id, quem.membroId),
        vivos(tent),
        isNull(tent.finalizada_em),
        lte(tent.prazo_em, agora),
        avaliacaoIds ? inArray(tent.avaliacao_id, [...avaliacaoIds]) : undefined,
      ),
    );
  for (const v of vencidas) await finalizarTentativa(quem, v.id, "TEMPO", agora);
  return vencidas.length;
}

/** +N tentativas para um membro (equipe). Avaliação ilimitada não precisa. */
export async function concederTentativa(
  e: { criadorId: string; autorId: string; avaliacaoId: string; membroId: string; quantidade: number; motivo: string },
): Promise<{ concessaoId: string }> {
  return db.transaction(async (tx) => {
    const [a] = await tx
      .select({ titulo: av.titulo, max: av.tentativas_max })
      .from(av)
      .where(and(eq(av.id, e.avaliacaoId), eq(av.criador_id, e.criadorId), vivos(av)));
    if (!a) throw new ErroDeNegocio("Avaliação não encontrada.");
    if (a.max === 0) throw new ErroDeNegocio("Esta avaliação já tem tentativas ilimitadas.");
    // Membro de outra área "não existe" aqui (e a FK composta recusaria de todo jeito).
    const [m] = await tx
      .select({ id: criadores_membros.id })
      .from(criadores_membros)
      .where(and(eq(criadores_membros.id, e.membroId), eq(criadores_membros.criador_id, e.criadorId), vivos(criadores_membros)));
    if (!m) throw new ErroDeNegocio("Membro não encontrado.");
    const [c] = await tx
      .insert(produtos_avaliacoes_concessoes)
      .values({ criador_id: e.criadorId, avaliacao_id: e.avaliacaoId, membro_id: e.membroId, quantidade: e.quantidade, motivo: e.motivo, modified_by: e.autorId })
      .returning({ id: produtos_avaliacoes_concessoes.id });
    await registrarAuditoria(tx, {
      userId: e.autorId,
      criadorId: e.criadorId,
      acao: "criar",
      tabela: "produtos_avaliacoes_concessoes",
      registroId: c.id,
      detalhes: `Concedeu +${e.quantidade} tentativa(s) em "${a.titulo}" ao membro ${e.membroId}: ${e.motivo}`,
      dadosNovos: { avaliacao_id: e.avaliacaoId, membro_id: e.membroId, quantidade: e.quantidade, motivo: e.motivo },
    });
    return { concessaoId: c.id };
  });
}
