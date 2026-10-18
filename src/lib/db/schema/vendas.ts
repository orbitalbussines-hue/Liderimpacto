import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { SITUACOES_ASSINATURA, SITUACOES_VENDA, TIPOS_OFERTA, listaSql } from "./_enums";
import { criadores, criadores_membros } from "./criadores";
import { criadores_afiliados, criadores_cupons, criadores_ofertas } from "./pagamentos";

/**
 * Vendas, assinaturas e eventos recebidos do Stripe (ADR-0019, RN-212 a RN-216). Centavos inteiros.
 * O criador de um evento vem SEMPRE da conta conectada (`event.account` → `criadores_stripe_contas`),
 * nunca de metadata.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

/** Assinatura (mensal/anual) de uma oferta ASSINATURA; renovações viram vendas novas. */
export const criadores_assinaturas = pgTable(
  "criadores_assinaturas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    oferta_id: uuid("oferta_id").notNull(),
    membro_id: uuid("membro_id").notNull(),
    /** `sub_…`. */
    stripe_assinatura_id: text("stripe_assinatura_id").notNull(),
    situacao: text("situacao", { enum: SITUACOES_ASSINATURA }).notNull().default("ATIVA"),
    /** Taxa (bps) gravada na assinatura do Stripe (`application_fee_percent`) ao assinar. */
    taxa_bps: integer("taxa_bps").notNull(),
    periodo_fim: instante("periodo_fim"),
    cancelar_no_fim: boolean("cancelar_no_fim").notNull().default(false),
    encerrada_em: instante("encerrada_em"),
    /** `created` do último evento de assinatura aplicado (evento fora de ordem não volta o estado). */
    evento_em: instante("evento_em"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_assinaturas_oferta", columns: [t.oferta_id, t.criador_id], foreignColumns: [criadores_ofertas.id, criadores_ofertas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_assinaturas_membro", columns: [t.membro_id, t.criador_id], foreignColumns: [criadores_membros.id, criadores_membros.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("uq_criadores_assinaturas_id_criador").on(t.id, t.criador_id),
    uniqueIndex("uq_criadores_assinaturas_stripe").on(t.stripe_assinatura_id),
    index("ix_criadores_assinaturas_criador").on(t.criador_id, t.situacao).where(sql`is_deleted = false`),
    check("ck_criadores_assinaturas_stripe", sql`stripe_assinatura_id ~ '^sub_[A-Za-z0-9]{1,100}$'`),
    check("ck_criadores_assinaturas_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_ASSINATURA)})`)),
    check("ck_criadores_assinaturas_taxa", sql`taxa_bps between 0 and 5000`),
  ],
);

/** Matrícula concedida (ou já existente) por uma venda. */
export interface MatriculaDaVenda {
  produtoId: string;
  matriculaId: string;
  resultado: "criada" | "reativada" | "ja-existia";
}

/**
 * Venda: o Checkout aberto (PENDENTE) ou a cobrança de renovação de uma assinatura (`fatura_id`).
 * Valores do momento da venda (taxa e comissão congeladas). Líquido estimado = valor − taxa (as taxas
 * do Stripe o criador vê no Dashboard dele).
 */
export const criadores_vendas = pgTable(
  "criadores_vendas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    oferta_id: uuid("oferta_id").notNull(),
    tipo: text("tipo", { enum: TIPOS_OFERTA }).notNull(),
    /** Comprador: conhecido ao abrir (sessão) ou ao pagar (e-mail do Checkout). */
    membro_id: uuid("membro_id"),
    comprador_email: text("comprador_email"),
    afiliado_id: uuid("afiliado_id"),
    cupom_id: uuid("cupom_id"),
    assinatura_id: uuid("assinatura_id"),
    checkout_sessao_id: text("checkout_sessao_id"),
    fatura_id: text("fatura_id"),
    payment_intent_id: text("payment_intent_id"),
    situacao: text("situacao", { enum: SITUACOES_VENDA }).notNull().default("PENDENTE"),
    /** Valor cobrado (já com desconto). */
    valor_centavos: integer("valor_centavos").notNull(),
    desconto_centavos: integer("desconto_centavos").notNull().default(0),
    taxa_bps: integer("taxa_bps").notNull(),
    taxa_centavos: integer("taxa_centavos").notNull(),
    comissao_centavos: integer("comissao_centavos").notNull().default(0),
    reembolsado_centavos: integer("reembolsado_centavos").notNull().default(0),
    /** Parte da taxa devolvida ao comprador no reembolso (`refund_application_fee`, proporcional). */
    taxa_devolvida_centavos: integer("taxa_devolvida_centavos").notNull().default(0),
    pago_em: instante("pago_em"),
    matriculas: jsonb("matriculas").$type<MatriculaDaVenda[]>().notNull().default(sql`'[]'::jsonb`),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_vendas_oferta", columns: [t.oferta_id, t.criador_id], foreignColumns: [criadores_ofertas.id, criadores_ofertas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_vendas_membro", columns: [t.membro_id, t.criador_id], foreignColumns: [criadores_membros.id, criadores_membros.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_vendas_afiliado", columns: [t.afiliado_id, t.criador_id], foreignColumns: [criadores_afiliados.id, criadores_afiliados.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_vendas_cupom", columns: [t.cupom_id, t.criador_id], foreignColumns: [criadores_cupons.id, criadores_cupons.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_vendas_assinatura", columns: [t.assinatura_id, t.criador_id], foreignColumns: [criadores_assinaturas.id, criadores_assinaturas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    // Ids do Stripe são globais: únicos em todas as linhas (idempotência do webhook).
    uniqueIndex("uq_criadores_vendas_sessao").on(t.checkout_sessao_id).where(sql`checkout_sessao_id is not null`),
    uniqueIndex("uq_criadores_vendas_fatura").on(t.fatura_id).where(sql`fatura_id is not null`),
    uniqueIndex("uq_criadores_vendas_payment_intent").on(t.payment_intent_id).where(sql`payment_intent_id is not null`),
    index("ix_criadores_vendas_criador").on(t.criador_id, t.created_at).where(sql`is_deleted = false`),
    index("ix_criadores_vendas_afiliado").on(t.afiliado_id).where(sql`afiliado_id is not null and is_deleted = false`),
    index("ix_criadores_vendas_cupom").on(t.cupom_id).where(sql`cupom_id is not null and is_deleted = false`),
    check("ck_criadores_vendas_origem", sql`checkout_sessao_id is not null or fatura_id is not null`),
    check("ck_criadores_vendas_tipo", sql.raw(`tipo in (${listaSql(TIPOS_OFERTA)})`)),
    check("ck_criadores_vendas_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_VENDA)})`)),
    check(
      "ck_criadores_vendas_valores",
      sql`valor_centavos >= 0 and desconto_centavos >= 0 and taxa_centavos between 0 and valor_centavos and comissao_centavos >= 0 and reembolsado_centavos between 0 and valor_centavos and taxa_devolvida_centavos between 0 and taxa_centavos`,
    ),
    check("ck_criadores_vendas_taxa_bps", sql`taxa_bps between 0 and 5000`),
    check("ck_criadores_vendas_email", sql`comprador_email is null or length(comprador_email) <= 254`),
    check("ck_criadores_vendas_matriculas", sql`jsonb_typeof(matriculas) = 'array'`),
  ],
);

// compliance:append-only — RECIBO de cada evento do Stripe (ADR-0019 item 5, RN-215): uma linha por
// `evento_id`, que nunca se altera nem se exclui (o db-migrar revoga UPDATE/DELETE do papel da app).
// Sem updated_at/deleted_at/is_deleted/modified_by (quem grava é o webhook). NUNCA guarda o payload
// (traz nome e e-mail do comprador): o worker relê o evento na API do Stripe pelo id.
export const stripe_eventos = pgTable(
  "stripe_eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evento_id: text("evento_id").notNull(),
    tipo: text("tipo").notNull(),
    /** `event.account` (nulo = evento da própria plataforma). */
    conta_id: text("conta_id"),
    /** Criador da conta conectada; nulo = conta desconhecida (registrado e ignorado). */
    criador_id: uuid("criador_id").references(() => criadores.id, restrito),
    objeto_id: text("objeto_id"),
    livemode: boolean("livemode").notNull(),
    ocorrido_em: instante("ocorrido_em").notNull(),
    created_at: instante("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_stripe_eventos_evento").on(t.evento_id),
    index("ix_stripe_eventos_criador").on(t.criador_id, t.created_at),
    check("ck_stripe_eventos_evento", sql`evento_id ~ '^evt_[A-Za-z0-9]{1,100}$'`),
    check("ck_stripe_eventos_tamanhos", sql`length(tipo) <= 100 and (conta_id is null or length(conta_id) <= 110) and (objeto_id is null or length(objeto_id) <= 255)`),
  ],
);

export type Venda = typeof criadores_vendas.$inferSelect;
export type Assinatura = typeof criadores_assinaturas.$inferSelect;
