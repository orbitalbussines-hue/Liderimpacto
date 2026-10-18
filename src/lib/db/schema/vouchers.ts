import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { SITUACOES_VOUCHER, listaSql } from "./_enums";
import { criadores, criadores_membros } from "./criadores";
import { produtos } from "./produtos";

/**
 * Vouchers (ADR-0018 item 2, RN-201): código que o aluno resgata para ganhar matrícula em um ou
 * mais produtos. O resgate passa por `matricular` (origem VOUCHER) e fica registrado com as
 * matrículas que gerou. Limites (total e por pessoa) contados nos resgates vivos, com o voucher
 * travado (`FOR UPDATE`) durante o resgate: dois cliques nunca passam do limite.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

export const criadores_vouchers = pgTable(
  "criadores_vouchers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    /** Sempre MAIÚSCULO e sem 0/O/1/I (src/lib/vouchers/regras.ts): a comparação não depende de caixa. */
    codigo: text("codigo").notNull(),
    descricao: text("descricao").notNull().default(""),
    situacao: text("situacao", { enum: SITUACOES_VOUCHER }).notNull().default("ATIVO"),
    /** Nula = sem prazo. Depois dela o resgate é recusado (a situação não muda sozinha). */
    valido_ate: instante("valido_ate"),
    /** Nulo = sem limite total. */
    limite_usos: integer("limite_usos"),
    limite_por_pessoa: integer("limite_por_pessoa").notNull().default(1),
    /** Dias de acesso da matrícula gerada; nulo = sem expiração. */
    dias_acesso: integer("dias_acesso"),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_criadores_vouchers_codigo_vivo").on(t.criador_id, t.codigo).where(sql`is_deleted = false`),
    unique("uq_criadores_vouchers_id_criador").on(t.id, t.criador_id),
    check("ck_criadores_vouchers_codigo", sql`codigo ~ '^[A-HJ-NP-Z2-9]{6,16}$'`),
    check("ck_criadores_vouchers_descricao", sql`length(descricao) <= 200`),
    check("ck_criadores_vouchers_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_VOUCHER)})`)),
    check("ck_criadores_vouchers_limite_usos", sql`limite_usos is null or limite_usos between 1 and 100000`),
    check("ck_criadores_vouchers_limite_por_pessoa", sql`limite_por_pessoa between 1 and 100`),
    check("ck_criadores_vouchers_dias_acesso", sql`dias_acesso is null or dias_acesso between 1 and 3650`),
  ],
);

/** Produtos que o voucher libera (ao menos um, conferido no serviço). */
export const criadores_vouchers_produtos = pgTable(
  "criadores_vouchers_produtos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    voucher_id: uuid("voucher_id").notNull(),
    produto_id: uuid("produto_id").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_vouchers_produtos_voucher", columns: [t.voucher_id, t.criador_id], foreignColumns: [criadores_vouchers.id, criadores_vouchers.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_vouchers_produtos_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_vouchers_produtos_vivo").on(t.voucher_id, t.produto_id).where(sql`is_deleted = false`),
  ],
);

/** Matrícula gerada (ou já existente) por um resgate. */
export interface MatriculaDoResgate {
  produtoId: string;
  matriculaId: string;
  resultado: "criada" | "reativada" | "ja-existia";
}

export const criadores_vouchers_resgates = pgTable(
  "criadores_vouchers_resgates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    voucher_id: uuid("voucher_id").notNull(),
    membro_id: uuid("membro_id").notNull(),
    matriculas: jsonb("matriculas").$type<MatriculaDoResgate[]>().notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_vouchers_resgates_voucher", columns: [t.voucher_id, t.criador_id], foreignColumns: [criadores_vouchers.id, criadores_vouchers.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_vouchers_resgates_membro", columns: [t.membro_id, t.criador_id], foreignColumns: [criadores_membros.id, criadores_membros.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_criadores_vouchers_resgates_voucher").on(t.voucher_id, t.created_at).where(sql`is_deleted = false`),
    index("ix_criadores_vouchers_resgates_membro").on(t.membro_id, t.voucher_id).where(sql`is_deleted = false`),
    check("ck_criadores_vouchers_resgates_matriculas", sql`jsonb_typeof(matriculas) = 'array' and jsonb_array_length(matriculas) >= 1`),
  ],
);

export type Voucher = typeof criadores_vouchers.$inferSelect;
