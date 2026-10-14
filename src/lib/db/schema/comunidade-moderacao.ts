import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, pgTable, text, uniqueIndex, uuid, integer } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { SITUACOES_DENUNCIA, TIPOS_NOTIFICACAO, listaSql } from "./_enums";
import { criadores, criadores_membros } from "./criadores";
import { criadores_canais_posts, criadores_comentarios } from "./comunidade";

/**
 * Moderação e notificações (passo 8, RN-132 a RN-134; ADR-0009). FKs compostas com `criador_id`.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

/** Denúncia de qualquer membro sobre um post OU um comentário; a equipe resolve ou descarta. */
export const criadores_denuncias = pgTable(
  "criadores_denuncias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    denunciante_membro_id: uuid("denunciante_membro_id").notNull(),
    post_id: uuid("post_id"),
    comentario_id: uuid("comentario_id"),
    motivo: text("motivo").notNull(),
    situacao: text("situacao", { enum: SITUACOES_DENUNCIA }).notNull().default("ABERTA"),
    resolvida_em: instante("resolvida_em"),
    /** O que a equipe decidiu (texto livre curto). */
    decisao: text("decisao"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_criadores_denuncias_denunciante",
      columns: [t.denunciante_membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_denuncias_post", columns: [t.post_id, t.criador_id], foreignColumns: [criadores_canais_posts.id, criadores_canais_posts.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_criadores_denuncias_comentario",
      columns: [t.comentario_id, t.criador_id],
      foreignColumns: [criadores_comentarios.id, criadores_comentarios.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    // Uma denúncia viva por pessoa e alvo.
    uniqueIndex("uq_criadores_denuncias_post_vivo").on(t.denunciante_membro_id, t.post_id).where(sql`is_deleted = false and post_id is not null`),
    uniqueIndex("uq_criadores_denuncias_comentario_vivo").on(t.denunciante_membro_id, t.comentario_id).where(sql`is_deleted = false and comentario_id is not null`),
    index("ix_criadores_denuncias_fila").on(t.criador_id, t.situacao, t.created_at.desc()).where(sql`is_deleted = false`),
    check("ck_criadores_denuncias_alvo", sql`num_nonnulls(post_id, comentario_id) = 1`),
    check("ck_criadores_denuncias_motivo", sql`char_length(trim(motivo)) between 3 and 500`),
    check("ck_criadores_denuncias_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_DENUNCIA)})`)),
    check("ck_criadores_denuncias_resolucao", sql`(situacao = 'ABERTA') = (resolvida_em is null)`),
  ],
);

/** Membro silenciado na comunidade (não publica nem comenta) até `ate`. Uma linha viva por membro. */
export const criadores_membros_silenciamentos = pgTable(
  "criadores_membros_silenciamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    membro_id: uuid("membro_id").notNull(),
    ate: instante("ate").notNull(),
    motivo: text("motivo").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_criadores_membros_silenciamentos_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_membros_silenciamentos_vivo").on(t.membro_id).where(sql`is_deleted = false`),
    check("ck_criadores_membros_silenciamentos_motivo", sql`char_length(trim(motivo)) between 3 and 500`),
  ],
);

/** Dados da notificação: só ids e rótulos curtos (nunca e-mail, texto do post ou dado da conta). */
export interface DadosNotificacao {
  atorNome?: string;
  postId?: string;
  comentarioId?: string;
  aulaId?: string;
  aulaTitulo?: string;
  canalNome?: string;
  produtoTitulo?: string;
  produtoSlug?: string;
  certificadoId?: string;
  denunciaId?: string;
}

/**
 * Notificação in-app por MEMBRO (o vínculo já isola o criador). `chave` = idempotência e
 * agregação (curtidas: uma por post por dia, `atores` = quem curtiu, sem repetir). Nunca se apaga:
 * a retenção arquiva (`arquivada_em`) e toda leitura ignora as arquivadas.
 */
export const criadores_membros_notificacoes = pgTable(
  "criadores_membros_notificacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    membro_id: uuid("membro_id").notNull(),
    tipo: text("tipo", { enum: TIPOS_NOTIFICACAO }).notNull(),
    dados: jsonb("dados").$type<DadosNotificacao>().notNull().default({}),
    chave: text("chave"),
    /** Ids dos membros que geraram a notificação agregada (curtidas), sem repetir. */
    atores: jsonb("atores").$type<string[]>().notNull().default([]),
    total: integer("total").notNull().default(1),
    /** Último evento (a agregação "sobe" a notificação): ordena a lista e conta a retenção. */
    evento_em: instante("evento_em").notNull().defaultNow(),
    lida_em: instante("lida_em"),
    arquivada_em: instante("arquivada_em"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_criadores_membros_notificacoes_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_membros_notificacoes_chave").on(t.membro_id, t.chave).where(sql`chave is not null`),
    index("ix_criadores_membros_notificacoes_lista").on(t.membro_id, t.evento_em.desc(), t.id.desc()).where(sql`is_deleted = false and arquivada_em is null`),
    // Contador do sino: índice PARCIAL só com as não lidas.
    index("ix_criadores_membros_notificacoes_nao_lidas").on(t.membro_id, t.evento_em).where(sql`is_deleted = false and arquivada_em is null and lida_em is null`),
    index("ix_criadores_membros_notificacoes_retencao").on(t.evento_em).where(sql`arquivada_em is null`),
    check("ck_criadores_membros_notificacoes_tipo", sql.raw(`tipo in (${listaSql(TIPOS_NOTIFICACAO)})`)),
    check("ck_criadores_membros_notificacoes_total", sql`total >= 1`),
  ],
);

export type Denuncia = typeof criadores_denuncias.$inferSelect;
export type Notificacao = typeof criadores_membros_notificacoes.$inferSelect;
