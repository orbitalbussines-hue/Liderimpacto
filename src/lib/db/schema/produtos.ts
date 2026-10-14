import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { STATUS_MODULO, STATUS_PRODUTO, TIPOS_MATERIAL, TIPOS_PRODUTO, listaSql } from "./_enums";
import { arquivos } from "./arquivos";
import { criadores, criadores_membros } from "./criadores";

/**
 * Catalogo do criador (SISTEMA.md §4): produtos > modulos > aulas > materiais. `criador_id` em
 * TODAS as tabelas e FKs COMPOSTAS (filho, criador) -> (pai, criador): o banco recusa modulo,
 * aula, capa ou material de outro criador mesmo que a action erre. Ordem: unica por pai entre
 * os vivos (reordenar em duas fases numa transacao: src/lib/catalogo/ordem.ts).
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

/** Capitulo de uma aula (jsonb, validado por zod em src/lib/validators/catalogo.ts). */
export interface Capitulo {
  inicioSeg: number;
  titulo: string;
}

export const produtos = pgTable(
  "produtos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    /** "Cod. N": sequencial POR criador, nunca reaproveitado (unico entre todos, vivos ou nao). */
    codigo: integer("codigo").notNull(),
    titulo: text("titulo").notNull(),
    slug: text("slug").notNull(),
    descricao: text("descricao").notNull().default(""),
    tipo: text("tipo", { enum: TIPOS_PRODUTO }).notNull().default("CURSO"),
    capa_3x4_arquivo_id: uuid("capa_3x4_arquivo_id"),
    capa_16x9_arquivo_id: uuid("capa_16x9_arquivo_id"),
    status: text("status", { enum: STATUS_PRODUTO }).notNull().default("RASCUNHO"),
    /** Professor: membro DONO/ADMIN do MESMO criador (FK composta; papel conferido na action). */
    professor_membro_id: uuid("professor_membro_id"),
    /** Cor propria do curso (ADR-0002, cascata); nulo = cor do criador. */
    cor_marca: text("cor_marca"),
    ...colunasAuditoria,
  },
  (t) => [
    unique("uq_produtos_criador_codigo").on(t.criador_id, t.codigo),
    uniqueIndex("uq_produtos_slug_vivo").on(t.criador_id, t.slug).where(sql`is_deleted = false`),
    unique("uq_produtos_id_criador").on(t.id, t.criador_id),
    index("ix_produtos_criador_atualizado").on(t.criador_id, t.updated_at).where(sql`is_deleted = false`),
    foreignKey({ name: "fk_produtos_capa_3x4", columns: [t.capa_3x4_arquivo_id, t.criador_id], foreignColumns: [arquivos.id, arquivos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_produtos_capa_16x9", columns: [t.capa_16x9_arquivo_id, t.criador_id], foreignColumns: [arquivos.id, arquivos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_produtos_professor",
      columns: [t.professor_membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check("ck_produtos_codigo", sql`codigo >= 1`),
    check("ck_produtos_slug", sql`slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80`),
    check("ck_produtos_cor_marca", sql`cor_marca is null or cor_marca ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'`),
    check("ck_produtos_tipo", sql.raw(`tipo in (${listaSql(TIPOS_PRODUTO)})`)),
    check("ck_produtos_status", sql.raw(`status in (${listaSql(STATUS_PRODUTO)})`)),
  ],
);

export const produtos_modulos = pgTable(
  "produtos_modulos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    produto_id: uuid("produto_id").notNull(),
    ordem: integer("ordem").notNull(),
    titulo: text("titulo").notNull(),
    status: text("status", { enum: STATUS_MODULO }).notNull().default("PUBLICADO"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_produtos_modulos_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_produtos_modulos_ordem_vivo").on(t.produto_id, t.ordem).where(sql`is_deleted = false`),
    unique("uq_produtos_modulos_id_criador").on(t.id, t.criador_id),
    check("ck_produtos_modulos_ordem", sql`ordem >= 1`),
    check("ck_produtos_modulos_status", sql.raw(`status in (${listaSql(STATUS_MODULO)})`)),
  ],
);

export const produtos_modulos_aulas = pgTable(
  "produtos_modulos_aulas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    modulo_id: uuid("modulo_id").notNull(),
    ordem: integer("ordem").notNull(),
    titulo: text("titulo").notNull(),
    descricao: text("descricao").notNull().default(""),
    /** Preenchida pelo pipeline de video (passo 3b); nula ate la. */
    duracao_seg: integer("duracao_seg"),
    thumb_arquivo_id: uuid("thumb_arquivo_id"),
    capitulos: jsonb("capitulos").$type<Capitulo[]>().notNull().default([]),
    /** Liberacao programada (drip); nula = liberada com a matricula. */
    libera_em: instante("libera_em"),
    /** Aula do MESMO produto que precisa estar concluida antes (conferido na action). */
    pre_requisito_aula_id: uuid("pre_requisito_aula_id"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_produtos_modulos_aulas_modulo",
      columns: [t.modulo_id, t.criador_id],
      foreignColumns: [produtos_modulos.id, produtos_modulos.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_produtos_modulos_aulas_thumb", columns: [t.thumb_arquivo_id, t.criador_id], foreignColumns: [arquivos.id, arquivos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_produtos_modulos_aulas_pre_requisito", columns: [t.pre_requisito_aula_id, t.criador_id], foreignColumns: [t.id, t.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_produtos_modulos_aulas_ordem_vivo").on(t.modulo_id, t.ordem).where(sql`is_deleted = false`),
    unique("uq_produtos_modulos_aulas_id_criador").on(t.id, t.criador_id),
    index("ix_produtos_modulos_aulas_pre_requisito").on(t.pre_requisito_aula_id).where(sql`is_deleted = false`),
    check("ck_produtos_modulos_aulas_ordem", sql`ordem >= 1`),
    check("ck_produtos_modulos_aulas_duracao", sql`duracao_seg is null or duracao_seg >= 0`),
    check("ck_produtos_modulos_aulas_pre_requisito", sql`pre_requisito_aula_id is null or pre_requisito_aula_id <> id`),
    check("ck_produtos_modulos_aulas_capitulos", sql`jsonb_typeof(capitulos) = 'array'`),
  ],
);

export const produtos_modulos_aulas_materiais = pgTable(
  "produtos_modulos_aulas_materiais",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    aula_id: uuid("aula_id").notNull(),
    nome: text("nome").notNull(),
    tipo: text("tipo", { enum: TIPOS_MATERIAL }).notNull(),
    /** PDF/DOC: arquivo no storage. LINK: url https. Exatamente um dos dois (CHECK). */
    arquivo_id: uuid("arquivo_id"),
    url: text("url"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_produtos_modulos_aulas_materiais_aula",
      columns: [t.aula_id, t.criador_id],
      foreignColumns: [produtos_modulos_aulas.id, produtos_modulos_aulas.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_produtos_modulos_aulas_materiais_arquivo",
      columns: [t.arquivo_id, t.criador_id],
      foreignColumns: [arquivos.id, arquivos.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_produtos_modulos_aulas_materiais_aula").on(t.aula_id).where(sql`is_deleted = false`),
    check(
      "ck_produtos_modulos_aulas_materiais_origem",
      sql`(tipo = 'LINK' and url is not null and arquivo_id is null) or (tipo <> 'LINK' and arquivo_id is not null and url is null)`,
    ),
    check("ck_produtos_modulos_aulas_materiais_url", sql`url is null or url ~ '^https://'`),
    check("ck_produtos_modulos_aulas_materiais_tipo", sql.raw(`tipo in (${listaSql(TIPOS_MATERIAL)})`)),
  ],
);

export type Produto = typeof produtos.$inferSelect;
export type ProdutoModulo = typeof produtos_modulos.$inferSelect;
export type ProdutoAula = typeof produtos_modulos_aulas.$inferSelect;
export type ProdutoMaterial = typeof produtos_modulos_aulas_materiais.$inferSelect;
