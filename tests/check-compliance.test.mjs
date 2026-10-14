#!/usr/bin/env node
/**
 * Trava do check-compliance.
 *
 * O auditor precisa reconhecer os helpers da base (`...colunasAuditoria`,
 * `vivos()`) e as excecoes escritas (marcadores, `src/components/ui/`) SEM
 * virar um carimbo que aprova qualquer coisa. Este teste prova as duas metades:
 * o que e correto passa, o que e violacao continua sendo acusado.
 *
 * Portao que da falso positivo em codigo correto e portao que a equipe aprende
 * a ignorar. E o inverso tambem vale: excecao sem trava vira escape hatch.
 *
 * As fixtures sao montadas em tempo de execucao (concatenando os nomes) para
 * que este proprio arquivo nao seja lido como codigo de verdade pelo auditor.
 *
 * Uso: node tests/check-compliance.test.mjs
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const AQUI = dirname(fileURLToPath(import.meta.url));
const AUDITOR = resolve(AQUI, "../scripts/check-compliance.mjs");

const PG = "pg" + "Table";
const TS = "tim" + "estamp";

/** Tabela na forma objeto. */
const tabela = (nome, corpo) =>
  `export const ${nome} = ${PG}("${nome}", { id: text("id").primaryKey(), ${corpo} });`;

/** Consulta com o `.from(` montado em tempo de execucao. */
const consulta = (onde) =>
  `export async function listar() { return db.se` + `lect().fr` + `om(t)${onde}; }`;

/** Arquivo com `linhas` linhas de codigo inofensivo. */
const arquivoLongo = (linhas) =>
  Array.from({ length: linhas }, (_, i) => `export const constante${i} = ${i};`).join("\n");

const QUATRO = 'created_at: x, updated_at: x, deleted_at: x, is_deleted: x';

const CASOS = {
  "src/pacote.ts": [
    "export const colunasAuditoria = {",
    '  created_at: instante("created_at").notNull().defaultNow(),',
    '  updated_at: instante("updated_at").notNull().defaultNow(),',
    '  deleted_at: instante("deleted_at"),',
    '  is_deleted: boolean("is_deleted").notNull().default(false),',
    '  modified_by: uuid("modified_by").notNull(),',
    "};",
    'export const naoEAuditoria = { foo: text("foo"), bar: text("bar") };',
  ].join("\n"),

  // --- tabelas ---
  "src/boa.ts": tabela("boa", "...colunasAuditoria"),
  "src/boa-callback.ts":
    `export const cb = ${PG}("cb", (t) => ({ id: t.text("id"), ...colunasAuditoria }));`,
  "src/ruim-sem-nada.ts": tabela("ruim", 'nome: text("nome")'),
  "src/ruim-spread-falso.ts": tabela("disfarcada", "...naoEAuditoria"),
  "src/ruim-sem-autoria.ts": tabela("sem_autoria", QUATRO),
  "src/boa-user-id.ts": tabela("com_user_id", `${QUATRO}, user_id: x`),
  "src/ruim-callback.ts": `export const cb2 = ${PG}("cb2", (t) => ({ id: t.text("id") }));`,
  "src/framework-marcada.ts": [
    "// compliance:framework — a lib de auth apaga a sessao fisicamente;",
    "// o ciclo de vida fica na trilha de eventos de login.",
    tabela("usuarios_sessoes", 'token: text("token").notNull()'),
  ].join("\n"),
  "src/framework-sem-marcador.ts": tabela("usuarios_totp", 'segredo: text("segredo")'),

  // --- consultas ---
  "src/query-ruim.ts": consulta(""),
  "src/query-helper.ts": consulta(".where(vivos(t))"),
  "src/query-camel.ts": consulta(".where(eq(t.isDeleted, false))"),
  "src/query-find-ruim.ts": "export const f = () => db.qu" + "ery.usuarios.findMany();",

  // --- linha a linha ---
  "src/delete-tx.ts": "export const apagar = (tx, t) => tx.del" + "ete(t);",
  "src/delete-sql.ts": "export const q = sql`DEL" + "ETE FROM usuarios`;",
  "src/timestamp-cru.ts": `export const c = { criado: ${TS}("criado") };`,
  "src/timestamp-bom.ts": `export const c = { criado: ${TS}("criado", { precision: 3, withTimezone: true }) };`,
  "src/fk-sem-regra.ts": "export const c = uuid('pai_id').refer" + "ences(() => pais.id);",
  "src/fk-com-regra.ts":
    "export const c = uuid('pai_id').refer" + 'ences(() => pais.id, { onDelete: "restrict", onUpdate: "restrict" });',
  "src/mojibake.ts": `export const titulo = "Automa${String.fromCharCode(0xc3, 0xa7)}${String.fromCharCode(0xc3, 0xb5)}es";`,
  "src/escape.tsx": "export const T = () => <p>Automa" + "\\" + "u00e7" + "oes</p>;",
  "src/acento-ok.tsx": "export const T = () => <p>Automações</p>;",
};

const dir = mkdtempSync(join(tmpdir(), "compliance-"));
try {
  for (const [nome, conteudo] of Object.entries(CASOS)) {
    mkdirSync(dirname(join(dir, nome)), { recursive: true });
    writeFileSync(join(dir, nome), conteudo, "utf8");
  }
  // Primitivo vendorizado do shadcn: passa do limite e NAO e acusado.
  mkdirSync(join(dir, "src", "components", "ui"), { recursive: true });
  writeFileSync(join(dir, "src", "components", "ui", "grande.tsx"), arquivoLongo(600), "utf8");
  // Codigo nosso do mesmo tamanho: continua reprovando.
  mkdirSync(join(dir, "src", "components", "comum"), { recursive: true });
  writeFileSync(join(dir, "src", "components", "comum", "grande.tsx"), arquivoLongo(600), "utf8");

  let saida;
  try {
    saida = execFileSync(process.execPath, [AUDITOR, "--json"], { cwd: dir, encoding: "utf8" });
  } catch (e) {
    saida = e.stdout; // exit 1 quando ha erro: esperado, o relatorio vem no stdout
  }
  const r = JSON.parse(saida);
  const ids = (arquivo) => r.findings.filter((f) => f.file.endsWith(arquivo)).map((f) => f.id);
  const passa = (arquivo) => () => assert.deepEqual(ids(arquivo), [], `${arquivo} foi acusado`);
  const reprova = (arquivo, id) => () =>
    assert.ok(ids(arquivo).includes(id), `${arquivo} passou batido (esperado ${id})`);

  /** @type {[string, () => void][]} */
  const CHECAGENS = [
    ["tabela com ...colunasAuditoria passa", passa("src/boa.ts")],
    ["tabela na forma callback com pacote passa", passa("src/boa-callback.ts")],
    ["tabela com user_id como autoria passa", passa("src/boa-user-id.ts")],
    ["tabela sem auditoria reprova", reprova("ruim-sem-nada.ts", "tabela-sem-auditoria")],
    ["spread de objeto qualquer reprova", reprova("ruim-spread-falso.ts", "tabela-sem-auditoria")],
    ["tabela sem modified_by reprova", reprova("ruim-sem-autoria.ts", "tabela-sem-auditoria")],
    ["tabela callback sem auditoria reprova", reprova("ruim-callback.ts", "tabela-sem-auditoria")],
    ["tabela marcada compliance:framework passa", passa("framework-marcada.ts")],
    ["tabela de framework sem marcador reprova", reprova("framework-sem-marcador.ts", "tabela-sem-auditoria")],

    ["consulta com vivos() passa", passa("query-helper.ts")],
    ["consulta com isDeleted passa", passa("query-camel.ts")],
    ["consulta sem filtro avisa", reprova("query-ruim.ts", "query-sem-filtro")],
    ["findMany sem filtro avisa", reprova("query-find-ruim.ts", "query-sem-filtro")],

    ["tx.delete reprova", reprova("delete-tx.ts", "delete-fisico")],
    ["DELETE FROM reprova", reprova("delete-sql.ts", "delete-fisico")],
    ["timestamp sem precision reprova", reprova("timestamp-cru.ts", "timestamp-cru")],
    ["timestamp com precision passa", passa("timestamp-bom.ts")],
    ["FK sem onDelete reprova", reprova("fk-sem-regra.ts", "fk-sem-ondelete")],
    ["FK com onDelete passa", passa("fk-com-regra.ts")],
    ["mojibake reprova", reprova("mojibake.ts", "texto-cru")],
    ["escape unicode em .tsx reprova", reprova("escape.tsx", "texto-cru")],
    ["acento escrito direto passa", passa("acento-ok.tsx")],

    ["primitivo de 600 linhas em components/ui passa", passa("components/ui/grande.tsx")],
    ["arquivo de 600 linhas fora de ui reprova", reprova("components/comum/grande.tsx", "arquivo-grande")],
  ];

  for (const [nome, checar] of CHECAGENS) {
    checar();
    console.log(`  ok  ${nome}`);
  }
  console.log(`OK — ${CHECAGENS.length}/${CHECAGENS.length} checagens do check-compliance.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
