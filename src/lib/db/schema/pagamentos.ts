import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, integer, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { INTERVALOS_ASSINATURA, SITUACOES_AFILIADO, SITUACOES_CUPOM, SITUACOES_OFERTA, TIPOS_CUPOM, TIPOS_OFERTA, listaSql } from "./_enums";
import { criadores } from "./criadores";
import { produtos } from "./produtos";

/**
 * Pagamentos por Stripe Connect (ADR-0019, RN-210 a RN-217): conta conectada do criador, ofertas,
 * cupons e afiliados. Valores SEMPRE em centavos inteiros (unidade mínima do Stripe; nada de ponto
 * flutuante). A taxa da plataforma fica em `criadores.taxa_plataforma_bps` (só o SUPER_ADMIN muda).
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

/** Conta Stripe do criador (direct charges, Dashboard completo, o criador paga as taxas do Stripe). */
export const criadores_stripe_contas = pgTable(
  "criadores_stripe_contas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    /** `acct_…`. Único em todas as linhas: o webhook resolve o criador por ela (`event.account`). */
    conta_id: text("conta_id").notNull(),
    cobrancas_ativas: boolean("cobrancas_ativas").notNull().default(false),
    repasses_ativos: boolean("repasses_ativos").notNull().default(false),
    dados_enviados: boolean("dados_enviados").notNull().default(false),
    /** `created` do último `account.updated` aplicado (evento mais velho não sobrescreve). */
    status_em: instante("status_em"),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_criadores_stripe_contas_criador_vivo").on(t.criador_id).where(sql`is_deleted = false`),
    uniqueIndex("uq_criadores_stripe_contas_conta").on(t.conta_id),
    check("ck_criadores_stripe_contas_conta", sql`conta_id ~ '^acct_[A-Za-z0-9]{1,100}$'`),
  ],
);

/** O que se vende: um preço (avulso ou assinatura) que libera um ou mais produtos. */
export const criadores_ofertas = pgTable(
  "criadores_ofertas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    nome: text("nome").notNull(),
    tipo: text("tipo", { enum: TIPOS_OFERTA }).notNull(),
    preco_centavos: integer("preco_centavos").notNull(),
    moeda: text("moeda").notNull().default("BRL"),
    /** Só ASSINATURA (obrigatório nela). */
    intervalo: text("intervalo", { enum: INTERVALOS_ASSINATURA }),
    /** Só AVULSO; nulo = acesso sem expiração. */
    dias_acesso: integer("dias_acesso"),
    situacao: text("situacao", { enum: SITUACOES_OFERTA }).notNull().default("ATIVA"),
    ...colunasAuditoria,
  },
  (t) => [
    unique("uq_criadores_ofertas_id_criador").on(t.id, t.criador_id),
    check("ck_criadores_ofertas_nome", sql`length(trim(nome)) between 2 and 80`),
    check("ck_criadores_ofertas_tipo", sql.raw(`tipo in (${listaSql(TIPOS_OFERTA)})`)),
    check("ck_criadores_ofertas_preco", sql`preco_centavos between 100 and 100000000`),
    check("ck_criadores_ofertas_moeda", sql`moeda = 'BRL'`),
    check("ck_criadores_ofertas_intervalo", sql.raw(`(tipo = 'ASSINATURA') = (intervalo is not null) and (intervalo is null or intervalo in (${listaSql(INTERVALOS_ASSINATURA)}))`)),
    check("ck_criadores_ofertas_dias", sql`dias_acesso is null or (tipo = 'AVULSO' and dias_acesso between 1 and 3650)`),
    check("ck_criadores_ofertas_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_OFERTA)})`)),
  ],
);

export const criadores_ofertas_produtos = pgTable(
  "criadores_ofertas_produtos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    oferta_id: uuid("oferta_id").notNull(),
    produto_id: uuid("produto_id").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_ofertas_produtos_oferta", columns: [t.oferta_id, t.criador_id], foreignColumns: [criadores_ofertas.id, criadores_ofertas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_ofertas_produtos_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_ofertas_produtos_vivo").on(t.oferta_id, t.produto_id).where(sql`is_deleted = false`),
  ],
);

/** Cupom de desconto aplicado pela plataforma no preço da sessão (o Stripe recebe o valor final). */
export const criadores_cupons = pgTable(
  "criadores_cupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    /** MAIÚSCULO, letras e números (src/lib/pagamentos/regras.ts). */
    codigo: text("codigo").notNull(),
    tipo: text("tipo", { enum: TIPOS_CUPOM }).notNull(),
    /** PERCENTUAL: 1..10000 bps (10000 = 100%). */
    percentual_bps: integer("percentual_bps"),
    /** VALOR: desconto fixo em centavos. */
    valor_centavos: integer("valor_centavos"),
    /** Nula = vale para todas as ofertas do criador (FK composta: nulo não confere, MATCH SIMPLE). */
    oferta_id: uuid("oferta_id"),
    valido_ate: instante("valido_ate"),
    limite_usos: integer("limite_usos"),
    situacao: text("situacao", { enum: SITUACOES_CUPOM }).notNull().default("ATIVO"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_cupons_oferta", columns: [t.oferta_id, t.criador_id], foreignColumns: [criadores_ofertas.id, criadores_ofertas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("uq_criadores_cupons_id_criador").on(t.id, t.criador_id),
    uniqueIndex("uq_criadores_cupons_codigo_vivo").on(t.criador_id, t.codigo).where(sql`is_deleted = false`),
    check("ck_criadores_cupons_codigo", sql`codigo ~ '^[A-Z0-9]{3,20}$'`),
    check("ck_criadores_cupons_tipo", sql.raw(`tipo in (${listaSql(TIPOS_CUPOM)})`)),
    check(
      "ck_criadores_cupons_desconto",
      sql`(tipo = 'PERCENTUAL' and percentual_bps between 1 and 10000 and valor_centavos is null) or (tipo = 'VALOR' and valor_centavos between 1 and 100000000 and percentual_bps is null)`,
    ),
    check("ck_criadores_cupons_limite", sql`limite_usos is null or limite_usos between 1 and 100000`),
    check("ck_criadores_cupons_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_CUPOM)})`)),
  ],
);

/**
 * Afiliado: código/link que atribui a venda e comissão CALCULADA (o criador paga por fora). Não
 * precisa ser membro da área.
 */
export const criadores_afiliados = pgTable(
  "criadores_afiliados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    nome: text("nome").notNull(),
    email: text("email").notNull(),
    codigo: text("codigo").notNull(),
    /** Sobre (valor pago − taxa da plataforma). 0..9000 bps. */
    comissao_bps: integer("comissao_bps").notNull(),
    situacao: text("situacao", { enum: SITUACOES_AFILIADO }).notNull().default("ATIVO"),
    ...colunasAuditoria,
  },
  (t) => [
    unique("uq_criadores_afiliados_id_criador").on(t.id, t.criador_id),
    uniqueIndex("uq_criadores_afiliados_codigo_vivo").on(t.criador_id, t.codigo).where(sql`is_deleted = false`),
    check("ck_criadores_afiliados_nome", sql`length(trim(nome)) between 2 and 120`),
    check("ck_criadores_afiliados_email", sql`length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+$'`),
    check("ck_criadores_afiliados_codigo", sql`codigo ~ '^[A-Z0-9]{4,20}$'`),
    check("ck_criadores_afiliados_comissao", sql`comissao_bps between 0 and 9000`),
    check("ck_criadores_afiliados_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_AFILIADO)})`)),
  ],
);

export type ContaStripe = typeof criadores_stripe_contas.$inferSelect;
export type Oferta = typeof criadores_ofertas.$inferSelect;
export type Cupom = typeof criadores_cupons.$inferSelect;
export type Afiliado = typeof criadores_afiliados.$inferSelect;
