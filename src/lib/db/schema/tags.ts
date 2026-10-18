import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria } from "./_compartilhado";
import { criadores, criadores_membros } from "./criadores";

/**
 * Tags de membros (ADR-0018 item 1, RN-200): etiquetas livres da equipe ("Lead quente", "VIP").
 * Diferente de grupo: tag não libera conteúdo nem canal, só organiza e filtra. Nome único por
 * criador (sem diferença de maiúsculas, entre as vivas). FK composta: tag e membro do MESMO criador.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

export const criadores_tags = pgTable(
  "criadores_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    nome: text("nome").notNull(),
    /** Hex `#rrggbb` (a tela oferece a paleta; o banco só confere o formato). */
    cor: text("cor").notNull().default("#c9a227"),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_criadores_tags_nome_vivo").on(t.criador_id, sql`lower(${t.nome})`).where(sql`is_deleted = false`),
    unique("uq_criadores_tags_id_criador").on(t.id, t.criador_id),
    check("ck_criadores_tags_nome", sql`length(trim(nome)) between 1 and 40`),
    check("ck_criadores_tags_cor", sql`cor ~ '^#[0-9a-f]{6}$'`),
  ],
);

export const criadores_membros_tags = pgTable(
  "criadores_membros_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    membro_id: uuid("membro_id").notNull(),
    tag_id: uuid("tag_id").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_membros_tags_membro", columns: [t.membro_id, t.criador_id], foreignColumns: [criadores_membros.id, criadores_membros.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_membros_tags_tag", columns: [t.tag_id, t.criador_id], foreignColumns: [criadores_tags.id, criadores_tags.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_membros_tags_vivo").on(t.membro_id, t.tag_id).where(sql`is_deleted = false`),
    // Filtro "membros com a tag X" e contagem por tag.
    index("ix_criadores_membros_tags_tag").on(t.tag_id).where(sql`is_deleted = false`),
  ],
);

export type TagCriador = typeof criadores_tags.$inferSelect;
