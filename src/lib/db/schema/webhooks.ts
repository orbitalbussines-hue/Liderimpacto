import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { EVENTOS_WEBHOOK, SITUACOES_ENTREGA_WEBHOOK, SITUACOES_WEBHOOK, listaSql } from "./_enums";
import { criadores } from "./criadores";

/**
 * Webhooks de saída (ADR-0018 item 5, RN-204): o criador cadastra URLs https que recebem eventos,
 * assinados com HMAC-SHA256. O segredo é mostrado UMA vez e guardado cifrado (AES-256-GCM, chave
 * derivada do BETTER_AUTH_SECRET, AAD = id do webhook): precisa ser recuperável para assinar.
 * Cada evento vira uma ENTREGA por webhook inscrito, entregue pela fila `webhooks`.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

export const criadores_webhooks = pgTable(
  "criadores_webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    nome: text("nome").notNull(),
    url: text("url").notNull(),
    eventos: text("eventos", { enum: EVENTOS_WEBHOOK }).array().notNull(),
    situacao: text("situacao", { enum: SITUACOES_WEBHOOK }).notNull().default("ATIVO"),
    /** `v1:<base64url(iv|tag|cifra)>` (src/lib/webhooks/segredo.ts). Nunca vai à tela nem à trilha. */
    segredo_cifrado: text("segredo_cifrado").notNull(),
    /** Últimos 4 caracteres, para a tela identificar o segredo sem mostrá-lo. */
    segredo_final: text("segredo_final").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    unique("uq_criadores_webhooks_id_criador").on(t.id, t.criador_id),
    index("ix_criadores_webhooks_criador").on(t.criador_id).where(sql`is_deleted = false`),
    check("ck_criadores_webhooks_nome", sql`length(trim(nome)) between 2 and 60`),
    check("ck_criadores_webhooks_url", sql`url ~ '^https://[^[:space:]]+$' and length(url) <= 500`),
    check("ck_criadores_webhooks_eventos", sql.raw(`cardinality(eventos) >= 1 and eventos <@ array[${listaSql(EVENTOS_WEBHOOK)}]::text[]`)),
    check("ck_criadores_webhooks_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_WEBHOOK)})`)),
    check("ck_criadores_webhooks_segredo_final", sql`length(segredo_final) = 4`),
  ],
);

/** O que vai no corpo (JSON) da entrega: o mesmo objeto em toda tentativa. */
export interface PayloadWebhook {
  id: string;
  evento: string;
  ocorridoEm: string;
  criador: { id: string; slug: string };
  dados: Record<string, unknown>;
}

export const criadores_webhooks_entregas = pgTable(
  "criadores_webhooks_entregas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    webhook_id: uuid("webhook_id").notNull(),
    evento: text("evento", { enum: EVENTOS_WEBHOOK }).notNull(),
    payload: jsonb("payload").$type<PayloadWebhook>().notNull(),
    situacao: text("situacao", { enum: SITUACOES_ENTREGA_WEBHOOK }).notNull().default("PENDENTE"),
    tentativas: integer("tentativas").notNull().default(0),
    /** Último status HTTP recebido (nulo = não houve resposta: DNS, recusa SSRF, timeout). */
    status_http: integer("status_http"),
    /** Resumo do último erro (até 300), nunca o corpo da resposta. */
    erro: text("erro"),
    proxima_tentativa_em: instante("proxima_tentativa_em"),
    entregue_em: instante("entregue_em"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_webhooks_entregas_webhook", columns: [t.webhook_id, t.criador_id], foreignColumns: [criadores_webhooks.id, criadores_webhooks.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_criadores_webhooks_entregas_webhook").on(t.webhook_id, t.created_at).where(sql`is_deleted = false`),
    // Reenfileirar ao subir o worker (fila fora do ar quando o evento aconteceu).
    index("ix_criadores_webhooks_entregas_pendentes").on(t.created_at).where(sql`situacao = 'PENDENTE' and is_deleted = false`),
    check("ck_criadores_webhooks_entregas_evento", sql.raw(`evento in (${listaSql(EVENTOS_WEBHOOK)})`)),
    check("ck_criadores_webhooks_entregas_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_ENTREGA_WEBHOOK)})`)),
    check("ck_criadores_webhooks_entregas_tentativas", sql`tentativas >= 0`),
    check("ck_criadores_webhooks_entregas_status", sql`status_http is null or status_http between 100 and 599`),
    check("ck_criadores_webhooks_entregas_erro", sql`erro is null or length(erro) <= 300`),
  ],
);

export type Webhook = typeof criadores_webhooks.$inferSelect;
export type EntregaWebhook = typeof criadores_webhooks_entregas.$inferSelect;
