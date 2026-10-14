import { sql } from "drizzle-orm";
import { check, index, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { PAPEIS_CRIADOR, STATUS_CRIADOR, STATUS_MEMBRO, listaSql } from "./_enums";
import { usuarios } from "./usuarios";

/**
 * Criador (white-label, ADR-0002): area propria acessada por `<slug>.<PLATAFORMA_DOMINIO>`.
 * Toda entidade de negocio pertence a um criador e toda consulta filtra por ele.
 */
export const criadores = pgTable(
  "criadores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Subdominio: so [a-z0-9-], sem hifen nas pontas (mesma regra de src/lib/criador/host.ts). */
    slug: text("slug").notNull(),
    nome: text("nome").notNull(),
    /** Hex da marca; nulo = dourado padrao da plataforma. */
    cor_marca: text("cor_marca"),
    status: text("status", { enum: STATUS_CRIADOR }).notNull().default("ATIVO"),
    /** Preparado para o dominio proprio (ainda nao ligado: ADR-0003). */
    dominio_proprio: text("dominio_proprio"),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_criadores_slug_vivo").on(t.slug).where(sql`is_deleted = false`),
    uniqueIndex("uq_criadores_dominio_proprio_vivo").on(sql`lower(${t.dominio_proprio})`).where(sql`is_deleted = false and dominio_proprio is not null`),
    check("ck_criadores_slug", sql`slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' and slug <> 'www'`),
    check("ck_criadores_cor_marca", sql`cor_marca is null or cor_marca ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'`),
    check("ck_criadores_status", sql.raw(`status in (${listaSql(STATUS_CRIADOR)})`)),
  ],
);

/**
 * Vinculo pessoa x criador: papel, situacao e ultimo acesso SAO POR CRIADOR. Lido do
 * banco a cada requisicao (exigirMembro), nunca do token.
 */
export const criadores_membros = pgTable(
  "criadores_membros",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id")
      .notNull()
      .references(() => criadores.id, { onDelete: "restrict", onUpdate: "restrict" }),
    usuario_id: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict", onUpdate: "restrict" }),
    // default = MENOR privilegio.
    papel: text("papel", { enum: PAPEIS_CRIADOR }).notNull().default("ALUNO"),
    status: text("status", { enum: STATUS_MEMBRO }).notNull().default("ATIVO"),
    ultimo_acesso_em: instante("ultimo_acesso_em"),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_criadores_membros_vivo").on(t.criador_id, t.usuario_id).where(sql`is_deleted = false`),
    // Alvo da FK composta de criadores_grupos_membros: o membro e o grupo sao do MESMO criador.
    unique("uq_criadores_membros_id_criador").on(t.id, t.criador_id),
    index("ix_criadores_membros_usuario").on(t.usuario_id),
    check("ck_criadores_membros_papel", sql.raw(`papel in (${listaSql(PAPEIS_CRIADOR)})`)),
    check("ck_criadores_membros_status", sql.raw(`status in (${listaSql(STATUS_MEMBRO)})`)),
  ],
);

export type Criador = typeof criadores.$inferSelect;
export type MembroCriador = typeof criadores_membros.$inferSelect;
