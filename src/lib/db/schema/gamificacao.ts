import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { METAS_DESAFIO, MOTIVOS_PONTOS, PUBLICOS_DESAFIO, SITUACOES_DESAFIO, listaSql } from "./_enums";
import { produtos_avaliacoes } from "./avaliacoes";
import { criadores, criadores_membros } from "./criadores";
import { criadores_grupos } from "./criadores-grupos";
import { produtos } from "./produtos";
import { usuarios } from "./usuarios";
import { NIVEIS_PADRAO, PONTOS_PADRAO, type NivelGamificacao } from "../../gamificacao/padroes";

/**
 * Gamificação (ADR-0012, RN-144 a RN-147): configuração por criador, razão de pontos append-only,
 * desafios com opt-in. `criador_id` + FKs COMPOSTAS em tudo (nada mistura criadores). Saldo, nível,
 * ranking e progresso de desafio são CALCULADOS (soma do razão / dados existentes): não há contador
 * que possa divergir.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;


/**
 * Configuração 1:1 (uma linha viva por criador; sem linha = DESLIGADA com os padrões). Desligada =
 * nenhum ponto automático é concedido; ligar roda o recálculo retroativo (idempotente).
 */
export const criadores_gamificacao = pgTable(
  "criadores_gamificacao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    ligada: boolean("ligada").notNull().default(false),
    pontos_aula_concluida: integer("pontos_aula_concluida").notNull().default(PONTOS_PADRAO.aulaConcluida),
    pontos_curso_concluido: integer("pontos_curso_concluido").notNull().default(PONTOS_PADRAO.cursoConcluido),
    pontos_avaliacao_aprovada: integer("pontos_avaliacao_aprovada").notNull().default(PONTOS_PADRAO.avaliacaoAprovada),
    /** Só a PRIMEIRA publicação do dia (Brasília) pontua. */
    pontos_publicacao_comunidade: integer("pontos_publicacao_comunidade").notNull().default(PONTOS_PADRAO.publicacaoComunidade),
    /** Ordenados por `minimo` crescente, o primeiro com 0 (Zod `esquemaNiveis` na action). */
    niveis: jsonb("niveis").$type<NivelGamificacao[]>().notNull().default([...NIVEIS_PADRAO]),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_criadores_gamificacao_vivo").on(t.criador_id).where(sql`is_deleted = false`),
    check(
      "ck_criadores_gamificacao_pontos",
      sql`pontos_aula_concluida between 0 and 10000 and pontos_curso_concluido between 0 and 10000
        and pontos_avaliacao_aprovada between 0 and 10000 and pontos_publicacao_comunidade between 0 and 10000`,
    ),
    check("ck_criadores_gamificacao_niveis", sql`jsonb_typeof(niveis) = 'array' and jsonb_array_length(niveis) between 1 and 10`),
  ],
);

// compliance:append-only — RAZÃO de pontos: lançamento nunca se altera nem se exclui (correção =
// AJUSTE_MANUAL com sinal contrário). Sem updated_at/deleted_at/is_deleted; `modified_by` = quem
// lançou (o próprio aluno na concessão automática; DONO/ADMIN no ajuste). Em produção, revogue
// UPDATE e DELETE desta tabela do usuário de banco da aplicação.
export const criadores_membros_pontos = pgTable(
  "criadores_membros_pontos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    membro_id: uuid("membro_id").notNull(),
    motivo: text("motivo", { enum: MOTIVOS_PONTOS }).notNull(),
    pontos: integer("pontos").notNull(),
    /**
     * Idempotência: id da aula (AULA_CONCLUIDA), do curso (CURSO_CONCLUIDO), da avaliação
     * (AVALIACAO_APROVADA), do desafio (DESAFIO_CONCLUIDO), o dia AAAA-MM-DD de Brasília
     * (PUBLICACAO_COMUNIDADE) ou um uuid novo (AJUSTE_MANUAL).
     */
    referencia: text("referencia").notNull(),
    /** Quando o FATO aconteceu (conclusão, aprovação, publicação): o ranking por período usa esta data. */
    ocorrido_em: instante("ocorrido_em").notNull(),
    /** Obrigatória no AJUSTE_MANUAL; nula nos automáticos. */
    justificativa: text("justificativa"),
    created_at: instante("created_at").notNull().defaultNow(),
    modified_by: uuid("modified_by").notNull().references(() => usuarios.id, restrito),
  },
  (t) => [
    foreignKey({
      name: "fk_criadores_membros_pontos_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    // Reprocessar não dá ponto duas vezes (ON CONFLICT DO NOTHING). Vale para TODAS as linhas.
    uniqueIndex("uq_criadores_membros_pontos_fato").on(t.membro_id, t.motivo, t.referencia),
    // Ranking por período: soma por (criador, ocorrido_em) só pelo índice (membro e pontos na chave).
    index("ix_criadores_membros_pontos_ranking").on(t.criador_id, t.ocorrido_em, t.membro_id, t.pontos),
    check("ck_criadores_membros_pontos_motivo", sql.raw(`motivo in (${listaSql(MOTIVOS_PONTOS)})`)),
    check(
      "ck_criadores_membros_pontos_valor",
      sql`(motivo = 'AJUSTE_MANUAL' and pontos <> 0 and pontos between -100000 and 100000 and char_length(trim(coalesce(justificativa, ''))) between 5 and 500)
        or (motivo <> 'AJUSTE_MANUAL' and pontos between 1 and 100000 and justificativa is null)`,
    ),
    check(
      "ck_criadores_membros_pontos_referencia",
      sql`referencia ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or (motivo = 'PUBLICACAO_COMUNIDADE' and referencia ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')`,
    ),
  ],
);

/**
 * Desafio com janela `inicio_em`..`fim_em` (exclusivo) e meta. O progresso é calculado dos dados
 * existentes DENTRO da janela (src/lib/gamificacao/desafios.ts). Situação efetiva: PUBLICADO antes
 * do início = "em breve"; entre início e fim = "ativo"; depois do fim (ou ENCERRADO) = "encerrado".
 */
export const criadores_desafios = pgTable(
  "criadores_desafios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    titulo: text("titulo").notNull(),
    descricao: text("descricao").notNull().default(""),
    inicio_em: instante("inicio_em").notNull(),
    fim_em: instante("fim_em").notNull(),
    meta_tipo: text("meta_tipo", { enum: METAS_DESAFIO }).notNull(),
    /** AULAS_CONCLUIDAS e PUBLICACOES_COMUNIDADE. */
    meta_quantidade: integer("meta_quantidade"),
    /** CURSO_CONCLUIDO. */
    meta_produto_id: uuid("meta_produto_id"),
    /** AVALIACAO_APROVADA. */
    meta_avaliacao_id: uuid("meta_avaliacao_id"),
    pontos_bonus: integer("pontos_bonus").notNull().default(0),
    /** Ex.: "Mentoria individual de 30 min" — a equipe marca a entrega na participação. */
    recompensa: text("recompensa"),
    situacao: text("situacao", { enum: SITUACOES_DESAFIO }).notNull().default("RASCUNHO"),
    publico: text("publico", { enum: PUBLICOS_DESAFIO }).notNull().default("TODOS"),
    criado_por: uuid("criado_por").notNull().references(() => usuarios.id, restrito),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_desafios_produto", columns: [t.meta_produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_criadores_desafios_avaliacao",
      columns: [t.meta_avaliacao_id, t.criador_id],
      foreignColumns: [produtos_avaliacoes.id, produtos_avaliacoes.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("uq_criadores_desafios_id_criador").on(t.id, t.criador_id),
    index("ix_criadores_desafios_janela").on(t.criador_id, t.fim_em).where(sql`is_deleted = false`),
    check("ck_criadores_desafios_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_DESAFIO)})`)),
    check("ck_criadores_desafios_publico", sql.raw(`publico in (${listaSql(PUBLICOS_DESAFIO)})`)),
    check("ck_criadores_desafios_meta_tipo", sql.raw(`meta_tipo in (${listaSql(METAS_DESAFIO)})`)),
    check(
      "ck_criadores_desafios_meta",
      sql`(meta_tipo in ('AULAS_CONCLUIDAS', 'PUBLICACOES_COMUNIDADE')) = (meta_quantidade is not null)
        and (meta_tipo = 'CURSO_CONCLUIDO') = (meta_produto_id is not null)
        and (meta_tipo = 'AVALIACAO_APROVADA') = (meta_avaliacao_id is not null)
        and (meta_quantidade is null or meta_quantidade between 1 and 1000)`,
    ),
    check("ck_criadores_desafios_janela", sql`fim_em > inicio_em`),
    check("ck_criadores_desafios_bonus", sql`pontos_bonus between 0 and 10000`),
    check("ck_criadores_desafios_titulo", sql`char_length(trim(titulo)) between 3 and 120`),
    check("ck_criadores_desafios_descricao", sql`char_length(descricao) <= 2000`),
    check("ck_criadores_desafios_recompensa", sql`recompensa is null or char_length(trim(recompensa)) between 3 and 200`),
  ],
);

/** Grupos do público GRUPOS do desafio (mesmo modelo de `criadores_eventos_grupos`). */
export const criadores_desafios_grupos = pgTable(
  "criadores_desafios_grupos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    desafio_id: uuid("desafio_id").notNull(),
    grupo_id: uuid("grupo_id").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_desafios_grupos_desafio", columns: [t.desafio_id, t.criador_id], foreignColumns: [criadores_desafios.id, criadores_desafios.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_desafios_grupos_grupo", columns: [t.grupo_id, t.criador_id], foreignColumns: [criadores_grupos.id, criadores_grupos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_desafios_grupos_vivo").on(t.desafio_id, t.grupo_id).where(sql`is_deleted = false`),
  ],
);

/**
 * Opt-in "Participar" (entrou em = `created_at`). `concluido_em` é gravado pelo sistema (campo de
 * sistema: não toca `updated_at`) junto com o lançamento DESAFIO_CONCLUIDO; a recompensa é marcada
 * pela equipe (com trava por `updated_at`).
 */
export const criadores_desafios_participacoes = pgTable(
  "criadores_desafios_participacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    desafio_id: uuid("desafio_id").notNull(),
    membro_id: uuid("membro_id").notNull(),
    concluido_em: instante("concluido_em"),
    recompensa_entregue_em: instante("recompensa_entregue_em"),
    recompensa_entregue_por: uuid("recompensa_entregue_por").references(() => usuarios.id, restrito),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_criadores_desafios_participacoes_desafio",
      columns: [t.desafio_id, t.criador_id],
      foreignColumns: [criadores_desafios.id, criadores_desafios.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_criadores_desafios_participacoes_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_desafios_participacoes_vivo").on(t.desafio_id, t.membro_id).where(sql`is_deleted = false`),
    index("ix_criadores_desafios_participacoes_membro").on(t.membro_id).where(sql`is_deleted = false`),
    check("ck_criadores_desafios_participacoes_entrega", sql`(recompensa_entregue_em is null) = (recompensa_entregue_por is null)`),
    check("ck_criadores_desafios_participacoes_entrega_concluido", sql`recompensa_entregue_em is null or concluido_em is not null`),
  ],
);

export type ConfigGamificacao = typeof criadores_gamificacao.$inferSelect;
export type LancamentoPontos = typeof criadores_membros_pontos.$inferSelect;
export type Desafio = typeof criadores_desafios.$inferSelect;
export type ParticipacaoDesafio = typeof criadores_desafios_participacoes.$inferSelect;
