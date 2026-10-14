import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { ORIGENS_MATRICULA, STATUS_MATRICULA, listaSql } from "./_enums";
import { criadores, criadores_membros } from "./criadores";
import { produtos } from "./produtos";

/**
 * Matricula de um membro num produto (SISTEMA.md §4 Enrollment; RN-116). Filha de `produtos`
 * no nome (`produtos_matriculas`): e o que o produto "vende"; o membro entra por FK.
 *
 * - `criador_id` + FKs COMPOSTAS (membro, criador) e (produto, criador): o banco recusa matricular
 *   membro de A em produto de B mesmo que a action erre (ADR-0004).
 * - UMA matricula viva por (membro, produto): cancelar e status (nunca delete); matricular de
 *   novo REATIVA a mesma linha (src/lib/matriculas/servico.ts).
 * - `referencia_externa` (ex.: `gateway:eventoId`) unica por criador quando presente: e a
 *   idempotencia do futuro webhook (mesma referencia = mesma matricula, sem erro).
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

export const produtos_matriculas = pgTable(
  "produtos_matriculas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    membro_id: uuid("membro_id").notNull(),
    produto_id: uuid("produto_id").notNull(),
    origem: text("origem", { enum: ORIGENS_MATRICULA }).notNull(),
    status: text("status", { enum: STATUS_MATRICULA }).notNull().default("ATIVA"),
    iniciada_em: instante("iniciada_em").notNull().defaultNow(),
    /** Passo 5 (progresso): preenchida ao concluir todas as aulas. */
    concluida_em: instante("concluida_em"),
    /** Nula = sem expiracao. Passou da data = Expirada (sem acesso), sem mudar o status. */
    expira_em: instante("expira_em"),
    referencia_externa: text("referencia_externa"),
    motivo_cancelamento: text("motivo_cancelamento"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_produtos_matriculas_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_produtos_matriculas_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_produtos_matriculas_par_vivo").on(t.membro_id, t.produto_id).where(sql`is_deleted = false`),
    // Vale para TODAS as linhas (vivas ou nao): a idempotencia do webhook nao pode "esquecer".
    uniqueIndex("uq_produtos_matriculas_referencia").on(t.criador_id, t.referencia_externa).where(sql`referencia_externa is not null`),
    index("ix_produtos_matriculas_produto").on(t.criador_id, t.produto_id).where(sql`is_deleted = false`),
    check("ck_produtos_matriculas_origem", sql.raw(`origem in (${listaSql(ORIGENS_MATRICULA)})`)),
    check("ck_produtos_matriculas_status", sql.raw(`status in (${listaSql(STATUS_MATRICULA)})`)),
    check("ck_produtos_matriculas_referencia", sql`referencia_externa is null or referencia_externa ~ '^[a-z0-9-]{2,30}:[^[:space:]]{1,200}$'`),
    check("ck_produtos_matriculas_motivo", sql`status <> 'CANCELADA' or length(trim(motivo_cancelamento)) >= 3`),
  ],
);

export type ProdutoMatricula = typeof produtos_matriculas.$inferSelect;
