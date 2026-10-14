import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria } from "./_compartilhado";
import { criadores, criadores_membros } from "./criadores";
import { produtos, produtos_modulos_aulas } from "./produtos";

/**
 * "Minha lista" do membro (SISTEMA.md §4 Favorite): um produto OU uma aula por linha (CHECK).
 * Um favorito vivo por (membro, produto) e por (membro, aula). Desfavoritar = soft delete;
 * favoritar de novo REATIVA a linha mais recente (src/lib/actions/favoritos.ts).
 */
export const criadores_membros_favoritos = pgTable(
  "criadores_membros_favoritos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id")
      .notNull()
      .references(() => criadores.id, { onDelete: "restrict", onUpdate: "restrict" }),
    membro_id: uuid("membro_id").notNull(),
    produto_id: uuid("produto_id"),
    aula_id: uuid("aula_id"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_criadores_membros_favoritos_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_membros_favoritos_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_criadores_membros_favoritos_aula",
      columns: [t.aula_id, t.criador_id],
      foreignColumns: [produtos_modulos_aulas.id, produtos_modulos_aulas.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_membros_favoritos_produto_vivo").on(t.membro_id, t.produto_id).where(sql`is_deleted = false and produto_id is not null`),
    uniqueIndex("uq_criadores_membros_favoritos_aula_vivo").on(t.membro_id, t.aula_id).where(sql`is_deleted = false and aula_id is not null`),
    index("ix_criadores_membros_favoritos_membro").on(t.membro_id, t.updated_at.desc()).where(sql`is_deleted = false`),
    check("ck_criadores_membros_favoritos_alvo", sql`num_nonnulls(produto_id, aula_id) = 1`),
  ],
);

export type Favorito = typeof criadores_membros_favoritos.$inferSelect;
