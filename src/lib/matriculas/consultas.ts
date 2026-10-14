import "server-only";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { arquivos, criadores_membros, produtos, produtos_matriculas, usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import type { SituacaoMatricula } from "./regras";

/**
 * LEITURAS de matriculas. `criadorId` vem SEMPRE do host; toda consulta filtra criador e vivos.
 * "Vale" = ATIVA e nao expirada no instante `agora` (mesma regra de regras.ts, em SQL).
 */

const pm = produtos_matriculas;

/** Condicao "a matricula da acesso agora" para o query builder. */
export const valeAgora = (agora: Date): SQL => and(eq(pm.status, "ATIVA"), or(isNull(pm.expira_em), gt(pm.expira_em, agora)))!;

/** Condicao de cada situacao (Expirada = ATIVA com data passada). */
function daSituacao(s: SituacaoMatricula, agora: Date): SQL {
  if (s === "ATIVA") return valeAgora(agora);
  if (s === "EXPIRADA") return and(eq(pm.status, "ATIVA"), lte(pm.expira_em, agora))!;
  return eq(pm.status, s);
}

/** Matricula valendo AGORA para o par (porta do `podeAssistir` e da area do aluno). */
export async function matriculaAtiva(criadorId: string, membroId: string, produtoId: string, agora: Date): Promise<boolean> {
  const [m] = await db
    .select({ id: pm.id })
    .from(pm)
    .where(and(eq(pm.criador_id, criadorId), eq(pm.membro_id, membroId), eq(pm.produto_id, produtoId), vivos(pm), valeAgora(agora)));
  return !!m;
}

export async function contadoresDeMatriculas(criadorId: string, agora: Date) {
  const [c] = await db
    .select({
      total: sql<number>`count(*)::int`,
      ativas: sql<number>`count(*) filter (where ${valeAgora(agora)})::int`,
      pendentes: sql<number>`count(*) filter (where ${pm.status} = 'PENDENTE')::int`,
      canceladas: sql<number>`count(*) filter (where ${pm.status} = 'CANCELADA')::int`,
      expiradas: sql<number>`count(*) filter (where ${daSituacao("EXPIRADA", agora)})::int`,
    })
    .from(pm)
    .innerJoin(criadores_membros, eq(criadores_membros.id, pm.membro_id))
    .where(and(eq(pm.criador_id, criadorId), vivos(pm), vivos(criadores_membros)));
  return c ?? { total: 0, ativas: 0, pendentes: 0, canceladas: 0, expiradas: 0 };
}

export interface FiltrosMatriculas {
  busca?: string;
  produtoId?: string;
  situacao?: SituacaoMatricula;
  pagina: number;
  porPagina: number;
}

/** `%` e `_` digitados viram literais no ILIKE. */
const curinga = (texto: string) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listarMatriculas(criadorId: string, f: FiltrosMatriculas, agora: Date) {
  const condicoes: SQL[] = [eq(pm.criador_id, criadorId), vivos(pm), vivos(criadores_membros), vivos(produtos)];
  if (f.busca) condicoes.push(or(ilike(usuarios.nome, curinga(f.busca)), ilike(usuarios.email, curinga(f.busca)))!);
  if (f.produtoId) condicoes.push(eq(pm.produto_id, f.produtoId));
  if (f.situacao) condicoes.push(daSituacao(f.situacao, agora));
  const onde = and(...condicoes);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(pm)
    .innerJoin(criadores_membros, eq(criadores_membros.id, pm.membro_id))
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .innerJoin(produtos, eq(produtos.id, pm.produto_id))
    .where(onde);
  const linhas = await db
    .select({
      id: pm.id,
      nome: usuarios.nome,
      email: usuarios.email,
      imagem: usuarios.imagem,
      produto: produtos.titulo,
      produtoCodigo: produtos.codigo,
      origem: pm.origem,
      status: pm.status,
      iniciadaEm: pm.iniciada_em,
      expiraEm: pm.expira_em,
      motivo: pm.motivo_cancelamento,
      versao: pm.updated_at,
    })
    .from(pm)
    .innerJoin(criadores_membros, eq(criadores_membros.id, pm.membro_id))
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .innerJoin(produtos, eq(produtos.id, pm.produto_id))
    .where(onde)
    .orderBy(desc(pm.iniciada_em), asc(pm.id))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  return { total, linhas };
}

/** Produtos vivos do criador para escolher na matricula (todas as situacoes; rascunho avisa). */
export async function produtosParaMatricular(criadorId: string) {
  return db
    .select({ id: produtos.id, titulo: produtos.titulo, codigo: produtos.codigo, slug: produtos.slug, status: produtos.status })
    .from(produtos)
    .where(and(eq(produtos.criador_id, criadorId), vivos(produtos)))
    .orderBy(asc(sql`lower(${produtos.titulo})`));
}

/** Busca de membros (nome ou e-mail) para o dialogo "Matricular". */
export async function buscarMembros(criadorId: string, busca: string, limite = 20) {
  return db
    .select({ id: criadores_membros.id, nome: usuarios.nome, email: usuarios.email, imagem: usuarios.imagem })
    .from(criadores_membros)
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(
      and(
        eq(criadores_membros.criador_id, criadorId),
        vivos(criadores_membros),
        vivos(usuarios),
        or(ilike(usuarios.nome, curinga(busca)), ilike(usuarios.email, curinga(busca))),
      ),
    )
    .orderBy(asc(sql`lower(${usuarios.nome})`))
    .limit(limite);
}

/** Matriculas valendo por membro (coluna "Matrículas" de /admin/membros). */
export async function matriculasPorMembro(criadorId: string, membroIds: string[], agora: Date): Promise<Map<string, number>> {
  if (membroIds.length === 0) return new Map();
  const linhas = await db
    .select({ membroId: pm.membro_id, n: sql<number>`count(*)::int` })
    .from(pm)
    .innerJoin(produtos, eq(produtos.id, pm.produto_id))
    .where(and(eq(pm.criador_id, criadorId), inArray(pm.membro_id, membroIds), vivos(pm), vivos(produtos), valeAgora(agora)))
    .groupBy(pm.membro_id);
  return new Map(linhas.map((l) => [l.membroId, l.n]));
}

/** Alunos (matriculas valendo) por produto (contagem "Y alunos" de /admin/conteudos). */
export async function alunosPorProduto(criadorId: string, produtoIds: string[], agora: Date): Promise<Map<string, number>> {
  if (produtoIds.length === 0) return new Map();
  const linhas = await db
    .select({ produtoId: pm.produto_id, n: sql<number>`count(*)::int` })
    .from(pm)
    .innerJoin(criadores_membros, eq(criadores_membros.id, pm.membro_id))
    .where(and(eq(pm.criador_id, criadorId), inArray(pm.produto_id, produtoIds), vivos(pm), vivos(criadores_membros), valeAgora(agora)))
    .groupBy(pm.produto_id);
  return new Map(linhas.map((l) => [l.produtoId, l.n]));
}

const capa16x9 = alias(arquivos, "capa_16x9");

/**
 * Cursos do ALUNO logado (so os dele): matricula valendo + produto fora de RASCUNHO. Total de
 * aulas = aulas vivas de modulos PUBLICADOS. Progresso entra no passo 5.
 */
export async function cursosDoAluno(criadorId: string, membroId: string, agora: Date) {
  return db
    .select({
      produtoId: produtos.id,
      titulo: produtos.titulo,
      slug: produtos.slug,
      capaChave: sql<string | null>`case when ${capa16x9.is_deleted} = false then ${capa16x9.chave} end`,
      totalAulas: sql<number>`(select count(*)::int from produtos_modulos_aulas a join produtos_modulos m on m.id = a.modulo_id
        where m.produto_id = "produtos"."id" and m.status = 'PUBLICADO' and m.is_deleted = false and a.is_deleted = false)`,
    })
    .from(pm)
    .innerJoin(produtos, eq(produtos.id, pm.produto_id))
    .leftJoin(capa16x9, eq(capa16x9.id, produtos.capa_16x9_arquivo_id))
    .where(and(eq(pm.criador_id, criadorId), eq(pm.membro_id, membroId), vivos(pm), vivos(produtos), ne(produtos.status, "RASCUNHO"), valeAgora(agora)))
    .orderBy(desc(pm.iniciada_em));
}
