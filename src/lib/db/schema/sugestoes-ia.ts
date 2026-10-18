import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { criadores } from "./criadores";
import { produtos_modulos_aulas, type Capitulo } from "./produtos";

/**
 * Sugestões da IA no estúdio (ADR-0018 item 8, RN-206): a partir da transcrição da legenda, o
 * Claude sugere descrição, capítulos e perguntas de avaliação. NADA é aplicado sozinho: a equipe
 * revisa e aplica cada parte (marca `*_aplicad*_em`). Descartar = soft delete (o custo aconteceu e
 * continua contando no limite do dia). Tokens e modelo por geração, como no assistente (custo
 * estimado por `custoUsd`).
 */

/** Pergunta de múltipla escolha sugerida (uma correta). */
export interface PerguntaSugerida {
  enunciado: string;
  opcoes: string[];
  /** Índice da opção correta em `opcoes`. */
  correta: number;
  explicacao: string;
}

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

export const produtos_modulos_aulas_sugestoes = pgTable(
  "produtos_modulos_aulas_sugestoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    aula_id: uuid("aula_id").notNull(),
    descricao: text("descricao").notNull(),
    capitulos: jsonb("capitulos").$type<Capitulo[]>().notNull(),
    perguntas: jsonb("perguntas").$type<PerguntaSugerida[]>().notNull(),
    modelo: text("modelo").notNull(),
    tokens_entrada: integer("tokens_entrada").notNull().default(0),
    tokens_saida: integer("tokens_saida").notNull().default(0),
    tokens_cache_leitura: integer("tokens_cache_leitura").notNull().default(0),
    tokens_cache_escrita: integer("tokens_cache_escrita").notNull().default(0),
    descricao_aplicada_em: instante("descricao_aplicada_em"),
    capitulos_aplicados_em: instante("capitulos_aplicados_em"),
    perguntas_aplicadas_em: instante("perguntas_aplicadas_em"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_produtos_modulos_aulas_sugestoes_aula", columns: [t.aula_id, t.criador_id], foreignColumns: [produtos_modulos_aulas.id, produtos_modulos_aulas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_produtos_modulos_aulas_sugestoes_aula").on(t.aula_id, t.created_at).where(sql`is_deleted = false`),
    // Limite diário por criador: conta TODAS (inclusive descartadas).
    index("ix_produtos_modulos_aulas_sugestoes_criador_dia").on(t.criador_id, t.created_at),
    check("ck_produtos_modulos_aulas_sugestoes_descricao", sql`length(descricao) <= 4000`),
    check("ck_produtos_modulos_aulas_sugestoes_json", sql`jsonb_typeof(capitulos) = 'array' and jsonb_typeof(perguntas) = 'array'`),
    check(
      "ck_produtos_modulos_aulas_sugestoes_tokens",
      sql`tokens_entrada >= 0 and tokens_saida >= 0 and tokens_cache_leitura >= 0 and tokens_cache_escrita >= 0`,
    ),
  ],
);

export type SugestaoAula = typeof produtos_modulos_aulas_sugestoes.$inferSelect;
