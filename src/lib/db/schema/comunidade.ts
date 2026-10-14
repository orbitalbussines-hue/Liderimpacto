import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { ACESSOS_CANAL, QUEM_POSTA_CANAL, listaSql } from "./_enums";
import { arquivos } from "./arquivos";
import { criadores, criadores_membros } from "./criadores";
import { criadores_grupos } from "./criadores-grupos";
import { produtos, produtos_modulos_aulas } from "./produtos";

/**
 * Comunidade (passo 8, SISTEMA.md §4 Channel/Post/Comment/Like; RN-130 a RN-133; ADR-0009).
 * `criador_id` em TODAS as tabelas + FKs COMPOSTAS (filho, criador) -> (pai, criador): o banco
 * recusa post, comentário, curtida ou anexo que misture criadores mesmo que o serviço erre.
 *
 * - Texto é PURO (nada de HTML): o React escapa; links saem de `segmentosDeTexto`.
 * - Contadores (`curtidas`, `comentarios`) são campos de SISTEMA: mudam na mesma transação da
 *   curtida/comentário, SEM tocar `updated_at` (não invalidam a edição aberta na tela).
 * - Curtida: UMA linha por (membro, alvo) para sempre — descurtir = soft delete, curtir de novo
 *   reativa a mesma linha (o índice único vale para todas as linhas).
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

export const criadores_canais = pgTable(
  "criadores_canais",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    nome: text("nome").notNull(),
    descricao: text("descricao").notNull().default(""),
    ordem: integer("ordem").notNull().default(1),
    acesso: text("acesso", { enum: ACESSOS_CANAL }).notNull().default("TODOS"),
    grupo_id: uuid("grupo_id"),
    produto_id: uuid("produto_id"),
    quem_posta: text("quem_posta", { enum: QUEM_POSTA_CANAL }).notNull().default("TODOS"),
    /** O "Geral" criado por padrão (um por criador; não se remove e é sempre de todos). */
    padrao: boolean("padrao").notNull().default(false),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_canais_grupo", columns: [t.grupo_id, t.criador_id], foreignColumns: [criadores_grupos.id, criadores_grupos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_canais_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("uq_criadores_canais_id_criador").on(t.id, t.criador_id),
    uniqueIndex("uq_criadores_canais_padrao_vivo").on(t.criador_id).where(sql`is_deleted = false and padrao`),
    uniqueIndex("uq_criadores_canais_nome_vivo").on(t.criador_id, sql`lower(${t.nome})`).where(sql`is_deleted = false`),
    check("ck_criadores_canais_acesso", sql.raw(`acesso in (${listaSql(ACESSOS_CANAL)})`)),
    check("ck_criadores_canais_quem_posta", sql.raw(`quem_posta in (${listaSql(QUEM_POSTA_CANAL)})`)),
    check("ck_criadores_canais_alvo", sql`(acesso = 'GRUPO') = (grupo_id is not null) and (acesso = 'PRODUTO') = (produto_id is not null)`),
    check("ck_criadores_canais_padrao", sql`not padrao or acesso = 'TODOS'`),
    check("ck_criadores_canais_nome", sql`char_length(trim(nome)) between 2 and 60`),
    check("ck_criadores_canais_descricao", sql`char_length(descricao) <= 280`),
    check("ck_criadores_canais_ordem", sql`ordem >= 1`),
  ],
);

export const criadores_canais_posts = pgTable(
  "criadores_canais_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    canal_id: uuid("canal_id").notNull(),
    autor_membro_id: uuid("autor_membro_id").notNull(),
    /** "há 15 dias · em <aula>": aula relacionada, opcional. */
    aula_id: uuid("aula_id"),
    texto: text("texto").notNull(),
    /** Enquete opcional: pergunta + 2 a 6 opções (texto), voto único e trocável até encerrar. */
    enquete_pergunta: text("enquete_pergunta"),
    enquete_opcoes: jsonb("enquete_opcoes").$type<string[]>(),
    enquete_encerra_em: instante("enquete_encerra_em"),
    fixado_em: instante("fixado_em"),
    oculto_em: instante("oculto_em"),
    motivo_ocultacao: text("motivo_ocultacao"),
    editado_em: instante("editado_em"),
    curtidas: integer("curtidas").notNull().default(0),
    comentarios: integer("comentarios").notNull().default(0),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_canais_posts_canal", columns: [t.canal_id, t.criador_id], foreignColumns: [criadores_canais.id, criadores_canais.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_criadores_canais_posts_autor",
      columns: [t.autor_membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_criadores_canais_posts_aula",
      columns: [t.aula_id, t.criador_id],
      foreignColumns: [produtos_modulos_aulas.id, produtos_modulos_aulas.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("uq_criadores_canais_posts_id_criador").on(t.id, t.criador_id),
    // Feed "Recentes" e "Mais curtidos" por canal, e "todos os canais" por criador (cursor por tupla).
    index("ix_criadores_canais_posts_canal_recentes").on(t.canal_id, t.created_at.desc(), t.id.desc()).where(sql`is_deleted = false`),
    index("ix_criadores_canais_posts_canal_curtidos").on(t.canal_id, t.curtidas.desc(), t.created_at.desc(), t.id.desc()).where(sql`is_deleted = false`),
    index("ix_criadores_canais_posts_criador_recentes").on(t.criador_id, t.created_at.desc(), t.id.desc()).where(sql`is_deleted = false`),
    // Limite de frequência e membros ativos: conta TODAS as linhas (apagar não devolve a cota).
    index("ix_criadores_canais_posts_autor").on(t.autor_membro_id, t.created_at),
    index("ix_criadores_canais_posts_fixados").on(t.criador_id, t.fixado_em.desc()).where(sql`is_deleted = false and fixado_em is not null`),
    check("ck_criadores_canais_posts_texto", sql`char_length(texto) between 1 and 5000`),
    check(
      "ck_criadores_canais_posts_enquete",
      sql`(enquete_pergunta is null and enquete_opcoes is null and enquete_encerra_em is null)
        or (enquete_pergunta is not null and jsonb_typeof(enquete_opcoes) = 'array' and jsonb_array_length(enquete_opcoes) between 2 and 6)`,
    ),
    check("ck_criadores_canais_posts_ocultacao", sql`oculto_em is null or char_length(trim(motivo_ocultacao)) >= 3`),
    check("ck_criadores_canais_posts_contadores", sql`curtidas >= 0 and comentarios >= 0`),
  ],
);

export const criadores_canais_posts_anexos = pgTable(
  "criadores_canais_posts_anexos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    post_id: uuid("post_id").notNull(),
    arquivo_id: uuid("arquivo_id").notNull(),
    ordem: integer("ordem").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_criadores_canais_posts_anexos_post",
      columns: [t.post_id, t.criador_id],
      foreignColumns: [criadores_canais_posts.id, criadores_canais_posts.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_canais_posts_anexos_arquivo", columns: [t.arquivo_id, t.criador_id], foreignColumns: [arquivos.id, arquivos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    // Um arquivo, um uso.
    uniqueIndex("uq_criadores_canais_posts_anexos_arquivo_vivo").on(t.arquivo_id).where(sql`is_deleted = false`),
    index("ix_criadores_canais_posts_anexos_post").on(t.post_id).where(sql`is_deleted = false`),
    check("ck_criadores_canais_posts_anexos_ordem", sql`ordem between 1 and 6`),
  ],
);

export const criadores_canais_posts_votos = pgTable(
  "criadores_canais_posts_votos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    post_id: uuid("post_id").notNull(),
    membro_id: uuid("membro_id").notNull(),
    /** Índice da opção em `enquete_opcoes` (0..5; o serviço confere contra a enquete). */
    opcao: integer("opcao").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_criadores_canais_posts_votos_post",
      columns: [t.post_id, t.criador_id],
      foreignColumns: [criadores_canais_posts.id, criadores_canais_posts.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_criadores_canais_posts_votos_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    // Voto único: trocar = UPDATE da mesma linha.
    uniqueIndex("uq_criadores_canais_posts_votos_vivo").on(t.post_id, t.membro_id).where(sql`is_deleted = false`),
    check("ck_criadores_canais_posts_votos_opcao", sql`opcao between 0 and 5`),
  ],
);

/** Comentário em POST ou em AULA (aba "Comentários" do player). Uma resposta de nível só (`pai_id`). */
export const criadores_comentarios = pgTable(
  "criadores_comentarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    post_id: uuid("post_id"),
    aula_id: uuid("aula_id"),
    /** Comentário principal respondido (o serviço garante: mesmo alvo e o pai não é resposta). */
    pai_id: uuid("pai_id"),
    autor_membro_id: uuid("autor_membro_id").notNull(),
    texto: text("texto").notNull(),
    oculto_em: instante("oculto_em"),
    motivo_ocultacao: text("motivo_ocultacao"),
    editado_em: instante("editado_em"),
    curtidas: integer("curtidas").notNull().default(0),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_criadores_comentarios_post",
      columns: [t.post_id, t.criador_id],
      foreignColumns: [criadores_canais_posts.id, criadores_canais_posts.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_criadores_comentarios_aula",
      columns: [t.aula_id, t.criador_id],
      foreignColumns: [produtos_modulos_aulas.id, produtos_modulos_aulas.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_comentarios_pai", columns: [t.pai_id, t.criador_id], foreignColumns: [t.id, t.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_criadores_comentarios_autor",
      columns: [t.autor_membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("uq_criadores_comentarios_id_criador").on(t.id, t.criador_id),
    index("ix_criadores_comentarios_post").on(t.post_id, t.created_at).where(sql`is_deleted = false and post_id is not null`),
    index("ix_criadores_comentarios_aula").on(t.aula_id, t.created_at).where(sql`is_deleted = false and aula_id is not null`),
    index("ix_criadores_comentarios_autor").on(t.autor_membro_id, t.created_at),
    check("ck_criadores_comentarios_alvo", sql`num_nonnulls(post_id, aula_id) = 1`),
    check("ck_criadores_comentarios_pai", sql`pai_id is null or pai_id <> id`),
    check("ck_criadores_comentarios_texto", sql`char_length(texto) between 1 and 2000`),
    check("ck_criadores_comentarios_ocultacao", sql`oculto_em is null or char_length(trim(motivo_ocultacao)) >= 3`),
    check("ck_criadores_comentarios_curtidas", sql`curtidas >= 0`),
  ],
);

export const criadores_curtidas = pgTable(
  "criadores_curtidas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    membro_id: uuid("membro_id").notNull(),
    post_id: uuid("post_id"),
    comentario_id: uuid("comentario_id"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_criadores_curtidas_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_curtidas_post", columns: [t.post_id, t.criador_id], foreignColumns: [criadores_canais_posts.id, criadores_canais_posts.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_criadores_curtidas_comentario",
      columns: [t.comentario_id, t.criador_id],
      foreignColumns: [criadores_comentarios.id, criadores_comentarios.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    // TODAS as linhas: o toggle reativa a mesma (uma linha por membro e alvo).
    uniqueIndex("uq_criadores_curtidas_post").on(t.membro_id, t.post_id).where(sql`post_id is not null`),
    uniqueIndex("uq_criadores_curtidas_comentario").on(t.membro_id, t.comentario_id).where(sql`comentario_id is not null`),
    check("ck_criadores_curtidas_alvo", sql`num_nonnulls(post_id, comentario_id) = 1`),
  ],
);

export type Canal = typeof criadores_canais.$inferSelect;
export type Post = typeof criadores_canais_posts.$inferSelect;
export type Comentario = typeof criadores_comentarios.$inferSelect;
