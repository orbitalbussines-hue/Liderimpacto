import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { PLATAFORMAS_INTEGRACAO, RECUSAS_INTEGRACAO, SITUACOES_EVENTO_INTEGRACAO, TIPOS_EVENTO_INTEGRACAO, listaSql } from "./_enums";
import { criadores, criadores_membros } from "./criadores";
import { produtos } from "./produtos";
import type { MatriculaDaVenda } from "./vendas";

/**
 * Integrações de venda externa — Hotmart e Eduzz (ADR-0021, RN-230 a RN-236). O criador vende na
 * plataforma externa e a nossa libera o acesso pelo webhook dela. O segredo de validação (hottok da
 * Hotmart, chave de assinatura da Eduzz) é guardado CIFRADO (mesmo formato de `webhooks/segredo.ts`,
 * AAD = id da conexão). O recibo é append-only e sem dado pessoal; o processamento (mutável) guarda o
 * comprador só enquanto o evento pode ser reprocessado.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

/** Conexão: uma viva por (criador, plataforma). A URL do webhook leva o id (`/api/integracoes/<plataforma>/<id>`). */
export const criadores_integracoes = pgTable(
  "criadores_integracoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    plataforma: text("plataforma", { enum: PLATAFORMAS_INTEGRACAO }).notNull(),
    /** `v1:<base64url(iv|tag|cifra)>`. Nunca vai à tela nem à trilha. */
    segredo_cifrado: text("segredo_cifrado").notNull(),
    /** Últimos 4 caracteres, para a tela identificar o segredo sem mostrá-lo. */
    segredo_final: text("segredo_final").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    unique("uq_criadores_integracoes_id_criador").on(t.id, t.criador_id),
    uniqueIndex("uq_criadores_integracoes_plataforma_viva").on(t.criador_id, t.plataforma).where(sql`is_deleted = false`),
    check("ck_criadores_integracoes_plataforma", sql.raw(`plataforma in (${listaSql(PLATAFORMAS_INTEGRACAO)})`)),
    check("ck_criadores_integracoes_segredo_final", sql`length(segredo_final) = 4`),
  ],
);

/** Mapeamento: produto externo → um curso nosso (um produto externo libera 1+ cursos = 1+ linhas). */
export const criadores_integracoes_produtos = pgTable(
  "criadores_integracoes_produtos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    integracao_id: uuid("integracao_id").notNull(),
    /** Id do produto na plataforma externa (Hotmart `product.id`, Eduzz `items[].productId`). */
    produto_externo: text("produto_externo").notNull(),
    /** Nome para a equipe reconhecer o produto (opcional). */
    nome_externo: text("nome_externo"),
    produto_id: uuid("produto_id").notNull(),
    /** Nulo = vitalício. Assinatura com data da próxima cobrança usa a data (+ tolerância). */
    dias_acesso: integer("dias_acesso"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_integracoes_produtos_integracao", columns: [t.integracao_id, t.criador_id], foreignColumns: [criadores_integracoes.id, criadores_integracoes.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_integracoes_produtos_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_integracoes_produtos_vivo").on(t.integracao_id, t.produto_externo, t.produto_id).where(sql`is_deleted = false`),
    check("ck_criadores_integracoes_produtos_externo", sql`produto_externo ~ '^[A-Za-z0-9_-]{1,64}$'`),
    check("ck_criadores_integracoes_produtos_nome", sql`nome_externo is null or length(trim(nome_externo)) between 1 and 120`),
    check("ck_criadores_integracoes_produtos_dias", sql`dias_acesso is null or dias_acesso between 1 and 3650`),
  ],
);

// compliance:append-only — RECIBO de cada chamada ao webhook da Hotmart/Eduzz (ADR-0021, RN-232), como
// `stripe_eventos`: uma linha por evento (ou recusa), que nunca se altera nem se exclui (o db-migrar
// revoga UPDATE/DELETE do papel da app). Sem updated_at/deleted_at/is_deleted/modified_by (quem grava
// é o webhook). NUNCA guarda payload nem dado pessoal: só ids e o que o evento significa.
export const integracoes_recibos = pgTable(
  "integracoes_recibos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    integracao_id: uuid("integracao_id").notNull(),
    plataforma: text("plataforma", { enum: PLATAFORMAS_INTEGRACAO }).notNull(),
    /** Id do evento na plataforma (Hotmart `id`, Eduzz `id`). Nulo só em recusado. */
    evento_id: text("evento_id"),
    /** Nome original do evento (`PURCHASE_APPROVED`, `myeduzz.invoice_paid`...). */
    evento: text("evento"),
    tipo: text("tipo", { enum: TIPOS_EVENTO_INTEGRACAO }),
    transacao: text("transacao"),
    assinatura: text("assinatura"),
    produto_externo: text("produto_externo"),
    recusa: text("recusa", { enum: RECUSAS_INTEGRACAO }),
    ocorrido_em: instante("ocorrido_em"),
    created_at: instante("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "fk_integracoes_recibos_integracao", columns: [t.integracao_id, t.criador_id], foreignColumns: [criadores_integracoes.id, criadores_integracoes.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_integracoes_recibos_evento").on(t.integracao_id, t.evento_id).where(sql`evento_id is not null`),
    index("ix_integracoes_recibos_criador").on(t.criador_id, t.created_at),
    index("ix_integracoes_recibos_transacao").on(t.integracao_id, t.transacao).where(sql`transacao is not null`),
    index("ix_integracoes_recibos_assinatura").on(t.integracao_id, t.assinatura).where(sql`assinatura is not null`),
    check("ck_integracoes_recibos_plataforma", sql.raw(`plataforma in (${listaSql(PLATAFORMAS_INTEGRACAO)})`)),
    check("ck_integracoes_recibos_tipo", sql.raw(`tipo is null or tipo in (${listaSql(TIPOS_EVENTO_INTEGRACAO)})`)),
    check("ck_integracoes_recibos_recusa", sql.raw(`recusa is null or recusa in (${listaSql(RECUSAS_INTEGRACAO)})`)),
    // Ou é recusado (sem id), ou é um evento aceito (com id e tipo).
    check("ck_integracoes_recibos_forma", sql`(recusa is null) = (evento_id is not null and tipo is not null)`),
    check(
      "ck_integracoes_recibos_ids",
      sql`(evento_id is null or evento_id ~ '^[A-Za-z0-9_-]{1,100}$') and (transacao is null or transacao ~ '^[A-Za-z0-9_-]{1,100}$') and (assinatura is null or assinatura ~ '^[A-Za-z0-9_-]{1,100}$') and (produto_externo is null or produto_externo ~ '^[A-Za-z0-9_-]{1,64}$') and (evento is null or length(evento) <= 60)`,
    ),
  ],
);

/** Processamento do evento (fila `integracoes`). Comprador guardado só até PROCESSADO/IGNORADO. */
export const criadores_integracoes_eventos = pgTable(
  "criadores_integracoes_eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    recibo_id: uuid("recibo_id")
      .notNull()
      .references(() => integracoes_recibos.id, restrito),
    situacao: text("situacao", { enum: SITUACOES_EVENTO_INTEGRACAO }).notNull().default("PENDENTE"),
    /** Resumo do motivo (≤ 300), nunca o payload. */
    erro: text("erro"),
    comprador_email: text("comprador_email"),
    comprador_nome: text("comprador_nome"),
    /** Próxima cobrança informada pela plataforma (assinatura): o acesso vai até ela + tolerância. */
    proxima_cobranca: instante("proxima_cobranca"),
    membro_id: uuid("membro_id"),
    matriculas: jsonb("matriculas").$type<MatriculaDaVenda[]>(),
    processado_em: instante("processado_em"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_integracoes_eventos_membro", columns: [t.membro_id, t.criador_id], foreignColumns: [criadores_membros.id, criadores_membros.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_integracoes_eventos_recibo").on(t.recibo_id),
    index("ix_criadores_integracoes_eventos_pendentes").on(t.created_at).where(sql`situacao = 'PENDENTE' and is_deleted = false`),
    check("ck_criadores_integracoes_eventos_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_EVENTO_INTEGRACAO)})`)),
    check("ck_criadores_integracoes_eventos_erro", sql`erro is null or length(erro) <= 300`),
    check("ck_criadores_integracoes_eventos_email", sql`comprador_email is null or (length(comprador_email) <= 254 and comprador_email ~ '^[^[:space:]@]+@[^[:space:]@]+$')`),
    check("ck_criadores_integracoes_eventos_nome", sql`comprador_nome is null or length(comprador_nome) <= 120`),
  ],
);

export type Integracao = typeof criadores_integracoes.$inferSelect;
export type MapeamentoIntegracao = typeof criadores_integracoes_produtos.$inferSelect;
export type ReciboIntegracao = typeof integracoes_recibos.$inferSelect;
export type EventoIntegracao = typeof criadores_integracoes_eventos.$inferSelect;
