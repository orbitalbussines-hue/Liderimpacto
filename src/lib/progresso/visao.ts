import "server-only";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import { db } from "@/lib/db";
import { criadores_membros_favoritos as fav, produtos, produtos_matriculas, produtos_modulos, produtos_modulos_aulas } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { valeAgora } from "@/lib/matriculas/consultas";

/**
 * Peças comuns das consultas do aluno (consultas.ts e consultas-curso.ts). `QuemPede` é o que
 * `membroDaPagina(TODOS_OS_MEMBROS)` devolve (passe o objeto inteiro): criador do HOST e membro
 * da sessão, nunca de parâmetro de URL.
 */
export interface QuemPede {
  usuario: { id: string };
  criador: { id: string };
  /** `id` nulo = SUPER_ADMIN sem vínculo (suporte): vê tudo liberado, sem progresso próprio. */
  membro: { id: string | null; papel: PapelCriador };
}

/** DONO/ADMIN (e SUPER_ADMIN): sem filtro de matrícula; veem rascunho no curso e no player (prévia). */
export const ehEquipe = (q: QuemPede) => q.membro.papel !== "ALUNO";

/** Produto (`produtos` da consulta externa) com matrícula valendo AGORA para o aluno; equipe: sempre. */
export function matriculaValendoSql(q: QuemPede, agora: Date): SQL<boolean> {
  if (ehEquipe(q)) return sql<boolean>`true`;
  if (!q.membro.id) return sql<boolean>`false`;
  const pm = produtos_matriculas;
  return sql<boolean>`exists (select 1 from ${pm} where ${pm.membro_id} = ${q.membro.id} and ${pm.produto_id} = ${produtos.id}
    and ${pm.is_deleted} = false and ${valeAgora(agora)})`;
}

/** Aula visível na vitrine: aula, módulo e produto vivos, módulo PUBLICADO, produto do status pedido, já liberada. */
export function aulaNaVitrine(criadorId: string, agora: Date, statusProduto: SQL = sql`${produtos.status} <> 'RASCUNHO'`): SQL {
  return and(
    eq(produtos_modulos_aulas.criador_id, criadorId),
    vivos(produtos_modulos_aulas),
    vivos(produtos_modulos),
    vivos(produtos),
    eq(produtos_modulos.status, "PUBLICADO"),
    statusProduto,
    sql`(${produtos_modulos_aulas.libera_em} is null or ${produtos_modulos_aulas.libera_em} <= ${agora})`,
  )!;
}

/** Posição do módulo entre os módulos PUBLICADOS vivos do produto (o "Módulo X" que o aluno vê). */
export const numeroDoModulo = sql<number>`(select count(*)::int from produtos_modulos m2
  where m2.produto_id = ${produtos_modulos.produto_id} and m2.is_deleted = false and m2.status = 'PUBLICADO' and m2.ordem <= ${produtos_modulos.ordem})`;

/** Posição da aula entre as aulas vivas do módulo (o "Aula Y"). */
export const numeroDaAula = sql<number>`(select count(*)::int from produtos_modulos_aulas a2
  where a2.modulo_id = ${produtos_modulos_aulas.modulo_id} and a2.is_deleted = false and a2.ordem <= ${produtos_modulos_aulas.ordem})`;

/** Chave de imagem só se o arquivo segue vivo (a FK composta já garante o criador). */
export const chaveViva = (t: { is_deleted: AnyPgColumn; chave: AnyPgColumn }) => sql<string | null>`case when ${t.is_deleted} = false then ${t.chave} end`;

export const subtituloDaAula = (modulo: number, aula: number) => `Módulo ${modulo} · Aula ${aula}`;
export const hrefDaAula = (aulaId: string) => `/aula/${aulaId}`;
export const hrefDoCurso = (slug: string) => `/cursos/${slug}`;

/**
 * Troca `imagemChave` por `imagemUrl` assinada (o formato do `ItemFileira` da vitrine). Imagem
 * ausente ou storage fora do ar: sem `imagemUrl` (o cartão mostra o vazio).
 */
export async function comImagens<T extends { imagemChave: string | null }>(criadorId: string, itens: readonly T[]): Promise<(Omit<T, "imagemChave"> & { imagemUrl?: string })[]> {
  const urls = await Promise.all(itens.map((i) => urlDeImagemOuNula(criadorId, i.imagemChave)));
  return itens.map((item, n) => {
    const resto: Omit<T, "imagemChave"> & { imagemChave?: unknown } = { ...item };
    delete resto.imagemChave;
    return { ...resto, imagemUrl: urls[n] ?? undefined };
  });
}

/** O curso/aula está na "Minha lista" do membro? (botão de favoritar). */
export async function estaNaLista(q: QuemPede, alvo: { produtoId: string } | { aulaId: string }): Promise<boolean> {
  if (!q.membro.id) return false;
  const [f] = await db
    .select({ id: fav.id })
    .from(fav)
    .where(and(eq(fav.membro_id, q.membro.id), eq(fav.criador_id, q.criador.id), vivos(fav), "produtoId" in alvo ? eq(fav.produto_id, alvo.produtoId) : eq(fav.aula_id, alvo.aulaId)));
  return !!f;
}
