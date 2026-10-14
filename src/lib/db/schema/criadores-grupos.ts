import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria } from "./_compartilhado";
import { TIPOS_GRUPO, listaSql } from "./_enums";
import { criadores, criadores_membros } from "./criadores";

/** Turmas e grupos de acesso de um criador. Nome unico por criador (entre os vivos). */
export const criadores_grupos = pgTable(
  "criadores_grupos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id")
      .notNull()
      .references(() => criadores.id, { onDelete: "restrict", onUpdate: "restrict" }),
    nome: text("nome").notNull(),
    tipo: text("tipo", { enum: TIPOS_GRUPO }).notNull().default("TURMA"),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_criadores_grupos_nome_vivo").on(t.criador_id, sql`lower(${t.nome})`).where(sql`is_deleted = false`),
    unique("uq_criadores_grupos_id_criador").on(t.id, t.criador_id),
    check("ck_criadores_grupos_tipo", sql.raw(`tipo in (${listaSql(TIPOS_GRUPO)})`)),
  ],
);

/**
 * Quem esta em cada grupo. `criador_id` repetido de proposito: as duas FKs compostas
 * obrigam o grupo e o membro a serem do MESMO criador — o banco recusa vazamento.
 */
export const criadores_grupos_membros = pgTable(
  "criadores_grupos_membros",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id")
      .notNull()
      .references(() => criadores.id, { onDelete: "restrict", onUpdate: "restrict" }),
    grupo_id: uuid("grupo_id").notNull(),
    membro_id: uuid("membro_id").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_criadores_grupos_membros_grupo",
      columns: [t.grupo_id, t.criador_id],
      foreignColumns: [criadores_grupos.id, criadores_grupos.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_criadores_grupos_membros_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_grupos_membros_vivo").on(t.grupo_id, t.membro_id).where(sql`is_deleted = false`),
    index("ix_criadores_grupos_membros_membro").on(t.membro_id),
  ],
);
