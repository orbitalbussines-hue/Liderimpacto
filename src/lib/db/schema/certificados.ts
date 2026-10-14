import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria, instante } from "./_compartilhado";
import { SITUACOES_CERTIFICADO, SITUACOES_VERSAO_CERTIFICADO, listaSql } from "./_enums";
import { arquivos } from "./arquivos";
import { criadores, criadores_membros } from "./criadores";
import { produtos_matriculas } from "./matriculas";
import { produtos } from "./produtos";

/**
 * Certificados (passo 7, SISTEMA.md §4 CertificateTemplate/Certificate; RN-127 a RN-129; ADR-0008).
 *
 * - Modelo: um PADRÃO do criador (`produto_id` nulo) e, opcionalmente, um por produto.
 * - Certificado: UM vivo por (membro, produto) — a emissão automática é idempotente pelo índice
 *   único (`on conflict do nothing`). `codigo` (10 caracteres base32 sem ambíguos) é único em
 *   toda a plataforma e nunca reaproveitado. Revogar = situação + motivo (nunca apaga).
 * - Versões do PDF: v1, v2... (única por certificado); cada uma congela os dados (`dados`) e,
 *   pronta, aponta o `arquivos` (finalidade CERTIFICADO) no storage. Serve-se sempre a última PRONTA.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

/** Dados congelados de uma versão do PDF (o worker só desenha isto). */
export interface DadosCertificado {
  nome: string;
  curso: string;
  /** Soma da duração das aulas publicadas (segundos), no momento da versão. */
  cargaHorariaSeg: number;
  /** Conclusão (matrícula), ISO. */
  concluidoEm: string;
  titulo: string;
  /** Texto do modelo JÁ com as variáveis preenchidas. */
  texto: string;
  assinaturaNome: string;
  assinaturaCargo: string;
  /** Hex da cor (modelo → curso → criador → padrão). */
  cor: string;
  /** "Logo" em texto (o logo oficial ainda não existe). */
  criador: string;
  codigo: string;
  urlVerificacao: string;
}

export const criadores_certificados_modelos = pgTable(
  "criadores_certificados_modelos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    /** Nulo = modelo padrão do criador. */
    produto_id: uuid("produto_id"),
    titulo: text("titulo").notNull(),
    /** Variáveis: {nome}, {curso}, {carga_horaria}, {data}. */
    texto: text("texto").notNull(),
    assinatura_nome: text("assinatura_nome").notNull(),
    assinatura_cargo: text("assinatura_cargo").notNull().default(""),
    /** Nula = cor do curso, senão a do criador. */
    cor: text("cor"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_certificados_modelos_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_certificados_modelos_padrao_vivo").on(t.criador_id).where(sql`is_deleted = false and produto_id is null`),
    uniqueIndex("uq_criadores_certificados_modelos_produto_vivo").on(t.produto_id).where(sql`is_deleted = false and produto_id is not null`),
    check("ck_criadores_certificados_modelos_cor", sql`cor is null or cor ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'`),
    check("ck_criadores_certificados_modelos_texto", sql`length(trim(texto)) between 10 and 600`),
  ],
);

export const produtos_certificados = pgTable(
  "produtos_certificados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    produto_id: uuid("produto_id").notNull(),
    membro_id: uuid("membro_id").notNull(),
    matricula_id: uuid("matricula_id").notNull(),
    codigo: text("codigo").notNull(),
    situacao: text("situacao", { enum: SITUACOES_CERTIFICADO }).notNull().default("EMITIDO"),
    emitido_em: instante("emitido_em").notNull().defaultNow(),
    revogado_em: instante("revogado_em"),
    motivo_revogacao: text("motivo_revogacao"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_produtos_certificados_produto", columns: [t.produto_id, t.criador_id], foreignColumns: [produtos.id, produtos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_produtos_certificados_membro",
      columns: [t.membro_id, t.criador_id],
      foreignColumns: [criadores_membros.id, criadores_membros.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_produtos_certificados_matricula", columns: [t.matricula_id], foreignColumns: [produtos_matriculas.id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    // Idempotência da emissão: duas conclusões simultâneas = um certificado.
    uniqueIndex("uq_produtos_certificados_par_vivo").on(t.membro_id, t.produto_id).where(sql`is_deleted = false`),
    // Vale para TODAS as linhas: um código nunca volta a existir.
    uniqueIndex("uq_produtos_certificados_codigo").on(t.codigo),
    unique("uq_produtos_certificados_id_criador").on(t.id, t.criador_id),
    index("ix_produtos_certificados_criador_emitido").on(t.criador_id, t.emitido_em.desc()).where(sql`is_deleted = false`),
    check("ck_produtos_certificados_codigo", sql`codigo ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$'`),
    check("ck_produtos_certificados_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_CERTIFICADO)})`)),
    check(
      "ck_produtos_certificados_revogacao",
      sql`(situacao = 'EMITIDO' and revogado_em is null) or (situacao = 'REVOGADO' and revogado_em is not null and length(trim(motivo_revogacao)) >= 3)`,
    ),
  ],
);

export const produtos_certificados_versoes = pgTable(
  "produtos_certificados_versoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    certificado_id: uuid("certificado_id").notNull(),
    /** v1, v2... */
    versao: integer("versao").notNull(),
    situacao: text("situacao", { enum: SITUACOES_VERSAO_CERTIFICADO }).notNull().default("PENDENTE"),
    dados: jsonb("dados").$type<DadosCertificado>().notNull(),
    /** PDF no storage (preenchido quando PRONTA). */
    arquivo_id: uuid("arquivo_id"),
    gerada_em: instante("gerada_em"),
    /** Erro LEGÍVEL (detalhe técnico no log do worker). */
    erro: text("erro"),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_produtos_certificados_versoes_certificado",
      columns: [t.certificado_id, t.criador_id],
      foreignColumns: [produtos_certificados.id, produtos_certificados.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_produtos_certificados_versoes_arquivo", columns: [t.arquivo_id, t.criador_id], foreignColumns: [arquivos.id, arquivos.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_produtos_certificados_versoes_numero").on(t.certificado_id, t.versao),
    check("ck_produtos_certificados_versoes_numero", sql`versao >= 1`),
    check("ck_produtos_certificados_versoes_pronta", sql`situacao <> 'PRONTA' or (arquivo_id is not null and gerada_em is not null)`),
    check("ck_produtos_certificados_versoes_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_VERSAO_CERTIFICADO)})`)),
  ],
);

export type ModeloCertificado = typeof criadores_certificados_modelos.$inferSelect;
export type Certificado = typeof produtos_certificados.$inferSelect;
export type VersaoCertificado = typeof produtos_certificados_versoes.$inferSelect;
