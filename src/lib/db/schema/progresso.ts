import { sql } from "drizzle-orm";
import { boolean, check, customType, date, foreignKey, index, integer, pgTable, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { CONCLUSOES_AULA, listaSql } from "./_enums";
import { criadores, criadores_membros } from "./criadores";
import { produtos_modulos_aulas } from "./produtos";

/**
 * Experiencia do aluno (passo 5, ADR-0006): progresso por aula, agregado diario do Top 10 e
 * anotacoes. `criador_id` + FKs COMPOSTAS (membro, criador) e (aula, criador): o banco recusa
 * progresso de um membro de A numa aula de B mesmo que o codigo erre.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

/** Duracao maxima com progresso (12 h = 43.200 bits = 5,4 KB por linha no pior caso). */
export const DURACAO_MAXIMA_PROGRESSO_SEG = 43_200;

/** `bit varying`: 1 bit por SEGUNDO do video (1 = aquele segundo foi assistido). Texto '0101...' no JS. */
const bits = customType<{ data: string; driverData: string }>({ dataType: () => "bit varying" });

/**
 * Progresso de um membro numa aula (SISTEMA.md §4 LessonProgress). Escrito SO pelo upsert de
 * src/lib/progresso/registrar.ts (uma instrucao SQL por batida do player).
 *
 * - `segundos_bitmap`: segundos assistidos UNICOS (OR bit a bit a cada batida). Comprimento =
 *   duracao da aula. `segundos_assistidos` = bit_count, `percentual` = piso(assistidos/duracao).
 * - `updated_at` e o "atualizado em" da SISTEMA (ultima batida aceita): ordena o "Continuar"
 *   e limita quanto a proxima batida pode declarar (2x o tempo real decorrido + folga).
 * - Conclusao nunca volta atras (`concluida_por` ASSISTIU ao cruzar 90%, ou MANUAL).
 * - `ultima_visualizacao_dia`/`visualizacao_nova`: a primeira batida com segundos assistidos no
 *   dia (Brasilia) liga `visualizacao_nova` e soma 1 em `..._visualizacoes` na MESMA instrucao.
 */
export const produtos_modulos_aulas_progressos = pgTable(
  "produtos_modulos_aulas_progressos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    membro_id: uuid("membro_id").notNull(),
    aula_id: uuid("aula_id").notNull(),
    segundos_bitmap: bits("segundos_bitmap").notNull(),
    segundos_assistidos: integer("segundos_assistidos").notNull().default(0),
    /** Maior fim de trecho REALMENTE assistido (salto na barra nao avanca). */
    max_posicao_seg: integer("max_posicao_seg").notNull().default(0),
    /** Onde parou da ultima vez (retomar), mesmo voltando no video. */
    ultima_posicao_seg: integer("ultima_posicao_seg").notNull().default(0),
    percentual: smallint("percentual").notNull().default(0),
    concluida: boolean("concluida").notNull().default(false),
    concluida_em: instante("concluida_em"),
    concluida_por: text("concluida_por", { enum: CONCLUSOES_AULA }),
    ultima_visualizacao_dia: date("ultima_visualizacao_dia", { mode: "string" }),
    visualizacao_nova: boolean("visualizacao_nova").notNull().default(false),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_produtos_modulos_aulas_progressos_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_produtos_modulos_aulas_progressos_aula",
      columns: [t.aula_id, t.criador_id],
      foreignColumns: [produtos_modulos_aulas.id, produtos_modulos_aulas.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    // Alvo do upsert: UM progresso vivo por (membro, aula).
    uniqueIndex("uq_produtos_modulos_aulas_progressos_vivo").on(t.membro_id, t.aula_id).where(sql`is_deleted = false`),
    // "Continuar assistindo": do membro, mais recentes primeiro.
    index("ix_produtos_modulos_aulas_progressos_recentes").on(t.membro_id, t.updated_at.desc()).where(sql`is_deleted = false`),
    // Painel (passo 6): "Aulas concluídas" no período e "Acontecendo agora", por criador.
    index("ix_produtos_modulos_aulas_progressos_concluidas").on(t.criador_id, t.concluida_em.desc()).where(sql`concluida and is_deleted = false`),
    check("ck_produtos_modulos_aulas_progressos_bitmap", sql.raw(`length(segundos_bitmap) <= ${DURACAO_MAXIMA_PROGRESSO_SEG}`)),
    check(
      "ck_produtos_modulos_aulas_progressos_numeros",
      sql`segundos_assistidos >= 0 and max_posicao_seg >= 0 and ultima_posicao_seg >= 0 and percentual between 0 and 100`,
    ),
    check(
      "ck_produtos_modulos_aulas_progressos_conclusao",
      sql`(concluida and concluida_em is not null and concluida_por is not null) or (not concluida and concluida_em is null and concluida_por is null)`,
    ),
    check("ck_produtos_modulos_aulas_progressos_concluida_por", sql.raw(`concluida_por is null or concluida_por in (${listaSql(CONCLUSOES_AULA)})`)),
  ],
);

/**
 * Agregado do Top 10 (SISTEMA.md §6): visualizacoes por (aula, dia de Brasilia). Visualizacao =
 * um membro com pelo menos 1 segundo assistido naquela aula naquele dia (conta 1 por membro/dia).
 * Incrementado na MESMA instrucao do upsert do progresso; o ranking de 7 dias e uma soma simples.
 */
export const produtos_modulos_aulas_visualizacoes = pgTable(
  "produtos_modulos_aulas_visualizacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    aula_id: uuid("aula_id").notNull(),
    dia: date("dia", { mode: "string" }).notNull(),
    visualizacoes: integer("visualizacoes").notNull().default(0),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_produtos_modulos_aulas_visualizacoes_aula",
      columns: [t.aula_id, t.criador_id],
      foreignColumns: [produtos_modulos_aulas.id, produtos_modulos_aulas.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_produtos_modulos_aulas_visualizacoes_dia_vivo").on(t.aula_id, t.dia).where(sql`is_deleted = false`),
    // Top 10: soma dos ultimos 7 dias do criador.
    index("ix_produtos_modulos_aulas_visualizacoes_criador_dia").on(t.criador_id, t.dia).where(sql`is_deleted = false`),
    check("ck_produtos_modulos_aulas_visualizacoes_numero", sql`visualizacoes >= 0`),
  ],
);

/**
 * Dias de atividade de aula de cada membro (painel, passo 6): uma linha por (membro, dia de
 * Brasília) em que ele assistiu ≥ 1 segundo de qualquer aula ou concluiu uma aula. Base de
 * "Alunos ativos" e de "Acessos por dia" (alunos DISTINTOS por dia — o agregado do Top 10 conta
 * pares aula×membro e o progresso só guarda a última batida). Escrita na MESMA instrução do
 * upsert do progresso (src/lib/progresso/registrar.ts), só na primeira batida do dia de cada aula.
 */
export const criadores_membros_atividades = pgTable(
  "criadores_membros_atividades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    membro_id: uuid("membro_id").notNull(),
    dia: date("dia", { mode: "string" }).notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_criadores_membros_atividades_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_membros_atividades_dia_vivo").on(t.membro_id, t.dia).where(sql`is_deleted = false`),
    index("ix_criadores_membros_atividades_criador_dia").on(t.criador_id, t.dia).where(sql`is_deleted = false`),
  ],
);

/** Anotacao do aluno num instante da aula (SISTEMA.md §4 Note). Editar/remover com trava. */
export const produtos_modulos_aulas_anotacoes = pgTable(
  "produtos_modulos_aulas_anotacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    membro_id: uuid("membro_id").notNull(),
    aula_id: uuid("aula_id").notNull(),
    tempo_seg: integer("tempo_seg").notNull(),
    texto: text("texto").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_produtos_modulos_aulas_anotacoes_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_produtos_modulos_aulas_anotacoes_aula",
      columns: [t.aula_id, t.criador_id],
      foreignColumns: [produtos_modulos_aulas.id, produtos_modulos_aulas.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_produtos_modulos_aulas_anotacoes_membro_aula").on(t.membro_id, t.aula_id, t.tempo_seg).where(sql`is_deleted = false`),
    check("ck_produtos_modulos_aulas_anotacoes_tempo", sql`tempo_seg >= 0`),
    check("ck_produtos_modulos_aulas_anotacoes_texto", sql`length(trim(texto)) between 1 and 2000`),
  ],
);

export type ProgressoAula = typeof produtos_modulos_aulas_progressos.$inferSelect;
export type AnotacaoAula = typeof produtos_modulos_aulas_anotacoes.$inferSelect;
