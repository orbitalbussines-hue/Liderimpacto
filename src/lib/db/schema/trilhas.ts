import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { STATUS_TRILHA, TIPOS_ITEM_TRILHA, listaSql } from "./_enums";
import { arquivos } from "./arquivos";
import { produtos_avaliacoes } from "./avaliacoes";
import { criadores } from "./criadores";
import { produtos } from "./produtos";

/**
 * Trilhas (passo 7, SISTEMA.md §4 Trail/TrailItem; RN-126; ADR-0008): sequência ordenada de
 * PRODUTOS e AVALIAÇÕES do criador, cada item com "exige o anterior". FKs compostas com o
 * criador; ordem 1..n única entre os vivos (reordenar em duas fases: src/lib/catalogo/ordem.ts).
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

export const criadores_trilhas = pgTable(
  "criadores_trilhas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    titulo: text("titulo").notNull(),
    descricao: text("descricao").notNull().default(""),
    /** Rótulo curto do card ("Liderança"). */
    tag: text("tag").notNull().default(""),
    capa_arquivo_id: uuid("capa_arquivo_id"),
    status: text("status", { enum: STATUS_TRILHA }).notNull().default("RASCUNHO"),
    publicada_em: instante("publicada_em"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_trilhas_capa", columns: [t.capa_arquivo_id, t.criador_id], foreignColumns: [arquivos.id, arquivos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("uq_criadores_trilhas_id_criador").on(t.id, t.criador_id),
    index("ix_criadores_trilhas_criador").on(t.criador_id, t.status).where(sql`is_deleted = false`),
    check("ck_criadores_trilhas_status", sql.raw(`status in (${listaSql(STATUS_TRILHA)})`)),
  ],
);

export const criadores_trilhas_itens = pgTable(
  "criadores_trilhas_itens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    trilha_id: uuid("trilha_id").notNull(),
    ordem: integer("ordem").notNull(),
    tipo: text("tipo", { enum: TIPOS_ITEM_TRILHA }).notNull(),
    produto_id: uuid("produto_id"),
    avaliacao_id: uuid("avaliacao_id"),
    /** O aluno só começa este item depois de concluir o anterior. */
    exige_anterior: boolean("exige_anterior").notNull().default(true),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_trilhas_itens_trilha", columns: [t.trilha_id, t.criador_id], foreignColumns: [criadores_trilhas.id, criadores_trilhas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_trilhas_itens_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_criadores_trilhas_itens_avaliacao",
      columns: [t.avaliacao_id, t.criador_id],
      foreignColumns: [produtos_avaliacoes.id, produtos_avaliacoes.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_trilhas_itens_ordem_vivo").on(t.trilha_id, t.ordem).where(sql`is_deleted = false`),
    uniqueIndex("uq_criadores_trilhas_itens_produto_vivo").on(t.trilha_id, t.produto_id).where(sql`is_deleted = false and produto_id is not null`),
    uniqueIndex("uq_criadores_trilhas_itens_avaliacao_vivo").on(t.trilha_id, t.avaliacao_id).where(sql`is_deleted = false and avaliacao_id is not null`),
    check("ck_criadores_trilhas_itens_ordem", sql`ordem >= 1`),
    check(
      "ck_criadores_trilhas_itens_alvo",
      sql`(tipo = 'PRODUTO' and produto_id is not null and avaliacao_id is null) or (tipo = 'AVALIACAO' and avaliacao_id is not null and produto_id is null)`,
    ),
    check("ck_criadores_trilhas_itens_tipo", sql.raw(`tipo in (${listaSql(TIPOS_ITEM_TRILHA)})`)),
  ],
);

export type Trilha = typeof criadores_trilhas.$inferSelect;
export type ItemTrilha = typeof criadores_trilhas_itens.$inferSelect;
