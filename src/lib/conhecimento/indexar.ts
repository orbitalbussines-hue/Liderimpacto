import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, type Transacao } from "@/lib/db";
import type { FonteConhecimento } from "@/lib/db/schema/_enums";
import {
  criadores_conhecimento_documentos as documentos,
  criadores_conhecimento_documentos_trechos as trechos,
  produtos,
  produtos_modulos as modulos,
  produtos_modulos_aulas as aulas,
  produtos_modulos_aulas_legendas as legendas,
} from "@/lib/db/schema";
import { marcaDeExclusao, vivos } from "@/lib/db/soft-delete";
import { decodificarLegenda, LIMITES_LEGENDA, lerLegenda } from "@/lib/legendas/regras";
import { lerObjetoLimitado } from "@/lib/legendas/servico";
import { dividirEmTrechos, dividirTranscricao, type TrechoGerado } from "./regras";

/**
 * Indexação da base (ADR-0014 item 2). IDEMPOTENTE: os trechos novos são comparados pela
 * `assinatura` (sha256) e só se a fonte mudou o documento troca de trechos (soft delete dos velhos +
 * inserção). Um `pg_advisory_xact_lock` por (fonte, alvo) serializa duas reindexações da mesma
 * fonte. Fontes derivadas (transcrição/descrição de aula, descrição de curso) são reconstruídas a
 * partir do catálogo; a fonte sumiu (aula removida, legenda removida, descrição vazia) = documento
 * excluído (lógico).
 */

export type AlvoIndexacao = { tipo: "AULA"; aulaId: string } | { tipo: "PRODUTO"; produtoId: string } | { tipo: "TEXTO"; documentoId: string };

export type ResultadoIndexacao = "criado" | "atualizado" | "igual" | "removido" | "ausente";

const assinar = (titulo: string, t: readonly TrechoGerado[]) => createHash("sha256").update(JSON.stringify([titulo, t])).digest("hex");

async function travar(tx: Transacao, chave: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`conhecimento:${chave}`}, 0))`);
}

/** Troca os trechos do documento (já travado) se a assinatura mudou. */
async function gravarTrechos(tx: Transacao, doc: { id: string; criadorId: string; assinatura: string }, titulo: string, gerados: readonly TrechoGerado[], autorId: string): Promise<boolean> {
  const assinatura = assinar(titulo, gerados);
  if (assinatura === doc.assinatura) return false;
  await tx
    .update(trechos)
    .set(marcaDeExclusao(autorId))
    .where(and(eq(trechos.documento_id, doc.id), eq(trechos.criador_id, doc.criadorId), vivos(trechos)));
  if (gerados.length) {
    await tx.insert(trechos).values(gerados.map((g, i) => ({ criador_id: doc.criadorId, documento_id: doc.id, ordem: i, texto: g.texto, inicio_seg: g.inicioSeg, modified_by: autorId })));
  }
  // Campos de SISTEMA: `updated_at` fica com a action (trava de colisão da tela).
  await tx.update(documentos).set({ assinatura, trechos: gerados.length, indexado_em: new Date() }).where(eq(documentos.id, doc.id));
  return true;
}

interface FonteDerivada {
  criadorId: string;
  fonte: Exclude<FonteConhecimento, "TEXTO">;
  aulaId: string | null;
  produtoId: string | null;
  /** `null` = a fonte não existe mais (exclui o documento). */
  conteudo: { titulo: string; texto: string; trechos: TrechoGerado[] } | null;
  autorId: string;
}

async function sincronizarDerivada(f: FonteDerivada): Promise<ResultadoIndexacao> {
  return db.transaction(async (tx) => {
    await travar(tx, `${f.fonte}:${f.aulaId ?? f.produtoId}`);
    const alvo = f.aulaId ? eq(documentos.aula_id, f.aulaId) : eq(documentos.produto_id, f.produtoId!);
    const [doc] = await tx
      .select({ id: documentos.id, assinatura: documentos.assinatura, titulo: documentos.titulo })
      .from(documentos)
      .where(and(eq(documentos.criador_id, f.criadorId), eq(documentos.fonte, f.fonte), alvo, vivos(documentos)));
    if (!f.conteudo || !f.conteudo.trechos.length) {
      if (!doc) return "ausente";
      await tx.update(documentos).set(marcaDeExclusao(f.autorId)).where(eq(documentos.id, doc.id));
      await tx.update(trechos).set(marcaDeExclusao(f.autorId)).where(and(eq(trechos.documento_id, doc.id), vivos(trechos)));
      return "removido";
    }
    const c = f.conteudo;
    if (!doc) {
      const [novo] = await tx
        .insert(documentos)
        .values({ criador_id: f.criadorId, fonte: f.fonte, aula_id: f.aulaId, produto_id: f.produtoId, titulo: c.titulo, texto: c.texto, modified_by: f.autorId })
        .returning({ id: documentos.id });
      await gravarTrechos(tx, { id: novo.id, criadorId: f.criadorId, assinatura: "" }, c.titulo, c.trechos, f.autorId);
      return "criado";
    }
    if (doc.titulo !== c.titulo) await tx.update(documentos).set({ titulo: c.titulo }).where(eq(documentos.id, doc.id));
    const mudou = await gravarTrechos(tx, { id: doc.id, criadorId: f.criadorId, assinatura: doc.assinatura }, c.titulo, c.trechos, f.autorId);
    if (mudou) await tx.update(documentos).set({ texto: c.texto }).where(eq(documentos.id, doc.id));
    return mudou ? "atualizado" : "igual";
  });
}

/**
 * Falas com tempo da legenda viva: relê o `.vtt` normalizado do storage (o banco só tem o texto,
 * ADR-0013 item 7). Storage fora do ar = cai para o `texto` (uma fala por linha, sem tempo).
 */
async function falasDaLegenda(criadorId: string, l: { chave: string; texto: string }): Promise<{ inicio: number; texto: string }[] | null> {
  try {
    const vtt = await lerObjetoLimitado(criadorId, l.chave, 2 * LIMITES_LEGENDA.bytes);
    return lerLegenda(decodificarLegenda(vtt)).map((t) => ({ inicio: t.inicio, texto: t.texto }));
  } catch (e) {
    console.error("[conhecimento] .vtt não lido; indexando o texto sem tempos:", l.chave, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Descrição e transcrição de UMA aula. Aula removida = os dois documentos saem. */
export async function sincronizarAula(criadorId: string, aulaId: string, autorId: string): Promise<{ descricao: ResultadoIndexacao; transcricao: ResultadoIndexacao }> {
  const [a] = await db
    .select({ titulo: aulas.titulo, descricao: aulas.descricao, modulo: modulos.titulo })
    .from(aulas)
    .innerJoin(modulos, and(eq(modulos.id, aulas.modulo_id), vivos(modulos)))
    .innerJoin(produtos, and(eq(produtos.id, modulos.produto_id), vivos(produtos)))
    .where(and(eq(aulas.id, aulaId), eq(aulas.criador_id, criadorId), vivos(aulas)));
  const base = { criadorId, aulaId, produtoId: null, autorId };
  const desc = a?.descricao.trim() ?? "";
  const descricao = await sincronizarDerivada({
    ...base,
    fonte: "AULA_DESCRICAO",
    conteudo: a && desc ? { titulo: a.titulo, texto: desc, trechos: dividirEmTrechos(desc).map((texto) => ({ texto, inicioSeg: null })) } : null,
  });

  // Uma transcrição por aula: português primeiro, senão a legenda viva mais antiga.
  const [l] = a
    ? await db
        .select({ chave: legendas.chave, texto: legendas.texto })
        .from(legendas)
        .where(and(eq(legendas.aula_id, aulaId), eq(legendas.criador_id, criadorId), vivos(legendas)))
        .orderBy(sql`case when ${legendas.idioma} = 'pt-BR' then 0 when ${legendas.idioma} like 'pt%' then 1 else 2 end`, asc(legendas.created_at))
        .limit(1)
    : [];
  let conteudo: FonteDerivada["conteudo"] = null;
  if (a && l) {
    const falas = (await falasDaLegenda(criadorId, l)) ?? l.texto.split("\n").map((texto) => ({ inicio: 0, texto }));
    const comTempo = falas.some((f) => f.inicio > 0);
    const gerados = dividirTranscricao(falas).map((t) => (comTempo ? t : { ...t, inicioSeg: null }));
    conteudo = { titulo: a.titulo, texto: l.texto, trechos: gerados };
  }
  const transcricao = await sincronizarDerivada({ ...base, fonte: "AULA_TRANSCRICAO", conteudo });
  return { descricao, transcricao };
}

/** Descrição de UM curso. Curso removido ou sem descrição = documento sai. */
export async function sincronizarProduto(criadorId: string, produtoId: string, autorId: string): Promise<ResultadoIndexacao> {
  const [p] = await db
    .select({ titulo: produtos.titulo, descricao: produtos.descricao })
    .from(produtos)
    .where(and(eq(produtos.id, produtoId), eq(produtos.criador_id, criadorId), vivos(produtos)));
  const desc = p?.descricao.trim() ?? "";
  return sincronizarDerivada({
    criadorId,
    fonte: "PRODUTO_DESCRICAO",
    aulaId: null,
    produtoId,
    autorId,
    conteudo: p && desc ? { titulo: p.titulo, texto: desc, trechos: dividirEmTrechos(desc).map((texto) => ({ texto, inicioSeg: null })) } : null,
  });
}

/**
 * Trechos de um TEXTO da equipe, dentro da transação da action (texto puro, sem I/O: síncrono e a
 * "Testar busca" já enxerga o que acabou de ser salvo).
 */
export async function indexarTexto(tx: Transacao, doc: { id: string; criadorId: string; titulo: string; texto: string }, autorId: string): Promise<void> {
  await travar(tx, `TEXTO:${doc.id}`);
  const [atual] = await tx.select({ assinatura: documentos.assinatura }).from(documentos).where(eq(documentos.id, doc.id));
  const gerados = dividirEmTrechos(doc.texto).map((texto) => ({ texto, inicioSeg: null }));
  await gravarTrechos(tx, { id: doc.id, criadorId: doc.criadorId, assinatura: atual?.assinatura ?? "" }, doc.titulo, gerados, autorId);
}

/** Um alvo (o job da fila e o caminho síncrono de reserva chamam isto). */
export async function sincronizar(criadorId: string, alvo: AlvoIndexacao, autorId: string): Promise<string> {
  if (alvo.tipo === "AULA") {
    const r = await sincronizarAula(criadorId, alvo.aulaId, autorId);
    return `descrição ${r.descricao}, transcrição ${r.transcricao}`;
  }
  if (alvo.tipo === "PRODUTO") return `descrição do curso ${await sincronizarProduto(criadorId, alvo.produtoId, autorId)}`;
  const [d] = await db
    .select({ id: documentos.id, titulo: documentos.titulo, texto: documentos.texto })
    .from(documentos)
    .where(and(eq(documentos.id, alvo.documentoId), eq(documentos.criador_id, criadorId), eq(documentos.fonte, "TEXTO"), vivos(documentos)));
  if (!d) return "ausente";
  await db.transaction((tx) => indexarTexto(tx, { id: d.id, criadorId, titulo: d.titulo, texto: d.texto }, autorId));
  return "texto conferido";
}

/**
 * Reindexa o criador INTEIRO (script `npm run conhecimento:reindexar -- <slug>`): todas as aulas e
 * cursos vivos, os textos da equipe e a limpeza dos documentos de aula/curso removidos. Idempotente.
 */
export async function reindexarCriador(criadorId: string, autorId: string): Promise<Record<ResultadoIndexacao, number>> {
  const contagem: Record<ResultadoIndexacao, number> = { criado: 0, atualizado: 0, igual: 0, removido: 0, ausente: 0 };
  const listaAulas = await db.select({ id: aulas.id }).from(aulas).where(and(eq(aulas.criador_id, criadorId), vivos(aulas)));
  // Documentos cuja aula/curso sumiu: a sincronização do alvo os exclui.
  const orfaos = await db
    .select({ aulaId: documentos.aula_id, produtoId: documentos.produto_id, fonte: documentos.fonte })
    .from(documentos)
    .where(and(eq(documentos.criador_id, criadorId), vivos(documentos)));
  const idsAulas = new Set([...listaAulas.map((a) => a.id), ...orfaos.flatMap((o) => (o.aulaId ? [o.aulaId] : []))]);
  for (const id of idsAulas) {
    const r = await sincronizarAula(criadorId, id, autorId);
    contagem[r.descricao]++;
    contagem[r.transcricao]++;
  }
  const listaProdutos = await db.select({ id: produtos.id }).from(produtos).where(and(eq(produtos.criador_id, criadorId), vivos(produtos)));
  const idsProdutos = new Set([...listaProdutos.map((p) => p.id), ...orfaos.flatMap((o) => (o.fonte === "PRODUTO_DESCRICAO" && o.produtoId ? [o.produtoId] : []))]);
  for (const id of idsProdutos) contagem[await sincronizarProduto(criadorId, id, autorId)]++;
  const textos = await db
    .select({ id: documentos.id })
    .from(documentos)
    .where(and(eq(documentos.criador_id, criadorId), eq(documentos.fonte, "TEXTO"), vivos(documentos)));
  for (const t of textos) await sincronizar(criadorId, { tipo: "TEXTO", documentoId: t.id }, autorId);
  return contagem;
}
