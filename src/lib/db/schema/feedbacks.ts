import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria } from "./_compartilhado";
import { criadores, criadores_membros } from "./criadores";
import { produtos_modulos_aulas } from "./produtos";

/**
 * Feedback de conteúdo (ADR-0018 item 3, RN-202): o aluno diz se a aula foi ÚTIL ou não, com um
 * comentário curto opcional (texto puro). UM vivo por (membro, aula): mudar de ideia regrava a
 * mesma linha. Binário de propósito (a ADR explica): a "média" da aula é o % de "útil".
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

export const produtos_modulos_aulas_feedbacks = pgTable(
  "produtos_modulos_aulas_feedbacks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    aula_id: uuid("aula_id").notNull(),
    membro_id: uuid("membro_id").notNull(),
    util: boolean("util").notNull(),
    comentario: text("comentario"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_produtos_modulos_aulas_feedbacks_aula", columns: [t.aula_id, t.criador_id], foreignColumns: [produtos_modulos_aulas.id, produtos_modulos_aulas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_produtos_modulos_aulas_feedbacks_membro", columns: [t.membro_id, t.criador_id], foreignColumns: [criadores_membros.id, criadores_membros.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_produtos_modulos_aulas_feedbacks_vivo").on(t.membro_id, t.aula_id).where(sql`is_deleted = false`),
    // Lista da equipe (mais recentes) e resumo por aula.
    index("ix_produtos_modulos_aulas_feedbacks_criador").on(t.criador_id, t.updated_at).where(sql`is_deleted = false`),
    index("ix_produtos_modulos_aulas_feedbacks_aula").on(t.aula_id).where(sql`is_deleted = false`),
    check("ck_produtos_modulos_aulas_feedbacks_comentario", sql`comentario is null or length(trim(comentario)) between 1 and 500`),
  ],
);

export type FeedbackAula = typeof produtos_modulos_aulas_feedbacks.$inferSelect;
