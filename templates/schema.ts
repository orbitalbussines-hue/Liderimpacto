/**
 * TEMPLATE-OURO: tabela Drizzle.
 * Copie para src/lib/db/schema/<tabela-em-kebab>.ts, ajuste e exporte no
 * src/lib/db/schema/index.ts. Depois: `npm run db:generate` e `npm run compliance`.
 */
import { sql } from "drizzle-orm";
import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, dinheiro } from "./_compartilhado";
import { contratos } from "./contratos";

// Nome hierarquico: contratos -> contratos_lancamentos -> contratos_lancamentos_categorias
export const contratosLancamentos = pgTable(
  "contratos_lancamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // --- dominio ---
    contrato_id: uuid("contrato_id")
      .notNull()
      // FK SEMPRE com as duas regras explicitas. Nunca cascade em dado critico.
      .references(() => contratos.id, { onDelete: "restrict", onUpdate: "restrict" }),
    descricao: text("descricao").notNull(),
    valor: dinheiro("valor").notNull(),

    // --- auditoria (5 colunas, nunca omitir) ---
    ...colunasAuditoria,
  },
  (t) => [
    // Indice parcial: so linhas vivas. Predicado em sql cru com literais.
    index("idx_contratos_lancamentos_contrato").on(t.contrato_id).where(sql`is_deleted = false`),
  ],
);

export type ContratoLancamento = typeof contratosLancamentos.$inferSelect;
export type NovoContratoLancamento = typeof contratosLancamentos.$inferInsert;
