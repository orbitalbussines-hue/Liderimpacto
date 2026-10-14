import { boolean, numeric, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Helpers de coluna usados por TODO o schema. Nao declare coluna de data,
 * dinheiro ou auditoria sem passar por aqui.
 */

/** timestamptz(3): milissegundo, igual ao Date do JS — a trava por updated_at compara exato. */
export const instante = (nome: string) =>
  timestamp(nome, { precision: 3, withTimezone: true, mode: "date" });

/** Dinheiro: numeric(14,2) em modo string. NUNCA number (ponto flutuante). */
export const dinheiro = (nome: string) => numeric(nome, { precision: 14, scale: 2 });

/**
 * As 5 colunas de auditoria. Espalhe em toda tabela: `...colunasAuditoria`.
 *
 * `updated_at` NAO tem `$onUpdate` de proposito: ele dispararia em todo UPDATE
 * de sistema (contador, status) e envelheceria o valor que a tela guardou,
 * fazendo toda edicao legitima ser recusada como colisao. Quem grava
 * `updated_at` e a action, junto com `modified_by`.
 *
 * `modified_by` fica sem FK aqui para evitar import circular com `usuarios`;
 * a action sempre preenche com o id da sessao.
 */
export const colunasAuditoria = {
  created_at: instante("created_at").notNull().defaultNow(),
  updated_at: instante("updated_at").notNull().defaultNow(),
  deleted_at: instante("deleted_at"),
  is_deleted: boolean("is_deleted").notNull().default(false),
  modified_by: uuid("modified_by").notNull(),
};
