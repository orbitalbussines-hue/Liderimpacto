import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import {
  GATILHO_LEAD,
  GATILHOS_AUTOMACAO,
  GATILHOS_COM_CURSO,
  GATILHOS_COM_DIAS,
  ORIGENS_DESCADASTRO,
  ORIGENS_ENVIO,
  SITUACOES_AUTOMACAO,
  SITUACOES_CAMPANHA,
  SITUACOES_ENVIO,
  SITUACOES_EXECUCAO,
  listaSql,
} from "./_enums";
import { criadores, criadores_membros } from "./criadores";
import { criadores_funis, criadores_leads, criadores_paginas } from "./paginas";
import { produtos } from "./produtos";
import { criadores_tags } from "./tags";

/**
 * Fase 3 — e-mail de marketing (ADR-0020, RN-220 a RN-227): modelos, campanhas, automações, a fila
 * de envios (um destinatário por linha, idempotente pela `chave`) e a lista de descadastros por
 * criador (HMAC do endereço, nunca o e-mail em claro). Conteúdo é TEXTO (parágrafos e links https):
 * nada de HTML do criador; o HTML sai sempre do `montarEmail` com tudo escapado.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

/** O que o criador escreve (validado por `conteudoSchema`; o banco só confere que é objeto). */
export interface ConteudoMarketing {
  assunto: string;
  previa: string;
  titulo: string;
  /** Texto puro: cada linha é um parágrafo; URLs https viram link (rastreado). */
  corpo: string;
  botao: { texto: string; url: string } | null;
}

/** Segmento de LEADS (ADR-0023): E entre os critérios, OU dentro de cada lista. Tudo vazio = todos os leads. */
export interface PublicoLeads {
  /** Página da PRIMEIRA captura. */
  paginaIds: string[];
  funilIds: string[];
  tagIds: string[];
}

/**
 * Público da campanha: E entre os critérios, OU dentro de cada lista. Vazio = todos os alunos.
 * `membros` e `leads` (ADR-0023) somam dois segmentos SEM duplicar pessoa (dedupe pelo HMAC do e-mail).
 * Campanha antiga (sem os campos) = só membros.
 */
export interface PublicoCampanha {
  grupoIds: string[];
  tagIds: string[];
  /** Matrícula VALENDO em ao menos um destes cursos. */
  produtoIds: string[];
  nuncaAcessou: boolean;
  /** `false` = os filtros de membro não valem e só os leads recebem. Ausente = `true`. */
  membros?: boolean;
  /** Ausente/nulo = sem leads. */
  leads?: PublicoLeads | null;
}

export const criadores_emails_modelos = pgTable(
  "criadores_emails_modelos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    nome: text("nome").notNull(),
    conteudo: jsonb("conteudo").$type<ConteudoMarketing>().notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_criadores_emails_modelos_nome_vivo").on(t.criador_id, sql`lower(${t.nome})`).where(sql`is_deleted = false`),
    check("ck_criadores_emails_modelos_nome", sql`length(trim(nome)) between 2 and 80`),
    check("ck_criadores_emails_modelos_conteudo", sql`jsonb_typeof(conteudo) = 'object'`),
  ],
);

export const criadores_campanhas = pgTable(
  "criadores_campanhas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    nome: text("nome").notNull(),
    conteudo: jsonb("conteudo").$type<ConteudoMarketing>().notNull(),
    publico: jsonb("publico").$type<PublicoCampanha>().notNull(),
    situacao: text("situacao", { enum: SITUACOES_CAMPANHA }).notNull().default("RASCUNHO"),
    agendada_para: instante("agendada_para"),
    iniciada_em: instante("iniciada_em"),
    concluida_em: instante("concluida_em"),
    cancelada_em: instante("cancelada_em"),
    /** Congelado no início do envio (público lido NAQUELE momento). */
    total_destinatarios: integer("total_destinatarios").notNull().default(0),
    ...colunasAuditoria,
  },
  (t) => [
    unique("uq_criadores_campanhas_id_criador").on(t.id, t.criador_id),
    index("ix_criadores_campanhas_criador").on(t.criador_id, t.created_at).where(sql`is_deleted = false`),
    // Reenfileirar ao subir o worker (fila fora do ar no agendamento).
    index("ix_criadores_campanhas_agendadas").on(t.agendada_para).where(sql`situacao = 'AGENDADA' and is_deleted = false`),
    check("ck_criadores_campanhas_nome", sql`length(trim(nome)) between 2 and 80`),
    check("ck_criadores_campanhas_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_CAMPANHA)})`)),
    check("ck_criadores_campanhas_agendada", sql`situacao <> 'AGENDADA' or agendada_para is not null`),
    check("ck_criadores_campanhas_json", sql`jsonb_typeof(conteudo) = 'object' and jsonb_typeof(publico) = 'object'`),
    check("ck_criadores_campanhas_total", sql`total_destinatarios >= 0`),
  ],
);

export const criadores_automacoes = pgTable(
  "criadores_automacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    nome: text("nome").notNull(),
    gatilho: text("gatilho", { enum: GATILHOS_AUTOMACAO }).notNull(),
    /** "Só deste curso" (gatilhos de `GATILHOS_COM_CURSO`); nulo = qualquer curso. */
    produto_id: uuid("produto_id"),
    /** N dias da varredura (INATIVIDADE, NUNCA_ACESSOU). */
    dias: integer("dias"),
    /** Atraso entre o gatilho e a ação (0 = na hora), em minutos. */
    atraso_minutos: integer("atraso_minutos").notNull().default(0),
    /** E-mail a enviar (nulo = só aplica a tag). */
    conteudo: jsonb("conteudo").$type<ConteudoMarketing>(),
    tag_id: uuid("tag_id"),
    /** Filtro do gatilho de lead (`LEAD_CAPTURADO`): só capturas desta página / deste funil; nulo = qualquer. */
    pagina_id: uuid("pagina_id"),
    funil_id: uuid("funil_id"),
    situacao: text("situacao", { enum: SITUACOES_AUTOMACAO }).notNull().default("PAUSADA"),
    ...colunasAuditoria,
  },
  (t) => [
    unique("uq_criadores_automacoes_id_criador").on(t.id, t.criador_id),
    foreignKey({ name: "fk_criadores_automacoes_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_automacoes_tag", columns: [t.tag_id, t.criador_id], foreignColumns: [criadores_tags.id, criadores_tags.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_automacoes_pagina", columns: [t.pagina_id, t.criador_id], foreignColumns: [criadores_paginas.id, criadores_paginas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_automacoes_funil", columns: [t.funil_id, t.criador_id], foreignColumns: [criadores_funis.id, criadores_funis.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    // Ganchos: "quem está ATIVA neste gatilho neste criador?" (uma consulta por evento).
    index("ix_criadores_automacoes_gatilho").on(t.criador_id, t.gatilho).where(sql`situacao = 'ATIVA' and is_deleted = false`),
    check("ck_criadores_automacoes_nome", sql`length(trim(nome)) between 2 and 80`),
    check("ck_criadores_automacoes_gatilho", sql.raw(`gatilho in (${listaSql(GATILHOS_AUTOMACAO)})`)),
    check("ck_criadores_automacoes_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_AUTOMACAO)})`)),
    check("ck_criadores_automacoes_curso", sql.raw(`produto_id is null or gatilho in (${listaSql(GATILHOS_COM_CURSO)})`)),
    check("ck_criadores_automacoes_dias", sql.raw(`(gatilho in (${listaSql(GATILHOS_COM_DIAS)})) = (dias is not null) and (dias is null or dias between 1 and 365)`)),
    check("ck_criadores_automacoes_atraso", sql`atraso_minutos between 0 and 43200`),
    check("ck_criadores_automacoes_origem_lead", sql.raw(`(pagina_id is null and funil_id is null) or gatilho = '${GATILHO_LEAD}'`)),
    check("ck_criadores_automacoes_acao", sql`conteudo is not null or tag_id is not null`),
    check("ck_criadores_automacoes_conteudo", sql`conteudo is null or jsonb_typeof(conteudo) = 'object'`),
  ],
);

/**
 * Um envio = um destinatário (MEMBRO ou LEAD, exatamente um — ADR-0023) de uma campanha, de uma
 * execução de automação ou do reenvio em massa do primeiro acesso (só membro). `chave` única por criador = idempotência (reprocessar não duplica). Métricas de
 * abertura (pixel) e clique (redirect assinado) são gravadas pelo sistema sem mexer em `updated_at`.
 */
export const criadores_emails_envios = pgTable(
  "criadores_emails_envios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    membro_id: uuid("membro_id"),
    /** Lead das páginas (ADR-0023); exatamente um de `membro_id`/`lead_id`. */
    lead_id: uuid("lead_id"),
    origem: text("origem", { enum: ORIGENS_ENVIO }).notNull(),
    campanha_id: uuid("campanha_id"),
    automacao_id: uuid("automacao_id"),
    /** `campanha:<id>:<membro>`, `campanha:<id>:lead:<lead>`, `automacao:<execucao>`, `primeiro-acesso:<lote>:<membro>`. */
    chave: text("chave").notNull(),
    situacao: text("situacao", { enum: SITUACOES_ENVIO }).notNull().default("PENDENTE"),
    /** Por que foi IGNORADO ou o código do erro (≤ 120), nunca a mensagem do SMTP. */
    motivo: text("motivo"),
    tentativas: integer("tentativas").notNull().default(0),
    enviado_em: instante("enviado_em"),
    aberto_em: instante("aberto_em"),
    aberturas: integer("aberturas").notNull().default(0),
    clicado_em: instante("clicado_em"),
    cliques: integer("cliques").notNull().default(0),
    ...colunasAuditoria,
  },
  (t) => [
    unique("uq_criadores_emails_envios_id_criador").on(t.id, t.criador_id),
    uniqueIndex("uq_criadores_emails_envios_chave").on(t.criador_id, t.chave),
    foreignKey({ name: "fk_criadores_emails_envios_membro", columns: [t.membro_id, t.criador_id], foreignColumns: [criadores_membros.id, criadores_membros.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_emails_envios_lead", columns: [t.lead_id, t.criador_id], foreignColumns: [criadores_leads.id, criadores_leads.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_emails_envios_campanha", columns: [t.campanha_id, t.criador_id], foreignColumns: [criadores_campanhas.id, criadores_campanhas.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_emails_envios_automacao", columns: [t.automacao_id, t.criador_id], foreignColumns: [criadores_automacoes.id, criadores_automacoes.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_criadores_emails_envios_campanha").on(t.campanha_id, t.situacao).where(sql`campanha_id is not null`),
    index("ix_criadores_emails_envios_automacao").on(t.automacao_id).where(sql`automacao_id is not null`),
    index("ix_criadores_emails_envios_pendentes").on(t.created_at).where(sql`situacao = 'PENDENTE' and is_deleted = false`),
    check("ck_criadores_emails_envios_origem", sql.raw(`origem in (${listaSql(ORIGENS_ENVIO)})`)),
    check("ck_criadores_emails_envios_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_ENVIO)})`)),
    check(
      "ck_criadores_emails_envios_vinculo",
      sql`(origem = 'CAMPANHA') = (campanha_id is not null) and (origem = 'AUTOMACAO') = (automacao_id is not null)`,
    ),
    check("ck_criadores_emails_envios_destinatario", sql`(membro_id is null) <> (lead_id is null) and (lead_id is null or origem <> 'PRIMEIRO_ACESSO')`),
    check("ck_criadores_emails_envios_chave", sql`length(chave) <= 200`),
    check("ck_criadores_emails_envios_motivo", sql`motivo is null or length(motivo) <= 120`),
    check("ck_criadores_emails_envios_contadores", sql`tentativas >= 0 and aberturas >= 0 and cliques >= 0`),
  ],
);

/** Histórico das automações: um por (automação, membro OU lead, referência do gatilho) = dispara 1x. */
export const criadores_automacoes_execucoes = pgTable(
  "criadores_automacoes_execucoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    automacao_id: uuid("automacao_id").notNull(),
    membro_id: uuid("membro_id"),
    /** Gatilho de lead (ADR-0023); exatamente um de `membro_id`/`lead_id`. */
    lead_id: uuid("lead_id"),
    /** `captura` (lead), `matricula:<id>`, `aula:<id>`, `curso:<id>`, `certificado:<id>`, `voucher:<resgate>`, `cadastro`, `inativo:<último acesso>`, `nunca-acessou`. */
    referencia: text("referencia").notNull(),
    situacao: text("situacao", { enum: SITUACOES_EXECUCAO }).notNull().default("AGENDADA"),
    executar_em: instante("executar_em").notNull(),
    executada_em: instante("executada_em"),
    tag_aplicada: boolean("tag_aplicada").notNull().default(false),
    envio_id: uuid("envio_id"),
    motivo: text("motivo"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_automacoes_execucoes_automacao", columns: [t.automacao_id, t.criador_id], foreignColumns: [criadores_automacoes.id, criadores_automacoes.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_automacoes_execucoes_membro", columns: [t.membro_id, t.criador_id], foreignColumns: [criadores_membros.id, criadores_membros.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_automacoes_execucoes_lead", columns: [t.lead_id, t.criador_id], foreignColumns: [criadores_leads.id, criadores_leads.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_criadores_automacoes_execucoes_envio", columns: [t.envio_id, t.criador_id], foreignColumns: [criadores_emails_envios.id, criadores_emails_envios.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_automacoes_execucoes_ref").on(t.automacao_id, t.membro_id, t.referencia),
    uniqueIndex("uq_criadores_automacoes_execucoes_ref_lead").on(t.automacao_id, t.lead_id, t.referencia).where(sql`lead_id is not null`),
    index("ix_criadores_automacoes_execucoes_automacao").on(t.automacao_id, t.created_at),
    index("ix_criadores_automacoes_execucoes_agendadas").on(t.executar_em).where(sql`situacao = 'AGENDADA' and is_deleted = false`),
    check("ck_criadores_automacoes_execucoes_destinatario", sql`(membro_id is null) <> (lead_id is null)`),
    check("ck_criadores_automacoes_execucoes_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_EXECUCAO)})`)),
    check("ck_criadores_automacoes_execucoes_tamanhos", sql`length(referencia) between 1 and 200 and (motivo is null or length(motivo) <= 120)`),
  ],
);

/**
 * Descadastro de marketing POR CRIADOR (LGPD): guarda o HMAC do endereço (o mesmo de
 * `emails_disparos`, chave derivada do BETTER_AUTH_SECRET) e a máscara para a tela, nunca o e-mail.
 * Campanhas e automações consultam antes de cada envio; e-mail transacional não.
 */
export const criadores_emails_descadastros = pgTable(
  "criadores_emails_descadastros",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    destinatario_hash: text("destinatario_hash").notNull(),
    destinatario_mascarado: text("destinatario_mascarado").notNull(),
    origem: text("origem", { enum: ORIGENS_DESCADASTRO }).notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_criadores_emails_descadastros_vivo").on(t.criador_id, t.destinatario_hash).where(sql`is_deleted = false`),
    check("ck_criadores_emails_descadastros_hash", sql`destinatario_hash ~ '^[0-9a-f]{64}$'`),
    check("ck_criadores_emails_descadastros_mascara", sql`length(destinatario_mascarado) <= 120`),
    check("ck_criadores_emails_descadastros_origem", sql.raw(`origem in (${listaSql(ORIGENS_DESCADASTRO)})`)),
  ],
);

export type Campanha = typeof criadores_campanhas.$inferSelect;
export type Automacao = typeof criadores_automacoes.$inferSelect;
export type EnvioEmail = typeof criadores_emails_envios.$inferSelect;
