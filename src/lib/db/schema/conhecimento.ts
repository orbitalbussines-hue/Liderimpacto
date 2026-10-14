import { sql } from "drizzle-orm";
import { boolean, check, customType, foreignKey, index, integer, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { FONTES_CONHECIMENTO, listaSql } from "./_enums";
import { criadores } from "./criadores";
import { produtos, produtos_modulos_aulas } from "./produtos";

/**
 * Base de conhecimento do assistente do professor (ADR-0014, RN-190 a RN-192). Um DOCUMENTO por
 * fonte (transcrição da aula, descrição da aula, descrição do curso, texto da equipe) dividido em
 * TRECHOS de ~1000 caracteres com `tsvector` em português sem acento (busca full-text do Postgres;
 * não há embeddings). FKs COMPOSTAS com `criador_id`: documento de A nunca aponta aula/curso de B.
 * Reindexar = soft delete dos trechos antigos + inserção dos novos, só quando a `assinatura` muda.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

/** `tsvector` não existe no drizzle: só o tipo da coluna (gerada pelo banco, nunca escrita pelo app). */
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const criadores_conhecimento_documentos = pgTable(
  "criadores_conhecimento_documentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    fonte: text("fonte", { enum: FONTES_CONHECIMENTO }).notNull(),
    /** AULA_TRANSCRICAO e AULA_DESCRICAO. */
    aula_id: uuid("aula_id"),
    /** PRODUTO_DESCRICAO (obrigatório) e TEXTO (opcional: texto só de um curso). */
    produto_id: uuid("produto_id"),
    titulo: text("titulo").notNull(),
    /** Texto puro que gerou os trechos (para TEXTO, é o próprio conteúdo escrito pela equipe). */
    texto: text("texto").notNull().default(""),
    /** Desligado = fica na lista, mas o assistente não recebe os trechos. */
    incluir: boolean("incluir").notNull().default(true),
    /** sha256 dos trechos gerados: reindexar com a mesma assinatura não mexe em nada (idempotente). */
    assinatura: text("assinatura").notNull().default(""),
    trechos: integer("trechos").notNull().default(0),
    indexado_em: instante("indexado_em"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_conhecimento_documentos_aula", columns: [t.aula_id, t.criador_id], foreignColumns: [produtos_modulos_aulas.id, produtos_modulos_aulas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_conhecimento_documentos_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("uq_criadores_conhecimento_documentos_id_criador").on(t.id, t.criador_id),
    // Uma fonte derivada viva por aula/curso (a reindexação faz upsert por aqui).
    uniqueIndex("uq_criadores_conhecimento_documentos_aula_vivo").on(t.fonte, t.aula_id).where(sql`is_deleted = false and aula_id is not null`),
    uniqueIndex("uq_criadores_conhecimento_documentos_produto_vivo").on(t.fonte, t.produto_id).where(sql`is_deleted = false and fonte = 'PRODUTO_DESCRICAO'`),
    index("ix_criadores_conhecimento_documentos_lista").on(t.criador_id, t.fonte).where(sql`is_deleted = false`),
    check("ck_criadores_conhecimento_documentos_fonte", sql.raw(`fonte in (${listaSql(FONTES_CONHECIMENTO)})`)),
    check(
      "ck_criadores_conhecimento_documentos_alvo",
      sql`(fonte in ('AULA_TRANSCRICAO', 'AULA_DESCRICAO') and aula_id is not null and produto_id is null)
        or (fonte = 'PRODUTO_DESCRICAO' and produto_id is not null and aula_id is null)
        or (fonte = 'TEXTO' and aula_id is null)`,
    ),
    check("ck_criadores_conhecimento_documentos_titulo", sql`length(titulo) between 1 and 160`),
    check("ck_criadores_conhecimento_documentos_texto", sql`length(texto) <= 200000`),
    check("ck_criadores_conhecimento_documentos_trechos", sql`trechos >= 0`),
  ],
);

export const criadores_conhecimento_documentos_trechos = pgTable(
  "criadores_conhecimento_documentos_trechos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    documento_id: uuid("documento_id").notNull(),
    ordem: integer("ordem").notNull(),
    texto: text("texto").notNull(),
    /** Só na transcrição: segundo em que o trecho começa (a resposta cita "aula X, 03:15"). */
    inicio_seg: integer("inicio_seg"),
    /** Português, sem acento (`li_sem_acento` = unaccent IMUTÁVEL, migração 0011). */
    busca: tsvector("busca")
      .notNull()
      .generatedAlwaysAs(sql`to_tsvector('portuguese'::regconfig, li_sem_acento(texto))`),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_criadores_conhecimento_documentos_trechos_documento",
      columns: [t.documento_id, t.criador_id],
      foreignColumns: [criadores_conhecimento_documentos.id, criadores_conhecimento_documentos.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_criadores_conhecimento_documentos_trechos_busca").using("gin", t.busca).where(sql`is_deleted = false`),
    index("ix_criadores_conhecimento_documentos_trechos_documento").on(t.documento_id, t.ordem).where(sql`is_deleted = false`),
    check("ck_criadores_conhecimento_documentos_trechos_texto", sql`length(texto) between 1 and 2000`),
    check("ck_criadores_conhecimento_documentos_trechos_inicio", sql`inicio_seg is null or inicio_seg >= 0`),
    check("ck_criadores_conhecimento_documentos_trechos_ordem", sql`ordem >= 0`),
  ],
);

export type DocumentoConhecimento = typeof criadores_conhecimento_documentos.$inferSelect;
