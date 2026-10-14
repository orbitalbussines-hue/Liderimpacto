import "server-only";
import { and, asc, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import type { StatusProduto, TipoProduto } from "@/lib/db/schema/_enums";
import { arquivos, criadores_membros, produtos, produtos_modulos, produtos_modulos_aulas, produtos_modulos_aulas_materiais, usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

/**
 * Leituras das telas do catalogo. `criadorId` vem SEMPRE do host (membroDaPagina); toda consulta
 * filtra o criador e os vivos. Imagens saem como CHAVE: a pagina assina (urlDeImagem).
 */

/** `%` e `_` digitados viram literais no ILIKE. */
const curinga = (texto: string) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const capa3x4 = alias(arquivos, "capa_3x4");
const capa16x9 = alias(arquivos, "capa_16x9");

/** Aulas vivas de modulos vivos do produto (coluna externa escrita com a tabela: ver sinais-fator.ts). */
const totalDeAulas = sql<number>`(select count(*)::int from produtos_modulos_aulas a join produtos_modulos m on m.id = a.modulo_id
  where m.produto_id = "produtos"."id" and m.is_deleted = false and a.is_deleted = false)`;

export interface FiltrosProdutos {
  busca?: string;
  tipo?: TipoProduto;
  status?: StatusProduto;
  pagina: number;
  porPagina: number;
}

export async function listarProdutos(criadorId: string, f: FiltrosProdutos) {
  const condicoes: SQL[] = [eq(produtos.criador_id, criadorId), vivos(produtos)];
  if (f.busca) condicoes.push(ilike(produtos.titulo, curinga(f.busca)));
  if (f.tipo) condicoes.push(eq(produtos.tipo, f.tipo));
  if (f.status) condicoes.push(eq(produtos.status, f.status));
  const onde = and(...condicoes);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(produtos).where(onde);
  const linhas = await db
    .select({
      id: produtos.id,
      codigo: produtos.codigo,
      titulo: produtos.titulo,
      tipo: produtos.tipo,
      status: produtos.status,
      atualizado: produtos.updated_at,
      aulas: totalDeAulas,
      // Capa so se o arquivo segue vivo e DESTE criador (a FK composta ja garante o criador).
      capaChave: sql<string | null>`case when ${capa3x4.is_deleted} = false then ${capa3x4.chave} end`,
    })
    .from(produtos)
    .leftJoin(capa3x4, eq(capa3x4.id, produtos.capa_3x4_arquivo_id))
    .where(onde)
    .orderBy(desc(produtos.updated_at), desc(produtos.codigo))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  return { total, linhas };
}

/** Membros DONO/ADMIN ativos: quem pode ser professor do produto. */
export async function equipeDoCriador(criadorId: string) {
  return db
    .select({ membroId: criadores_membros.id, nome: usuarios.nome, papel: criadores_membros.papel })
    .from(criadores_membros)
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(
      and(
        eq(criadores_membros.criador_id, criadorId),
        inArray(criadores_membros.papel, ["DONO", "ADMIN"]),
        eq(criadores_membros.status, "ATIVO"),
        vivos(criadores_membros),
        vivos(usuarios),
      ),
    )
    .orderBy(asc(sql`lower(${usuarios.nome})`));
}

/** Produto + estrutura (modulos e aulas na ordem) para o editor. `null` = nao existe neste criador. */
export async function produtoParaEditar(criadorId: string, produtoId: string) {
  const [p] = await db
    .select({
      produto: produtos,
      capa3x4Chave: sql<string | null>`case when ${capa3x4.is_deleted} = false then ${capa3x4.chave} end`,
      capa16x9Chave: sql<string | null>`case when ${capa16x9.is_deleted} = false then ${capa16x9.chave} end`,
    })
    .from(produtos)
    .leftJoin(capa3x4, eq(capa3x4.id, produtos.capa_3x4_arquivo_id))
    .leftJoin(capa16x9, eq(capa16x9.id, produtos.capa_16x9_arquivo_id))
    .where(and(eq(produtos.id, produtoId), eq(produtos.criador_id, criadorId), vivos(produtos)));
  if (!p) return null;
  const modulos = await db
    .select()
    .from(produtos_modulos)
    .where(and(eq(produtos_modulos.produto_id, produtoId), eq(produtos_modulos.criador_id, criadorId), vivos(produtos_modulos)))
    .orderBy(asc(produtos_modulos.ordem));
  const aulas = modulos.length
    ? await db
        .select({
          id: produtos_modulos_aulas.id,
          moduloId: produtos_modulos_aulas.modulo_id,
          titulo: produtos_modulos_aulas.titulo,
          ordem: produtos_modulos_aulas.ordem,
          liberaEm: produtos_modulos_aulas.libera_em,
          versao: produtos_modulos_aulas.updated_at,
        })
        .from(produtos_modulos_aulas)
        .where(
          and(
            inArray(produtos_modulos_aulas.modulo_id, modulos.map((m) => m.id)),
            eq(produtos_modulos_aulas.criador_id, criadorId),
            vivos(produtos_modulos_aulas),
          ),
        )
        .orderBy(asc(produtos_modulos_aulas.ordem))
    : [];
  return {
    ...p,
    modulos: modulos.map((m) => ({ ...m, aulas: aulas.filter((a) => a.moduloId === m.id) })),
  };
}

/** Aula + produto/modulo + materiais + aulas do mesmo produto (pre-requisito). `null` = fora deste criador/produto. */
export async function aulaParaEditar(criadorId: string, produtoId: string, aulaId: string) {
  const thumb = alias(arquivos, "thumb");
  const [r] = await db
    .select({
      aula: produtos_modulos_aulas,
      moduloTitulo: produtos_modulos.titulo,
      produtoTitulo: produtos.titulo,
      thumbChave: sql<string | null>`case when ${thumb.is_deleted} = false then ${thumb.chave} end`,
    })
    .from(produtos_modulos_aulas)
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
    .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id))
    .leftJoin(thumb, eq(thumb.id, produtos_modulos_aulas.thumb_arquivo_id))
    .where(
      and(
        eq(produtos_modulos_aulas.id, aulaId),
        eq(produtos_modulos_aulas.criador_id, criadorId),
        eq(produtos.id, produtoId),
        vivos(produtos_modulos_aulas),
        vivos(produtos_modulos),
        vivos(produtos),
      ),
    );
  if (!r) return null;
  const materiais = await db
    .select({
      id: produtos_modulos_aulas_materiais.id,
      nome: produtos_modulos_aulas_materiais.nome,
      tipo: produtos_modulos_aulas_materiais.tipo,
      url: produtos_modulos_aulas_materiais.url,
      arquivoNome: arquivos.nome_original,
      arquivoTamanho: arquivos.tamanho_bytes,
      versao: produtos_modulos_aulas_materiais.updated_at,
    })
    .from(produtos_modulos_aulas_materiais)
    .leftJoin(arquivos, eq(arquivos.id, produtos_modulos_aulas_materiais.arquivo_id))
    .where(and(eq(produtos_modulos_aulas_materiais.aula_id, aulaId), eq(produtos_modulos_aulas_materiais.criador_id, criadorId), vivos(produtos_modulos_aulas_materiais)))
    .orderBy(asc(produtos_modulos_aulas_materiais.created_at));
  return { ...r, materiais, aulasDoProduto: await aulasDoProduto(criadorId, produtoId) };
}

/** Aulas vivas do produto, na ordem do curso (modulo, aula). */
export async function aulasDoProduto(criadorId: string, produtoId: string) {
  return db
    .select({ id: produtos_modulos_aulas.id, titulo: produtos_modulos_aulas.titulo, modulo: produtos_modulos.titulo })
    .from(produtos_modulos_aulas)
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
    .where(
      and(
        eq(produtos_modulos.produto_id, produtoId),
        eq(produtos_modulos_aulas.criador_id, criadorId),
        vivos(produtos_modulos),
        vivos(produtos_modulos_aulas),
      ),
    )
    .orderBy(asc(produtos_modulos.ordem), asc(produtos_modulos_aulas.ordem));
}
