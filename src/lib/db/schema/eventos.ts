import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { PUBLICOS_EVENTO, SITUACOES_EVENTO, listaSql } from "./_enums";
import { criadores, criadores_membros } from "./criadores";
import { criadores_grupos } from "./criadores-grupos";
import { produtos, produtos_modulos_aulas } from "./produtos";
import { usuarios } from "./usuarios";

/**
 * Eventos ao vivo do criador (aula ao vivo, mentoria em grupo, live) com link externo — ADR-0011,
 * RN-142 e RN-143. `criador_id` em todas as tabelas + FKs COMPOSTAS (filho, criador): o banco recusa
 * evento com curso, aula, grupo ou inscrito de outro criador mesmo que o serviço erre.
 *
 * - O link NUNCA vai para a tela fora da janela (15 min antes do início até o fim): quem decide é
 *   `situacaoDoLink` (src/lib/eventos/regras.ts) nas consultas do servidor.
 * - Quem vê: `veEventoSql` (src/lib/eventos/sql.ts), uma regra só para lista, inscrição e avisos.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

/** https + host com ponto (mesma regra de `linkDeEventoValido`). */
export const REGEX_LINK_EVENTO_SQL = `^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$`;

export const criadores_eventos = pgTable(
  "criadores_eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    titulo: text("titulo").notNull(),
    /** Texto PURO (como a comunidade): a tela escapa; links por `segmentosDeTexto`. */
    descricao: text("descricao").notNull().default(""),
    inicio_em: instante("inicio_em").notNull(),
    duracao_min: integer("duracao_min").notNull(),
    /** Zoom/Meet/YouTube...: https obrigatório. Nulo só em RASCUNHO (a equipe pode criar antes de ter a sala). */
    link_acesso: text("link_acesso"),
    situacao: text("situacao", { enum: SITUACOES_EVENTO }).notNull().default("RASCUNHO"),
    publico: text("publico", { enum: PUBLICOS_EVENTO }).notNull().default("TODOS"),
    /** Público PRODUTO: só quem tem matrícula valendo neste curso. */
    produto_id: uuid("produto_id"),
    /** "Assistir a gravação": aula do catálogo (o acesso segue `motivoDoBloqueio` da aula). */
    gravacao_aula_id: uuid("gravacao_aula_id"),
    publicado_em: instante("publicado_em"),
    cancelado_em: instante("cancelado_em"),
    criado_por: uuid("criado_por").notNull().references(() => usuarios.id, restrito),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_eventos_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_criadores_eventos_gravacao",
      columns: [t.gravacao_aula_id, t.criador_id],
      foreignColumns: [produtos_modulos_aulas.id, produtos_modulos_aulas.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("uq_criadores_eventos_id_criador").on(t.id, t.criador_id),
    // Agenda (próximos/passados) e o reagendamento dos lembretes ao subir o worker.
    index("ix_criadores_eventos_agenda").on(t.criador_id, t.inicio_em).where(sql`is_deleted = false`),
    check("ck_criadores_eventos_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_EVENTO)})`)),
    check("ck_criadores_eventos_publico", sql.raw(`publico in (${listaSql(PUBLICOS_EVENTO)})`)),
    check("ck_criadores_eventos_produto", sql`(publico = 'PRODUTO') = (produto_id is not null)`),
    check("ck_criadores_eventos_titulo", sql`char_length(trim(titulo)) between 3 and 120`),
    check("ck_criadores_eventos_descricao", sql`char_length(descricao) <= 2000`),
    check("ck_criadores_eventos_duracao", sql`duracao_min between 5 and 720`),
    check("ck_criadores_eventos_link", sql.raw(`link_acesso is null or (char_length(link_acesso) <= 500 and link_acesso ~* '${REGEX_LINK_EVENTO_SQL}')`)),
    check("ck_criadores_eventos_link_publicado", sql`situacao = 'RASCUNHO' or link_acesso is not null`),
    check("ck_criadores_eventos_publicado_em", sql`situacao <> 'PUBLICADO' or publicado_em is not null`),
    check("ck_criadores_eventos_cancelado_em", sql`(situacao = 'CANCELADO') = (cancelado_em is not null)`),
  ],
);

/** Grupos do público GRUPOS (vê quem está em ao menos um). */
export const criadores_eventos_grupos = pgTable(
  "criadores_eventos_grupos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    evento_id: uuid("evento_id").notNull(),
    grupo_id: uuid("grupo_id").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_eventos_grupos_evento", columns: [t.evento_id, t.criador_id], foreignColumns: [criadores_eventos.id, criadores_eventos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_eventos_grupos_grupo", columns: [t.grupo_id, t.criador_id], foreignColumns: [criadores_grupos.id, criadores_grupos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_eventos_grupos_vivo").on(t.evento_id, t.grupo_id).where(sql`is_deleted = false`),
  ],
);

/**
 * "Vou participar": UMA inscrição viva por (evento, membro). Desconfirmar = soft delete; confirmar de
 * novo cria outra linha (o histórico fica). Confirmado em = `created_at`.
 */
export const criadores_eventos_inscricoes = pgTable(
  "criadores_eventos_inscricoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    evento_id: uuid("evento_id").notNull(),
    membro_id: uuid("membro_id").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_eventos_inscricoes_evento", columns: [t.evento_id, t.criador_id], foreignColumns: [criadores_eventos.id, criadores_eventos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_criadores_eventos_inscricoes_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_eventos_inscricoes_vivo").on(t.evento_id, t.membro_id).where(sql`is_deleted = false`),
    index("ix_criadores_eventos_inscricoes_membro").on(t.membro_id).where(sql`is_deleted = false`),
  ],
);

export type Evento = typeof criadores_eventos.$inferSelect;
export type InscricaoEvento = typeof criadores_eventos_inscricoes.$inferSelect;
