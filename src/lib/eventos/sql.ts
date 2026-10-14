import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * QUEM VÊ um evento ou desafio (RN-142, RN-147) — uma condição só para a lista, a inscrição, a
 * participação e o envio de avisos. Equipe (DONO/ADMIN, e SUPER_ADMIN como DONO) vê tudo. ALUNO:
 * TODOS; PRODUTO = matrícula valendo agora no curso; GRUPOS = está (vivo) em ao menos um grupo vivo
 * da tabela de junção. A situação (rascunho etc.) é filtrada por quem chama.
 */

type Coluna = AnyPgColumn | SQL;

/** Junções de público permitidas (nome fixo, nunca vindo de fora). */
const JUNCOES = {
  evento: { tabela: "criadores_eventos_grupos", coluna: "evento_id" },
  desafio: { tabela: "criadores_desafios_grupos", coluna: "desafio_id" },
} as const;

export interface AlvoDoPublico {
  tipo: keyof typeof JUNCOES;
  /** Coluna/expr do id do evento ou desafio. */
  id: Coluna;
  publico: Coluna;
  /** Só evento (público PRODUTO). */
  produtoId?: Coluna;
}

export function vePublicoSql(a: AlvoDoPublico, membroId: SQL, papel: SQL, agora: Date): SQL<boolean> {
  const j = JUNCOES[a.tipo];
  const produto = a.produtoId
    ? sql`or (${a.publico} = 'PRODUTO' and exists (
        select 1 from produtos_matriculas pm
        where pm.produto_id = ${a.produtoId} and pm.membro_id = ${membroId} and pm.is_deleted = false
          and pm.status = 'ATIVA' and (pm.expira_em is null or pm.expira_em > ${agora})))`
    : sql``;
  return sql<boolean>`(
    ${papel} in ('DONO', 'ADMIN')
    or ${a.publico} = 'TODOS'
    ${produto}
    or (${a.publico} = 'GRUPOS' and exists (
      select 1 from ${sql.raw(j.tabela)} jg
      join criadores_grupos g on g.id = jg.grupo_id and g.is_deleted = false
      join criadores_grupos_membros gm on gm.grupo_id = jg.grupo_id and gm.membro_id = ${membroId} and gm.is_deleted = false
      where jg.${sql.raw(j.coluna)} = ${a.id} and jg.is_deleted = false))
  )`;
}

/** Atalho para a linha `criadores_eventos e` da consulta. */
export const veEventoSql = (membroId: SQL, papel: SQL, agora: Date, e = "e"): SQL<boolean> =>
  vePublicoSql({ tipo: "evento", id: sql.raw(`${e}.id`), publico: sql.raw(`${e}.publico`), produtoId: sql.raw(`${e}.produto_id`) }, membroId, papel, agora);

/** Atalho para a linha `criadores_desafios d` da consulta. */
export const veDesafioSql = (membroId: SQL, papel: SQL, agora: Date, d = "d"): SQL<boolean> =>
  vePublicoSql({ tipo: "desafio", id: sql.raw(`${d}.id`), publico: sql.raw(`${d}.publico`) }, membroId, papel, agora);
