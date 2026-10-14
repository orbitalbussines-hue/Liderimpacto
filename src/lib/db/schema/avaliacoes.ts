import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, numeric, pgTable, smallint, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { FINALIZACOES_TENTATIVA, STATUS_AVALIACAO, TIPOS_AVALIACAO, TIPOS_QUESTAO, listaSql } from "./_enums";
import { criadores, criadores_membros } from "./criadores";
import { produtos, produtos_modulos } from "./produtos";

/**
 * Avaliações (passo 7, SISTEMA.md §4 Assessment/Question/Attempt; RN-123 a RN-125; ADR-0008).
 * `criador_id` + FKs COMPOSTAS com o criador em todas: avaliação de A nunca aponta produto de B.
 *
 * - Questão guarda as opções (`opcoes`, jsonb `{ id, texto }[]`) SEPARADAS do gabarito
 *   (`gabarito`, jsonb com os ids das corretas): a consulta do aluno simplesmente não seleciona
 *   a coluna `gabarito` antes da correção.
 * - Tentativa guarda as respostas (jsonb `{ [questaoId]: idsDasOpcoes[] }`, autosave por questão
 *   com `||` atômico), a ordem sorteada (`ordem`) e a correção congelada (`correcao`).
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

/** Opção de questão como o aluno vê (sem dizer se é correta). Ids por posição: "a".."h". */
export interface OpcaoQuestao {
  id: string;
  texto: string;
}

/** Ordem sorteada no início da tentativa: questões e opções (id da questão + ids das opções). */
export interface OrdemTentativa {
  q: string;
  o: string[];
}

/** Correção congelada de cada questão (a questão pode ser editada depois). */
export interface CorrecaoQuestao {
  q: string;
  correta: boolean;
  peso: number;
}

export const produtos_avaliacoes = pgTable(
  "produtos_avaliacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    produto_id: uuid("produto_id").notNull(),
    /** Nulo = avaliação do produto (final); preenchido = do módulo (do MESMO produto: FK composta). */
    modulo_id: uuid("modulo_id"),
    tipo: text("tipo", { enum: TIPOS_AVALIACAO }).notNull().default("QUIZ"),
    titulo: text("titulo").notNull(),
    instrucoes: text("instrucoes").notNull().default(""),
    /** 0 a 100 (%). Padrão 70 (RN-123, padrão aguardando o cliente). */
    nota_minima: smallint("nota_minima").notNull().default(70),
    /** 0 = ilimitado. Padrão 3. */
    tentativas_max: smallint("tentativas_max").notNull().default(3),
    /** Nulo = sem limite de tempo. */
    tempo_limite_min: smallint("tempo_limite_min"),
    obrigatoria_para_certificado: boolean("obrigatoria_para_certificado").notNull().default(false),
    /** Só em avaliação de módulo: o ALUNO só abre os módulos seguintes depois de aprovado. */
    libera_proximo_modulo: boolean("libera_proximo_modulo").notNull().default(false),
    /** Sorteia a ordem das questões e das opções a cada tentativa. */
    embaralhar: boolean("embaralhar").notNull().default(false),
    /** Só abre depois de concluir todas as aulas do escopo (módulo ou produto). */
    exige_aulas_concluidas: boolean("exige_aulas_concluidas").notNull().default(true),
    status: text("status", { enum: STATUS_AVALIACAO }).notNull().default("RASCUNHO"),
    publicada_em: instante("publicada_em"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_produtos_avaliacoes_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_produtos_avaliacoes_modulo",
      columns: [t.modulo_id, t.produto_id, t.criador_id],
      foreignColumns: [produtos_modulos.id, produtos_modulos.produto_id, produtos_modulos.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("uq_produtos_avaliacoes_id_criador").on(t.id, t.criador_id),
    index("ix_produtos_avaliacoes_produto").on(t.criador_id, t.produto_id).where(sql`is_deleted = false`),
    check("ck_produtos_avaliacoes_nota_minima", sql`nota_minima between 0 and 100`),
    check("ck_produtos_avaliacoes_tentativas", sql`tentativas_max between 0 and 50`),
    check("ck_produtos_avaliacoes_tempo", sql`tempo_limite_min is null or tempo_limite_min between 1 and 600`),
    check("ck_produtos_avaliacoes_libera", sql`not libera_proximo_modulo or modulo_id is not null`),
    check("ck_produtos_avaliacoes_tipo", sql.raw(`tipo in (${listaSql(TIPOS_AVALIACAO)})`)),
    check("ck_produtos_avaliacoes_status", sql.raw(`status in (${listaSql(STATUS_AVALIACAO)})`)),
  ],
);

export const produtos_avaliacoes_questoes = pgTable(
  "produtos_avaliacoes_questoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    avaliacao_id: uuid("avaliacao_id").notNull(),
    ordem: integer("ordem").notNull(),
    tipo: text("tipo", { enum: TIPOS_QUESTAO }).notNull(),
    enunciado: text("enunciado").notNull(),
    opcoes: jsonb("opcoes").$type<OpcaoQuestao[]>().notNull(),
    /** Ids das opções corretas. NUNCA vai ao aluno antes da correção (RN-124). */
    gabarito: jsonb("gabarito").$type<string[]>().notNull(),
    peso: smallint("peso").notNull().default(1),
    /** Mostrada no resultado, junto com o gabarito (RN-124). */
    explicacao: text("explicacao"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_produtos_avaliacoes_questoes_avaliacao",
      columns: [t.avaliacao_id, t.criador_id],
      foreignColumns: [produtos_avaliacoes.id, produtos_avaliacoes.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_produtos_avaliacoes_questoes_ordem_vivo").on(t.avaliacao_id, t.ordem).where(sql`is_deleted = false`),
    check("ck_produtos_avaliacoes_questoes_ordem", sql`ordem >= 1`),
    check("ck_produtos_avaliacoes_questoes_peso", sql`peso between 1 and 100`),
    check("ck_produtos_avaliacoes_questoes_opcoes", sql`jsonb_typeof(opcoes) = 'array' and jsonb_array_length(opcoes) between 2 and 8`),
    check("ck_produtos_avaliacoes_questoes_gabarito", sql`jsonb_typeof(gabarito) = 'array' and jsonb_array_length(gabarito) >= 1`),
    check("ck_produtos_avaliacoes_questoes_tipo", sql.raw(`tipo in (${listaSql(TIPOS_QUESTAO)})`)),
  ],
);

export const produtos_avaliacoes_tentativas = pgTable(
  "produtos_avaliacoes_tentativas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    avaliacao_id: uuid("avaliacao_id").notNull(),
    membro_id: uuid("membro_id").notNull(),
    /** 1, 2, 3... por (membro, avaliação). */
    numero: smallint("numero").notNull(),
    iniciada_em: instante("iniciada_em").notNull().defaultNow(),
    /** iniciada_em + tempo limite; nulo = sem limite. Conferido no SERVIDOR. */
    prazo_em: instante("prazo_em"),
    finalizada_em: instante("finalizada_em"),
    finalizada_por: text("finalizada_por", { enum: FINALIZACOES_TENTATIVA }),
    ordem: jsonb("ordem").$type<OrdemTentativa[]>().notNull(),
    respostas: jsonb("respostas").$type<Record<string, string[]>>().notNull().default({}),
    /** 0 a 100 com 1 casa. Nula enquanto aberta. */
    nota: numeric("nota", { precision: 4, scale: 1, mode: "number" }),
    aprovada: boolean("aprovada"),
    correcao: jsonb("correcao").$type<CorrecaoQuestao[]>(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_produtos_avaliacoes_tentativas_avaliacao",
      columns: [t.avaliacao_id, t.criador_id],
      foreignColumns: [produtos_avaliacoes.id, produtos_avaliacoes.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_produtos_avaliacoes_tentativas_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    // UMA tentativa aberta por vez (membro, avaliação): a segunda abertura simultânea é recusada pelo banco.
    uniqueIndex("uq_produtos_avaliacoes_tentativas_aberta").on(t.membro_id, t.avaliacao_id).where(sql`finalizada_em is null and is_deleted = false`),
    uniqueIndex("uq_produtos_avaliacoes_tentativas_numero").on(t.membro_id, t.avaliacao_id, t.numero).where(sql`is_deleted = false`),
    index("ix_produtos_avaliacoes_tentativas_avaliacao").on(t.criador_id, t.avaliacao_id).where(sql`is_deleted = false`),
    // Analytics e painel: tentativas FINALIZADAS do criador no período (e o recálculo de pontos).
    index("ix_produtos_avaliacoes_tentativas_finalizadas").on(t.criador_id, t.finalizada_em).where(sql`finalizada_em is not null and is_deleted = false`),
    check("ck_produtos_avaliacoes_tentativas_numero", sql`numero >= 1`),
    check("ck_produtos_avaliacoes_tentativas_nota", sql`nota is null or nota between 0 and 100`),
    check(
      "ck_produtos_avaliacoes_tentativas_fim",
      sql`(finalizada_em is null and finalizada_por is null and nota is null and aprovada is null and correcao is null)
        or (finalizada_em is not null and finalizada_por is not null and nota is not null and aprovada is not null and correcao is not null)`,
    ),
    check("ck_produtos_avaliacoes_tentativas_finalizada_por", sql.raw(`finalizada_por is null or finalizada_por in (${listaSql(FINALIZACOES_TENTATIVA)})`)),
    check("ck_produtos_avaliacoes_tentativas_respostas", sql`jsonb_typeof(respostas) = 'object'`),
  ],
);

/** Tentativas EXTRAS concedidas pela equipe a um membro (esgotou sem aprovar). Soma dos vivos. */
export const produtos_avaliacoes_concessoes = pgTable(
  "produtos_avaliacoes_concessoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    avaliacao_id: uuid("avaliacao_id").notNull(),
    membro_id: uuid("membro_id").notNull(),
    quantidade: smallint("quantidade").notNull().default(1),
    motivo: text("motivo").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_produtos_avaliacoes_concessoes_avaliacao",
      columns: [t.avaliacao_id, t.criador_id],
      foreignColumns: [produtos_avaliacoes.id, produtos_avaliacoes.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_produtos_avaliacoes_concessoes_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_produtos_avaliacoes_concessoes_membro").on(t.membro_id, t.avaliacao_id).where(sql`is_deleted = false`),
    check("ck_produtos_avaliacoes_concessoes_quantidade", sql`quantidade between 1 and 10`),
    check("ck_produtos_avaliacoes_concessoes_motivo", sql`length(trim(motivo)) between 3 and 500`),
  ],
);

export type Avaliacao = typeof produtos_avaliacoes.$inferSelect;
export type QuestaoAvaliacao = typeof produtos_avaliacoes_questoes.$inferSelect;
export type TentativaAvaliacao = typeof produtos_avaliacoes_tentativas.$inferSelect;
