import "server-only";
import { and, asc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { criadores_grupos, criadores_grupos_membros, criadores_membros, usuarios } from "@/lib/db/schema";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import { vivos } from "@/lib/db/soft-delete";

/**
 * Leituras das telas de membros e grupos. `criadorId` vem SEMPRE do host (membroDaPagina);
 * toda consulta filtra o criador e os vivos.
 */

export const FILTROS_SITUACAO = ["ativos", "inativos", "nunca"] as const;
export type FiltroSituacao = (typeof FILTROS_SITUACAO)[number];

export interface FiltrosMembros {
  busca?: string;
  situacao?: FiltroSituacao;
  grupoId?: string;
  /** Só estes papéis (Configurações > Equipe e acesso = DONO e ADMIN). */
  papeis?: readonly PapelCriador[];
  pagina: number;
  porPagina: number;
}

/** `%` e `_` digitados viram literais no ILIKE. */
const curinga = (texto: string) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function contadoresDeMembros(criadorId: string) {
  const [c] = await db
    .select({
      total: sql<number>`count(*)::int`,
      ativos: sql<number>`count(*) filter (where ${criadores_membros.status} = 'ATIVO')::int`,
      inativos: sql<number>`count(*) filter (where ${criadores_membros.status} = 'INATIVO')::int`,
      nunca: sql<number>`count(*) filter (where ${criadores_membros.ultimo_acesso_em} is null)::int`,
    })
    .from(criadores_membros)
    .where(and(eq(criadores_membros.criador_id, criadorId), vivos(criadores_membros)));
  return c ?? { total: 0, ativos: 0, inativos: 0, nunca: 0 };
}

export async function listarMembros(criadorId: string, f: FiltrosMembros) {
  const condicoes: SQL[] = [eq(criadores_membros.criador_id, criadorId), vivos(criadores_membros), vivos(usuarios)];
  if (f.busca) condicoes.push(or(ilike(usuarios.nome, curinga(f.busca)), ilike(usuarios.email, curinga(f.busca)))!);
  if (f.situacao === "ativos") condicoes.push(eq(criadores_membros.status, "ATIVO"));
  if (f.situacao === "inativos") condicoes.push(eq(criadores_membros.status, "INATIVO"));
  if (f.situacao === "nunca") condicoes.push(isNull(criadores_membros.ultimo_acesso_em));
  if (f.papeis?.length) condicoes.push(inArray(criadores_membros.papel, [...f.papeis]));
  if (f.grupoId) {
    condicoes.push(
      sql`exists (select 1 from criadores_grupos_membros gm where gm.membro_id = "criadores_membros"."id" and gm.grupo_id = ${f.grupoId} and gm.criador_id = ${criadorId} and gm.is_deleted = false)`,
    );
  }
  const onde = and(...condicoes);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(criadores_membros)
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(onde);
  const linhas = await db
    .select({
      id: criadores_membros.id,
      usuarioId: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      imagem: usuarios.imagem,
      papel: criadores_membros.papel,
      status: criadores_membros.status,
      criadoEm: criadores_membros.created_at,
      ultimoAcesso: criadores_membros.ultimo_acesso_em,
      versao: criadores_membros.updated_at,
    })
    .from(criadores_membros)
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(onde)
    .orderBy(asc(sql`lower(${usuarios.nome})`), asc(criadores_membros.id))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);

  const grupos = linhas.length
    ? await db
        .select({ membroId: criadores_grupos_membros.membro_id, id: criadores_grupos.id, nome: criadores_grupos.nome })
        .from(criadores_grupos_membros)
        .innerJoin(criadores_grupos, eq(criadores_grupos.id, criadores_grupos_membros.grupo_id))
        .where(
          and(
            eq(criadores_grupos_membros.criador_id, criadorId),
            inArray(criadores_grupos_membros.membro_id, linhas.map((l) => l.id)),
            vivos(criadores_grupos_membros),
            vivos(criadores_grupos),
          ),
        )
        .orderBy(asc(criadores_grupos.nome))
    : [];
  return {
    total,
    linhas: linhas.map((l) => ({ ...l, grupos: grupos.filter((g) => g.membroId === l.id).map(({ id, nome }) => ({ id, nome })) })),
  };
}

export async function listarGrupos(criadorId: string) {
  return db
    .select({
      id: criadores_grupos.id,
      nome: criadores_grupos.nome,
      tipo: criadores_grupos.tipo,
      criadoEm: criadores_grupos.created_at,
      versao: criadores_grupos.updated_at,
      // Coluna externa ESCRITA com a tabela: num select de uma tabela so o Drizzle renderiza "id"
      // puro, que dentro da subquery viraria o gm.id (mesma armadilha de sinais-fator.ts).
      membros: sql<number>`(select count(*)::int from criadores_grupos_membros gm where gm.grupo_id = "criadores_grupos"."id" and gm.criador_id = ${criadorId} and gm.is_deleted = false)`,
    })
    .from(criadores_grupos)
    .where(and(eq(criadores_grupos.criador_id, criadorId), vivos(criadores_grupos)))
    .orderBy(asc(sql`lower(${criadores_grupos.nome})`));
}
