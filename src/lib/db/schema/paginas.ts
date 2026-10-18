import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ConfigPagina } from "@/lib/paginas/config";
import { colunasAuditoria, instante } from "./_compartilhado";
import { MODELOS_PAGINA, SITUACOES_PAGINA, listaSql } from "./_enums";
import { criadores } from "./criadores";
import { criadores_tags } from "./tags";
import { criadores_vendas } from "./vendas";

/**
 * Páginas de venda/captura, funis e leads (ADR-0022, RN-240 a RN-247).
 * - `criadores_paginas`: o RASCUNHO editável (jsonb validado por `configPaginaSchema`, autosave com trava
 *   por `updated_at`) e a versão PUBLICADA (cópia do rascunho no "Publicar"). `/p/<slug>` lê só a publicada.
 * - `criadores_funis`: etapas em ordem (páginas deste criador, conferidas pela action como na vitrine).
 * - `criadores_paginas_visitas`: contagem ANÔNIMA por página/funil/dia (sem cookie, sem IP).
 * - `criadores_paginas_checkouts`: clique no botão de preço que abriu um Checkout (a venda da Fase 2);
 *   venda atribuída = a venda desse clique ficou PAGA.
 * - `criadores_leads`: quem deixou nome + e-mail no formulário, com o consentimento LGPD (texto e data).
 * Referências dentro do JSON (blocos → imagem, curso, oferta, tag) não têm FK: a action confere.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

/** Etapa do funil (ordem = posição no array). */
export interface EtapaFunil {
  paginaId: string;
  nome: string;
}

/** UTM da URL da página no momento da captura (só as 5 chaves padrão, validadas). */
export interface UtmLead {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

export const criadores_paginas = pgTable(
  "criadores_paginas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    /** `/p/<slug>` na área do criador; único entre as vivas do criador. */
    slug: text("slug").notNull(),
    /** Nome interno (lista do admin). */
    titulo: text("titulo").notNull(),
    modelo: text("modelo", { enum: MODELOS_PAGINA }).notNull(),
    situacao: text("situacao", { enum: SITUACOES_PAGINA }).notNull().default("RASCUNHO"),
    rascunho: jsonb("rascunho").$type<ConfigPagina>().notNull(),
    /** Cópia do rascunho no último "Publicar" (o que o público vê). Despublicar mantém, só tira do ar. */
    publicada: jsonb("publicada").$type<ConfigPagina>(),
    publicada_em: instante("publicada_em"),
    /** Número da versão publicada (1..n). */
    publicacoes: integer("publicacoes").notNull().default(0),
    ...colunasAuditoria,
  },
  (t) => [
    unique("uq_criadores_paginas_id_criador").on(t.id, t.criador_id),
    uniqueIndex("uq_criadores_paginas_slug_vivo").on(t.criador_id, t.slug).where(sql`is_deleted = false`),
    index("ix_criadores_paginas_criador").on(t.criador_id, t.updated_at).where(sql`is_deleted = false`),
    check("ck_criadores_paginas_slug", sql`slug ~ '^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])$'`),
    check("ck_criadores_paginas_titulo", sql`length(trim(titulo)) between 2 and 80`),
    check("ck_criadores_paginas_modelo", sql.raw(`modelo in (${listaSql(MODELOS_PAGINA)})`)),
    check("ck_criadores_paginas_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_PAGINA)})`)),
    check("ck_criadores_paginas_publicada", sql`situacao <> 'PUBLICADA' or (publicada is not null and publicada_em is not null)`),
    check("ck_criadores_paginas_json", sql`jsonb_typeof(rascunho) = 'object' and (publicada is null or jsonb_typeof(publicada) = 'object') and publicacoes >= 0`),
  ],
);

export const criadores_funis = pgTable(
  "criadores_funis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    nome: text("nome").notNull(),
    etapas: jsonb("etapas").$type<EtapaFunil[]>().notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    unique("uq_criadores_funis_id_criador").on(t.id, t.criador_id),
    index("ix_criadores_funis_criador").on(t.criador_id, t.created_at).where(sql`is_deleted = false`),
    check("ck_criadores_funis_nome", sql`length(trim(nome)) between 2 and 80`),
    check("ck_criadores_funis_etapas", sql`jsonb_typeof(etapas) = 'array' and jsonb_array_length(etapas) between 1 and 10`),
  ],
);

/** Visitas por (página, funil, dia): contador de sistema, sem `updated_at` de tela. */
export const criadores_paginas_visitas = pgTable(
  "criadores_paginas_visitas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    pagina_id: uuid("pagina_id").notNull(),
    /** Nulo = visita fora de funil (link direto da página). */
    funil_id: uuid("funil_id"),
    /** Dia em Brasília (YYYY-MM-DD). */
    dia: date("dia", { mode: "string" }).notNull(),
    visitas: integer("visitas").notNull().default(0),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_paginas_visitas_pagina", columns: [t.pagina_id, t.criador_id], foreignColumns: [criadores_paginas.id, criadores_paginas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_paginas_visitas_funil", columns: [t.funil_id, t.criador_id], foreignColumns: [criadores_funis.id, criadores_funis.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    // Alvo do upsert (funil nulo conta como valor: uma linha por página/dia fora de funil).
    unique("uq_criadores_paginas_visitas_dia").on(t.pagina_id, t.funil_id, t.dia).nullsNotDistinct(),
    index("ix_criadores_paginas_visitas_funil").on(t.funil_id, t.dia).where(sql`funil_id is not null`),
    check("ck_criadores_paginas_visitas_contador", sql`visitas >= 0`),
  ],
);

/** Clique no botão de preço que abriu o Checkout (uma venda PENDENTE da Fase 2). */
export const criadores_paginas_checkouts = pgTable(
  "criadores_paginas_checkouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    pagina_id: uuid("pagina_id").notNull(),
    funil_id: uuid("funil_id"),
    venda_id: uuid("venda_id")
      .notNull()
      .references(() => criadores_vendas.id, restrito),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_paginas_checkouts_pagina", columns: [t.pagina_id, t.criador_id], foreignColumns: [criadores_paginas.id, criadores_paginas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_paginas_checkouts_funil", columns: [t.funil_id, t.criador_id], foreignColumns: [criadores_funis.id, criadores_funis.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_paginas_checkouts_venda").on(t.venda_id),
    index("ix_criadores_paginas_checkouts_pagina").on(t.pagina_id, t.created_at),
    index("ix_criadores_paginas_checkouts_funil").on(t.funil_id, t.created_at).where(sql`funil_id is not null`),
  ],
);

export const criadores_leads = pgTable(
  "criadores_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    nome: text("nome").notNull(),
    /** Minúsculo; um lead vivo por e-mail no criador (nova captura atualiza). */
    email: text("email").notNull(),
    /** Origem da PRIMEIRA captura. */
    pagina_id: uuid("pagina_id").notNull(),
    funil_id: uuid("funil_id"),
    tag_id: uuid("tag_id"),
    utm: jsonb("utm").$type<UtmLead>().notNull().default(sql`'{}'::jsonb`),
    /** Texto exato do consentimento que a pessoa marcou e quando (da captura mais recente). */
    consentimento_texto: text("consentimento_texto").notNull(),
    consentimento_em: instante("consentimento_em").notNull(),
    capturas: integer("capturas").notNull().default(1),
    ultima_captura_em: instante("ultima_captura_em").notNull().defaultNow(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_leads_pagina", columns: [t.pagina_id, t.criador_id], foreignColumns: [criadores_paginas.id, criadores_paginas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_leads_funil", columns: [t.funil_id, t.criador_id], foreignColumns: [criadores_funis.id, criadores_funis.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_leads_tag", columns: [t.tag_id, t.criador_id], foreignColumns: [criadores_tags.id, criadores_tags.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_leads_email_vivo").on(t.criador_id, t.email).where(sql`is_deleted = false`),
    index("ix_criadores_leads_criador").on(t.criador_id, t.ultima_captura_em).where(sql`is_deleted = false`),
    index("ix_criadores_leads_funil").on(t.funil_id, t.pagina_id).where(sql`funil_id is not null and is_deleted = false`),
    check("ck_criadores_leads_nome", sql`length(trim(nome)) between 1 and 120`),
    check("ck_criadores_leads_email", sql`email = lower(email) and length(email) between 3 and 254`),
    check("ck_criadores_leads_consentimento", sql`length(consentimento_texto) between 10 and 400`),
    check("ck_criadores_leads_utm", sql`jsonb_typeof(utm) = 'object'`),
    check("ck_criadores_leads_capturas", sql`capturas >= 1`),
  ],
);

export type Pagina = typeof criadores_paginas.$inferSelect;
export type Funil = typeof criadores_funis.$inferSelect;
export type Lead = typeof criadores_leads.$inferSelect;
