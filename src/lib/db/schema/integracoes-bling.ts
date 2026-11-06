import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { SITUACOES_AUTORIZACAO_INTEGRACAO, SITUACOES_PEDIDO_MARKETPLACE, listaSql } from "./_enums";
import { criadores, criadores_membros } from "./criadores";
import { criadores_integracoes } from "./integracoes";
import type { MatriculaDaVenda } from "./vendas";

/**
 * Bling — pedidos de marketplace (Mercado Livre, TikTok Shop) resgatados pelo comprador (ADR-0024,
 * RN-260 a RN-266). A conexão é a linha BLING de `criadores_integracoes` (o segredo cifrado lá é o
 * client_secret, que também assina o webhook). Aqui ficam a autorização OAuth (tokens CIFRADOS), o
 * espelho do pedido (CPF só como HMAC, nunca em claro) e o resgate (um por pedido).
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

/** Autorização OAuth da conexão Bling: uma viva por conexão. Mexida pelo sistema (renovação) sem tocar a trava da conexão. */
export const criadores_integracoes_oauth = pgTable(
  "criadores_integracoes_oauth",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    integracao_id: uuid("integracao_id").notNull(),
    /** client_id do app do criador no Bling (não é segredo; a tela mostra só os 4 finais). */
    cliente_id: text("cliente_id").notNull(),
    /** `v1:` AES-256-GCM de `{ a: access, r: refresh }`, AAD `bling-tokens:<integracao>`. Nunca vai à tela nem à trilha. */
    tokens_cifrados: text("tokens_cifrados"),
    token_expira_em: instante("token_expira_em"),
    /** Última troca de token que deu certo (a renovação diária mantém o refresh token vivo). */
    renovado_em: instante("renovado_em"),
    situacao: text("situacao", { enum: SITUACOES_AUTORIZACAO_INTEGRACAO }).notNull().default("AGUARDANDO"),
    /** Motivo curto da última falha (≤ 300), nunca o corpo da resposta. */
    erro: text("erro"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_integracoes_oauth_integracao", columns: [t.integracao_id, t.criador_id], foreignColumns: [criadores_integracoes.id, criadores_integracoes.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_integracoes_oauth_viva").on(t.integracao_id).where(sql`is_deleted = false`),
    check("ck_criadores_integracoes_oauth_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_AUTORIZACAO_INTEGRACAO)})`)),
    check("ck_criadores_integracoes_oauth_cliente", sql`cliente_id ~ '^[A-Za-z0-9_-]{8,100}$'`),
    check("ck_criadores_integracoes_oauth_erro", sql`erro is null or length(erro) <= 300`),
  ],
);

/** Espelho do pedido do Bling (estado ATUAL, relido na API a cada aviso). Um por (conexão, pedido). */
export const criadores_integracoes_pedidos = pgTable(
  "criadores_integracoes_pedidos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    integracao_id: uuid("integracao_id").notNull(),
    /** Id do pedido no Bling (`id`). A matrícula usa `bling:<pedido_id>:<curso>`. */
    pedido_id: text("pedido_id").notNull(),
    /** Número do pedido no marketplace (`numeroLoja`), sem espaços. Comparado sem diferenciar caixa. */
    numero_loja: text("numero_loja"),
    /** Número do pedido no Bling (`numero`), só para a equipe achar lá. */
    numero: text("numero"),
    /** Loja/canal no Bling (`loja.id`). */
    loja_id: text("loja_id"),
    /** HMAC-SHA256 (hex) de `<criador>:<CPF só dígitos>`; nulo = pedido sem CPF (não resgata). */
    cpf_hmac: text("cpf_hmac"),
    /** Códigos (SKU) dos itens; o mapeamento usa o SKU como produto externo. */
    skus: jsonb("skus").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    situacao: text("situacao", { enum: SITUACOES_PEDIDO_MARKETPLACE }).notNull(),
    /** `situacao.valor` do Bling (2 = cancelado). Nulo = excluído no Bling. */
    situacao_bling: integer("situacao_bling"),
    sincronizado_em: instante("sincronizado_em").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_integracoes_pedidos_integracao", columns: [t.integracao_id, t.criador_id], foreignColumns: [criadores_integracoes.id, criadores_integracoes.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("uq_criadores_integracoes_pedidos_id_criador").on(t.id, t.criador_id),
    uniqueIndex("uq_criadores_integracoes_pedidos_pedido").on(t.integracao_id, t.pedido_id),
    index("ix_criadores_integracoes_pedidos_numero").on(t.integracao_id, sql`lower(${t.numero_loja})`),
    index("ix_criadores_integracoes_pedidos_criador").on(t.criador_id, t.updated_at),
    check("ck_criadores_integracoes_pedidos_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_PEDIDO_MARKETPLACE)})`)),
    check(
      "ck_criadores_integracoes_pedidos_campos",
      sql`pedido_id ~ '^[0-9]{1,20}$' and (numero_loja is null or length(numero_loja) between 1 and 60) and (numero is null or length(numero) <= 20) and (loja_id is null or loja_id ~ '^[0-9]{1,20}$') and (cpf_hmac is null or cpf_hmac ~ '^[0-9a-f]{64}$') and jsonb_typeof(skus) = 'array'`,
    ),
  ],
);

/** Resgate do pedido pelo comprador: UM por pedido (índice único), com a pessoa e as matrículas. */
export const criadores_integracoes_pedidos_resgates = pgTable(
  "criadores_integracoes_pedidos_resgates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    pedido_id: uuid("pedido_id").notNull(),
    membro_id: uuid("membro_id").notNull(),
    matriculas: jsonb("matriculas").$type<MatriculaDaVenda[]>().notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_integracoes_pedidos_resgates_pedido", columns: [t.pedido_id, t.criador_id], foreignColumns: [criadores_integracoes_pedidos.id, criadores_integracoes_pedidos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_integracoes_pedidos_resgates_membro", columns: [t.membro_id, t.criador_id], foreignColumns: [criadores_membros.id, criadores_membros.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_integracoes_pedidos_resgates_pedido").on(t.pedido_id),
    check("ck_criadores_integracoes_pedidos_resgates_matriculas", sql`jsonb_typeof(matriculas) = 'array' and jsonb_array_length(matriculas) >= 1`),
  ],
);

export type AutorizacaoIntegracao = typeof criadores_integracoes_oauth.$inferSelect;
export type PedidoMarketplace = typeof criadores_integracoes_pedidos.$inferSelect;
