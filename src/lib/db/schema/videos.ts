import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { SITUACOES_PROCESSAMENTO, SITUACOES_VIDEO, listaSql } from "./_enums";
import { criadores } from "./criadores";
import { produtos_modulos_aulas } from "./produtos";
import { usuarios } from "./usuarios";

/**
 * Video da aula no pipeline self-host (docs/ARQUITETURA_VPS.md §6, ADR-0005). UM video vivo por
 * aula: trocar = novo registro, o antigo vira soft delete e os objetos saem do storage depois do
 * commit. `criador_id` + FKs compostas como o catalogo: video de A nunca aponta aula de B.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

export const produtos_modulos_aulas_videos = pgTable(
  "produtos_modulos_aulas_videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    aula_id: uuid("aula_id").notNull(),
    situacao: text("situacao", { enum: SITUACOES_VIDEO }).notNull().default("ENVIANDO"),
    nome_original: text("nome_original").notNull(),
    mime: text("mime").notNull(),
    tamanho_bytes: bigint("tamanho_bytes", { mode: "number" }).notNull(),
    /** Original no bucket de videos originais: criadores/<criador>/videos/<id>/original.<ext>. */
    chave_origem: text("chave_origem").notNull(),
    /** Multipart aberto (so em ENVIANDO). Nunca vem da tela: a action le daqui. */
    upload_id: text("upload_id"),
    /** Pasta do HLS no bucket hls: criadores/<criador>/videos/<id>. */
    prefixo_hls: text("prefixo_hls"),
    /** Chave AES-128 do HLS, CIFRADA com VIDEO_CHAVE_MESTRA (src/lib/video/chaves.ts). */
    chave_cifrada: text("chave_cifrada").notNull(),
    duracao_seg: integer("duracao_seg"),
    resolucoes: jsonb("resolucoes").$type<string[]>().notNull().default([]),
    /** Thumb gerada pelo worker (bucket hls). */
    thumb_chave: text("thumb_chave"),
    /** Erro LEGIVEL para a tela (detalhe tecnico fica no log do processamento). */
    erro: text("erro"),
    tentativas: integer("tentativas").notNull().default(0),
    processado_em: instante("processado_em"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_produtos_modulos_aulas_videos_aula",
      columns: [t.aula_id, t.criador_id],
      foreignColumns: [produtos_modulos_aulas.id, produtos_modulos_aulas.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_produtos_modulos_aulas_videos_aula_vivo").on(t.aula_id).where(sql`is_deleted = false`),
    unique("uq_produtos_modulos_aulas_videos_id_criador").on(t.id, t.criador_id),
    check("ck_produtos_modulos_aulas_videos_origem", sql`chave_origem like 'criadores/' || criador_id::text || '/videos/%'`),
    check("ck_produtos_modulos_aulas_videos_hls", sql`prefixo_hls is null or prefixo_hls like 'criadores/' || criador_id::text || '/videos/%'`),
    check("ck_produtos_modulos_aulas_videos_tamanho", sql`tamanho_bytes > 0`),
    check("ck_produtos_modulos_aulas_videos_duracao", sql`duracao_seg is null or duracao_seg >= 0`),
    check("ck_produtos_modulos_aulas_videos_resolucoes", sql`jsonb_typeof(resolucoes) = 'array'`),
    check("ck_produtos_modulos_aulas_videos_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_VIDEO)})`)),
  ],
);

/** Cada tentativa do worker: tempos, situacao e a cauda do log (para o admin e o suporte). */
export const produtos_modulos_aulas_videos_processamentos = pgTable(
  "produtos_modulos_aulas_videos_processamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull(),
    video_id: uuid("video_id").notNull(),
    tentativa: integer("tentativa").notNull(),
    situacao: text("situacao", { enum: SITUACOES_PROCESSAMENTO }).notNull().default("PROCESSANDO"),
    iniciado_em: instante("iniciado_em").notNull().defaultNow(),
    terminado_em: instante("terminado_em"),
    /** Tempo de CPU do FFmpeg (do `-benchmark`), para dimensionar o worker. */
    cpu_seg: integer("cpu_seg"),
    /** Cauda do stderr do FFmpeg / mensagem do erro (no maximo 4.000 caracteres). */
    log: text("log"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_produtos_modulos_aulas_videos_processamentos_video",
      columns: [t.video_id, t.criador_id],
      foreignColumns: [produtos_modulos_aulas_videos.id, produtos_modulos_aulas_videos.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_produtos_modulos_aulas_videos_processamentos_criador", columns: [t.criador_id], foreignColumns: [criadores.id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_produtos_modulos_aulas_videos_processamentos_video").on(t.video_id, t.tentativa),
    check("ck_produtos_modulos_aulas_videos_processamentos_tentativa", sql`tentativa >= 1`),
    check("ck_produtos_modulos_aulas_videos_processamentos_log", sql`log is null or length(log) <= 4000`),
    check("ck_produtos_modulos_aulas_videos_processamentos_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_PROCESSAMENTO)})`)),
  ],
);

/**
 * Sessao de REPRODUCAO (limite de telas simultaneas por pessoa, RN-115). Viva = nao encerrada e
 * com sinal recente (`ultimo_sinal_em`, renovado junto com o token). Estourou o limite: a mais
 * antiga e encerrada e perde chave e segmentos na proxima renovacao.
 */
export const produtos_modulos_aulas_videos_sessoes = pgTable(
  "produtos_modulos_aulas_videos_sessoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull(),
    video_id: uuid("video_id").notNull(),
    usuario_id: uuid("usuario_id").notNull(),
    /** Sessao de login (Better Auth) que abriu: mesma aba/navegador reaproveita a sessao. */
    sessao_login_id: text("sessao_login_id").notNull(),
    ip: text("ip"),
    user_agent: text("user_agent"),
    ultimo_sinal_em: instante("ultimo_sinal_em").notNull().defaultNow(),
    encerrada_em: instante("encerrada_em"),
    motivo_encerramento: text("motivo_encerramento"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_produtos_modulos_aulas_videos_sessoes_video",
      columns: [t.video_id, t.criador_id],
      foreignColumns: [produtos_modulos_aulas_videos.id, produtos_modulos_aulas_videos.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_produtos_modulos_aulas_videos_sessoes_criador", columns: [t.criador_id], foreignColumns: [criadores.id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_produtos_modulos_aulas_videos_sessoes_usuario", columns: [t.usuario_id], foreignColumns: [usuarios.id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_produtos_modulos_aulas_videos_sessoes_usuario").on(t.usuario_id, t.ultimo_sinal_em).where(sql`encerrada_em is null and is_deleted = false`),
  ],
);

export type VideoAula = typeof produtos_modulos_aulas_videos.$inferSelect;
export type SessaoReproducao = typeof produtos_modulos_aulas_videos_sessoes.$inferSelect;
