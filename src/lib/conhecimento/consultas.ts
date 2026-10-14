import "server-only";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import type { FonteConhecimento } from "@/lib/db/schema/_enums";
import { FONTES_CONHECIMENTO } from "@/lib/db/schema/_enums";
import { criadores_conhecimento_documentos as documentos, produtos, produtos_modulos as modulos, produtos_modulos_aulas as aulas } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

/**
 * Leituras da tela Base de conhecimento (equipe). Só documentos vivos deste criador cuja fonte ainda
 * existe (aula/curso removidos somem da lista e da busca — a reindexação os exclui depois).
 */

export interface FonteDaLista {
  id: string;
  fonte: FonteConhecimento;
  titulo: string;
  curso: string | null;
  trechos: number;
  atualizadoEm: Date;
  incluir: boolean;
  versao: string;
}

export const lerFiltroFonte = (v: unknown): FonteConhecimento | null => (typeof v === "string" && (FONTES_CONHECIMENTO as readonly string[]).includes(v) ? (v as FonteConhecimento) : null);

export async function fontesDoCriador(criadorId: string, filtro: { fonte: FonteConhecimento | null; produtoId: string | null }): Promise<FonteDaLista[]> {
  const produtoDoDoc = sql`coalesce(${modulos.produto_id}, ${documentos.produto_id})`;
  const condicoes: SQL[] = [eq(documentos.criador_id, criadorId), vivos(documentos), sql`(${documentos.aula_id} is null or ${modulos.id} is not null)`];
  if (filtro.fonte) condicoes.push(eq(documentos.fonte, filtro.fonte));
  if (filtro.produtoId) condicoes.push(sql`${produtoDoDoc} = ${filtro.produtoId}::uuid`);
  const l = await db
    .select({
      id: documentos.id,
      fonte: documentos.fonte,
      titulo: documentos.titulo,
      curso: produtos.titulo,
      trechos: documentos.trechos,
      indexadoEm: documentos.indexado_em,
      updatedAt: documentos.updated_at,
      incluir: documentos.incluir,
      produtoVivo: produtos.id,
    })
    .from(documentos)
    .leftJoin(aulas, and(eq(aulas.id, documentos.aula_id), vivos(aulas)))
    .leftJoin(modulos, and(eq(modulos.id, aulas.modulo_id), vivos(modulos)))
    .leftJoin(produtos, and(sql`${produtos.id} = ${produtoDoDoc}`, eq(produtos.criador_id, criadorId), vivos(produtos)))
    .where(and(...condicoes))
    .orderBy(asc(documentos.fonte), asc(produtos.titulo), asc(documentos.titulo))
    .limit(500);
  return l
    .filter((d) => d.fonte === "TEXTO" || d.produtoVivo)
    .map((d) => ({
      id: d.id,
      fonte: d.fonte,
      titulo: d.titulo,
      curso: d.curso,
      trechos: d.trechos,
      atualizadoEm: d.indexadoEm && d.indexadoEm > d.updatedAt ? d.indexadoEm : d.updatedAt,
      incluir: d.incluir,
      versao: d.updatedAt.toISOString(),
    }));
}

/** Contagem por tipo (abas/estatística). */
export async function totaisDaBase(criadorId: string) {
  const l = await db
    .select({ fonte: documentos.fonte, n: sql<number>`count(*)::int`, trechos: sql<number>`coalesce(sum(${documentos.trechos}), 0)::int` })
    .from(documentos)
    .where(and(eq(documentos.criador_id, criadorId), vivos(documentos), eq(documentos.incluir, true)))
    .groupBy(documentos.fonte);
  return { documentos: l.reduce((s, x) => s + x.n, 0), trechos: l.reduce((s, x) => s + x.trechos, 0) };
}

/** Texto da equipe para o editor (`null` = não existe neste criador). */
export async function textoParaEditar(criadorId: string, documentoId: string) {
  const [d] = await db
    .select({ id: documentos.id, titulo: documentos.titulo, texto: documentos.texto, produtoId: documentos.produto_id, trechos: documentos.trechos, incluir: documentos.incluir, versao: documentos.updated_at })
    .from(documentos)
    .where(and(eq(documentos.id, documentoId), eq(documentos.criador_id, criadorId), eq(documentos.fonte, "TEXTO"), vivos(documentos)));
  return d ? { ...d, versao: d.versao.toISOString() } : null;
}

/** Cursos vivos do criador (filtro, "só deste curso", cursos do assistente). */
export async function cursosDoCriador(criadorId: string): Promise<{ id: string; titulo: string }[]> {
  return db
    .select({ id: produtos.id, titulo: produtos.titulo })
    .from(produtos)
    .where(and(eq(produtos.criador_id, criadorId), vivos(produtos)))
    .orderBy(desc(produtos.updated_at))
    .limit(200);
}
