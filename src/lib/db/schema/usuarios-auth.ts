import { bigint, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { criadores } from "./criadores";
import { usuarios } from "./usuarios";

/**
 * Tabelas do Better Auth (de-para em `_campos-auth.ts`).
 *
 * `usuarios_contas` guarda o hash da senha. Nunca e apagada (usuario se desativa, nao se
 * exclui), por isso tem as 5 colunas de auditoria. As colunas de token OAuth sao exigidas
 * pelo schema do Better Auth e ficam nulas: nao ha login social.
 */
export const usuarios_contas = pgTable(
  "usuarios_contas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuario_id: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict", onUpdate: "restrict" }),
    conta_id: text("conta_id").notNull(),
    provedor_id: text("provedor_id").notNull(),
    senha_hash: text("senha_hash"),
    access_token: text("access_token"),
    refresh_token: text("refresh_token"),
    id_token: text("id_token"),
    access_token_expira_em: instante("access_token_expira_em"),
    refresh_token_expira_em: instante("refresh_token_expira_em"),
    escopo: text("escopo"),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_usuarios_contas_provedor").on(t.provedor_id, t.conta_id),
    index("ix_usuarios_contas_usuario").on(t.usuario_id),
  ],
);

// compliance:framework — o Better Auth apaga sessao FISICAMENTE (logout, expiracao,
// revogacao) e nao tem soft delete. `is_deleted = false` numa linha que a biblioteca
// vai apagar seria mentira gravada.
export const usuarios_sessoes = pgTable(
  "usuarios_sessoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull(),
    usuario_id: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict", onUpdate: "restrict" }),
    /**
     * Area em que a sessao nasceu (nulo = plataforma). A sessao so vale no MESMO host
     * (ADR-0003): o cookie ja e por host, e o servidor confere de novo aqui.
     */
    criador_id: uuid("criador_id").references(() => criadores.id, { onDelete: "restrict", onUpdate: "restrict" }),
    expira_em: instante("expira_em").notNull(),
    ip: text("ip"),
    agente: text("agente"),
    created_at: instante("created_at").notNull().defaultNow(),
    updated_at: instante("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_usuarios_sessoes_token").on(t.token),
    index("ix_usuarios_sessoes_usuario").on(t.usuario_id),
  ],
);

// compliance:framework — token de definir senha e desafio do segundo fator: a
// biblioteca apaga a linha ao consumir ou expirar.
export const usuarios_verificacoes = pgTable(
  "usuarios_verificacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identificador: text("identificador").notNull(),
    valor: text("valor").notNull(),
    expira_em: instante("expira_em").notNull(),
    created_at: instante("created_at").notNull().defaultNow(),
    updated_at: instante("updated_at").notNull().defaultNow(),
  },
  (t) => [index("ix_usuarios_verificacoes_identificador").on(t.identificador), index("ix_usuarios_verificacoes_valor").on(t.valor)],
);

// compliance:framework — contador de limite (rate limit) do Better Auth, persistido no
// banco (o padrao e um Map em memoria, que some no restart). Os tetos do app (teto.ts)
// usam a mesma tabela. A biblioteca sobrescreve e expira as linhas sozinha.
export const usuarios_limites = pgTable(
  "usuarios_limites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chave: text("chave").notNull(),
    contagem: integer("contagem").notNull(),
    ultima_requisicao: bigint("ultima_requisicao", { mode: "number" }).notNull(),
  },
  (t) => [uniqueIndex("uq_usuarios_limites_chave").on(t.chave)],
);
