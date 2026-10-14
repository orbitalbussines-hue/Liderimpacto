import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria } from "./_compartilhado";
import { PAPEIS_MENSAGEM_ASSISTENTE, listaSql } from "./_enums";
import { criadores, criadores_membros } from "./criadores";
import { produtos, produtos_modulos_aulas } from "./produtos";

/**
 * Assistente do professor (ADR-0014, RN-193 a RN-197): configuração por criador, cursos em que
 * aparece, conversas e mensagens. FKs COMPOSTAS com `criador_id` em tudo. O limite diário é CONTADO
 * nas mensagens (inclusive as de conversas apagadas: apagar não devolve a cota) e o consumo
 * (tokens, custo) sai das mensagens do ASSISTENTE: não há contador que possa divergir.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

/** 1:1 com o criador (sem linha = desligado, com os padrões). */
export const criadores_assistentes = pgTable(
  "criadores_assistentes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    ligado: boolean("ligado").notNull().default(false),
    nome: text("nome").notNull().default("Assistente do professor"),
    /** Tom de voz: entra no prompt de sistema DEPOIS das regras fixas (não as substitui). */
    instrucoes: text("instrucoes").notNull().default(""),
    /** Perguntas por aluno por dia (Brasília). A equipe não tem limite próprio (só o teto do criador). */
    limite_diario: integer("limite_diario").notNull().default(20),
    /** false = só nos cursos de `criadores_assistentes_produtos`. */
    todos_os_cursos: boolean("todos_os_cursos").notNull().default(true),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_criadores_assistentes_vivo").on(t.criador_id).where(sql`is_deleted = false`),
    check("ck_criadores_assistentes_nome", sql`length(nome) between 2 and 60`),
    check("ck_criadores_assistentes_instrucoes", sql`length(instrucoes) <= 800`),
    check("ck_criadores_assistentes_limite", sql`limite_diario between 1 and 200`),
  ],
);

export const criadores_assistentes_produtos = pgTable(
  "criadores_assistentes_produtos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    produto_id: uuid("produto_id").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_assistentes_produtos_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_assistentes_produtos_vivo").on(t.criador_id, t.produto_id).where(sql`is_deleted = false`),
  ],
);

export const criadores_assistentes_conversas = pgTable(
  "criadores_assistentes_conversas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    membro_id: uuid("membro_id").notNull(),
    /** Aula em que a conversa começou (painel "Pergunte ao professor"); nula = `/assistente`. */
    aula_id: uuid("aula_id"),
    /** A primeira pergunta, encurtada (lista do histórico). */
    titulo: text("titulo").notNull(),
    /** Playground da equipe ("Testar"): fora das perguntas recentes, dentro do consumo. */
    teste: boolean("teste").notNull().default(false),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_assistentes_conversas_membro", columns: [t.membro_id, t.criador_id], foreignColumns: [criadores_membros.id, criadores_membros.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_assistentes_conversas_aula", columns: [t.aula_id, t.criador_id], foreignColumns: [produtos_modulos_aulas.id, produtos_modulos_aulas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("uq_criadores_assistentes_conversas_id_criador").on(t.id, t.criador_id),
    index("ix_criadores_assistentes_conversas_membro").on(t.criador_id, t.membro_id, t.updated_at).where(sql`is_deleted = false`),
    check("ck_criadores_assistentes_conversas_titulo", sql`length(titulo) between 1 and 120`),
  ],
);

/** Fonte citada numa resposta (o `n` é o número `[n]` que o modelo usou no texto). */
export interface FonteMensagem {
  n: number;
  titulo: string;
  /** "Aula 3 · Cultura organizacional" / "Curso" / "Texto da equipe". */
  origem: string;
  aulaId: string | null;
  inicioSeg: number | null;
}

export const criadores_assistentes_conversas_mensagens = pgTable(
  "criadores_assistentes_conversas_mensagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    conversa_id: uuid("conversa_id").notNull(),
    /** Repetido da conversa: o limite diário conta por membro sem juntar tabelas. */
    membro_id: uuid("membro_id").notNull(),
    papel: text("papel", { enum: PAPEIS_MENSAGEM_ASSISTENTE }).notNull(),
    texto: text("texto").notNull(),
    /** Só nas do ASSISTENTE: as fontes CITADAS (as que o aluno vê com link). */
    fontes: jsonb("fontes").$type<FonteMensagem[]>().notNull().default([]),
    tokens_entrada: integer("tokens_entrada").notNull().default(0),
    tokens_saida: integer("tokens_saida").notNull().default(0),
    tokens_cache_leitura: integer("tokens_cache_leitura").notNull().default(0),
    tokens_cache_escrita: integer("tokens_cache_escrita").notNull().default(0),
    /** Modelo que respondeu (nulo = resposta fixa, sem chamar a API). */
    modelo: text("modelo"),
    /** A base não tinha a resposta (nenhum trecho, ou o modelo não citou nenhum). */
    sem_resposta: boolean("sem_resposta").notNull().default(false),
    /** O aluno saiu/cancelou no meio: gravado o que chegou, com os tokens conhecidos. */
    interrompida: boolean("interrompida").notNull().default(false),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_criadores_assistentes_conversas_mensagens_conversa",
      columns: [t.conversa_id, t.criador_id],
      foreignColumns: [criadores_assistentes_conversas.id, criadores_assistentes_conversas.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_assistentes_conversas_mensagens_membro", columns: [t.membro_id, t.criador_id], foreignColumns: [criadores_membros.id, criadores_membros.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_criadores_assistentes_conversas_mensagens_conversa").on(t.conversa_id, t.created_at),
    // Limite por aluno/dia e teto do criador/dia (contam também as apagadas).
    index("ix_criadores_assistentes_conversas_mensagens_membro_dia").on(t.membro_id, t.created_at).where(sql`papel = 'USUARIO'`),
    index("ix_criadores_assistentes_conversas_mensagens_criador_dia").on(t.criador_id, t.created_at),
    check("ck_criadores_assistentes_conversas_mensagens_papel", sql.raw(`papel in (${listaSql(PAPEIS_MENSAGEM_ASSISTENTE)})`)),
    check("ck_criadores_assistentes_conversas_mensagens_texto", sql`length(texto) <= 20000`),
    check(
      "ck_criadores_assistentes_conversas_mensagens_tokens",
      sql`tokens_entrada >= 0 and tokens_saida >= 0 and tokens_cache_leitura >= 0 and tokens_cache_escrita >= 0`,
    ),
  ],
);
