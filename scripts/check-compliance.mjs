#!/usr/bin/env node
// @ts-check
/**
 * check-compliance.mjs — Auditor de conformidade da Estrutura Base.
 *
 * Uso:
 *   node scripts/check-compliance.mjs                # escaneia src/ (ou cwd)
 *   node scripts/check-compliance.mjs --file <path>  # escaneia um arquivo
 *   node scripts/check-compliance.mjs --json         # saida JSON (CI/IA)
 *   node scripts/check-compliance.mjs --quiet        # so erros (esconde avisos)
 *   node scripts/check-compliance.mjs --help
 *
 * Exit code: 1 se houver ERROS, 0 caso contrario (avisos nao falham).
 *
 * Regras checadas:
 *   [ERRO]  prisma / sqlite       — o projeto usa Drizzle + PostgreSQL
 *   [ERRO]  delete-fisico         — db/tx.delete(), deleteMany(), DELETE FROM
 *   [ERRO]  drop-destrutivo       — DROP TABLE/DATABASE/SCHEMA em .sql
 *   [ERRO]  arquivo-grande        — mais de 500 linhas (exceto src/components/ui/)
 *   [ERRO]  tabela-sem-auditoria  — pgTable sem as 5 colunas (inclui modified_by)
 *   [ERRO]  timestamp-cru         — timestamp("x") sem precision 3 (quebra a trava)
 *   [ERRO]  fk-sem-ondelete       — .references(() => x.id) sem onDelete explicito
 *   [ERRO]  segredo               — chaves de API, tokens, chaves privadas
 *   [ERRO]  texto-cru             — mojibake, ou escape \u00XX em .tsx/.jsx
 *   [AVISO] query-sem-filtro      — select/findMany sem filtro de is_deleted
 *   [AVISO] cascade               — onDelete: 'cascade' (preferir restrict)
 *   [AVISO] onupdate-updated-at   — $onUpdate em updated_at envelhece a trava
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname, relative, basename, resolve } from "node:path";

const ROOT = process.cwd();
const MAX_LINES = 500;

/**
 * Excecao de caminho do limite de linhas. `src/components/ui/` e codigo de
 * terceiro vendorizado pelo CLI do shadcn, que a regra proibe editar. Vale SO
 * para `arquivo-grande` — as demais regras continuam valendo la dentro.
 */
const ISENTOS_DE_TAMANHO = ["src/components/ui/"];

const IGNORE_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", "build", "coverage",
  ".turbo", "out", ".vercel", ".lixo-quarentena",
  "templates", // padroes-ouro com imports de exemplo, nao escanear
  "migrations", "drizzle", // SQL gerado por drizzle-kit
]);

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const JSX_EXT = new Set([".tsx", ".jsx"]);
const SQL_EXT = new Set([".sql"]);

// Os proprios scripts de auditoria contem os padroes proibidos como DEFINICAO
// de regra (ex.: o regex que detecta Prisma). Nunca auto-sinalizar.
const SKIP_FILES = new Set(["check-compliance.mjs", "project-map.mjs"]);

// ---------------------------------------------------------------------------
// Regras baseadas em regex (linha a linha)
// ---------------------------------------------------------------------------

/**
 * `vale_em_comentario`: a regra dispara mesmo em linha de comentario.
 * @type {{id:string,level:'error'|'warn',re:RegExp,msg:string,ext?:Set<string>,vale_em_comentario?:boolean}[]}
 */
const LINE_RULES = [
  {
    id: "prisma",
    level: "error",
    re: /@prisma\/client|new\s+PrismaClient|from\s+["']prisma["']|require\(["']@prisma\/client["']\)/,
    msg: "Prisma detectado. Este projeto usa Drizzle ORM. Remova o Prisma.",
  },
  {
    id: "sqlite",
    level: "error",
    re: /better-sqlite3|drizzle-orm\/better-sqlite3|from\s+["']sqlite3?["']|:memory:/,
    msg: "SQLite detectado. Este projeto usa PostgreSQL em todos os ambientes.",
  },
  {
    id: "delete-fisico",
    level: "error",
    // `tx.delete(` (dentro de transacao) e `DELETE FROM` (SQL cru) sao os dois
    // caminhos que o codigo novo usaria sem perceber.
    re: /\b(db|tx|trx)\.delete\s*\(|\.deleteMany\s*\(|\bdrizzle[\w.]*\.delete\s*\(|\bDELETE\s+FROM\b/i,
    msg: "Delete fisico detectado. Use soft delete (marcaDeExclusao em src/lib/db/soft-delete.ts).",
  },
  {
    id: "drop-destrutivo",
    level: "error",
    ext: SQL_EXT,
    re: /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,
    msg: "DROP destrutivo em SQL. Proibido dropar estruturas de dados.",
  },
  {
    id: "segredo",
    level: "error",
    vale_em_comentario: true,
    // `sk-ant-…`/`sk-proj-…` tem hifen no meio; PKCS#8 comeca sem o algoritmo.
    re: /sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN\s+((RSA|EC|DSA|OPENSSH|ENCRYPTED)\s+)?PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}/,
    msg: "Possivel segredo/credencial hardcoded. Mova para variavel de ambiente.",
  },
  {
    id: "timestamp-cru",
    level: "error",
    ext: CODE_EXT,
    // O Postgres guarda microssegundo; o Date do JS, milissegundo. Sem
    // precision 3, `eq(updated_at, valorDaTela)` nunca bate e toda edicao
    // legitima e recusada como colisao.
    re: /\btimestamp\s*\(\s*["'`][^"'`]+["'`]\s*\)/,
    msg: "timestamp() sem opcoes. Use instante() de src/lib/db/schema/_compartilhado.ts (timestamptz(3)).",
  },
  {
    id: "fk-sem-ondelete",
    level: "error",
    ext: CODE_EXT,
    re: /\.references\s*\(\s*\(\s*\)\s*=>\s*[\w.]+\s*\)/,
    msg: 'FK sem regra explicita. Use .references(() => pai.id, { onDelete: "restrict", onUpdate: "restrict" }).',
  },
  {
    id: "texto-cru",
    level: "error",
    ext: CODE_EXT,
    vale_em_comentario: true,
    // Mojibake: arquivo UTF-8 lido como cp1252 e regravado (acento vira `Ã` + outro).
    re: /[\u00C3\u00C2][\u0080-\u00BF]|\u00E2\u20AC/,
    msg: "Texto acentuado quebrado (mojibake). Os arquivos sao UTF-8: reescreva o caractere acentuado.",
  },
  {
    id: "texto-cru",
    level: "error",
    ext: JSX_EXT,
    // Em texto JSX o escape nao e interpretado: a tela mostra a barra e o codigo, nao o acento.
    re: /\\u00[c-fC-F][0-9a-fA-F]/,
    msg: "Escape unicode literal em .tsx/.jsx. Escreva o caractere acentuado direto.",
  },
  {
    id: "cascade",
    level: "warn",
    re: /onDelete:\s*["']cascade["']/i,
    msg: "CASCADE em FK. Preferir RESTRICT para dados criticos.",
  },
  {
    id: "onupdate-updated-at",
    level: "warn",
    re: /updated_at.*\$onUpdate|\$onUpdate.*updated_at/,
    msg: "$onUpdate em updated_at: todo UPDATE de sistema envelhece a trava de colisao. Grave updated_at na action.",
  },
];

// ---------------------------------------------------------------------------
// Coleta de arquivos
// ---------------------------------------------------------------------------

/** @param {string} dir @param {string[]} acc */
function walk(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      walk(full, acc);
    } else if (e.isFile()) {
      if (SKIP_FILES.has(e.name)) continue;
      const ext = extname(e.name);
      if (CODE_EXT.has(ext) || SQL_EXT.has(ext)) acc.push(full);
    }
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Checagem de tabelas Drizzle (pgTable sem colunas de auditoria)
// ---------------------------------------------------------------------------

const AUDIT_COLS = ["created_at", "updated_at", "deleted_at", "is_deleted"];
/** Coluna de autoria: basta uma das duas. */
const RASTREIO = ["modified_by", "user_id"];
const TODAS = [...AUDIT_COLS, ...RASTREIO];

/**
 * Marcadores de excecao, escritos em comentario nas linhas acima do pgTable,
 * SEMPRE com a justificativa ao lado. Nao sao escape hatch generico.
 *
 * - `compliance:append-only`: a trilha de auditoria. Log que pode ser alterado
 *   ou "soft deletado" nao e trilha — ela nao tem updated_at/deleted_at/is_deleted.
 * - `compliance:framework`: tabela governada pela biblioteca de auth (ex.: o
 *   Better Auth apaga sessao e verificacao fisicamente e nao tem soft delete).
 *   `is_deleted = false` numa linha que a lib vai apagar e mentira gravada.
 */
const MARCADORES = ["compliance:append-only", "compliance:framework"];

/**
 * Devolve o trecho `{ ... }` que comeca em `openIdx`, balanceando as chaves.
 * @param {string} content @param {number} openIdx @returns {string|null}
 */
function corpoDoObjeto(content, openIdx) {
  if (content[openIdx] !== "{") return null;
  let depth = 0;
  for (let i = openIdx; i < content.length; i++) {
    const c = content[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return content.slice(openIdx, i + 1);
    }
  }
  return null;
}

/**
 * Objetos que EMPACOTAM colunas de auditoria para serem espalhados nas tabelas
 * (`...colunasAuditoria`). Mapeia nome do pacote -> colunas que ele fornece.
 * Sem isto, o padrao que a propria base recomenda seria acusado em toda tabela.
 * @type {Map<string, Set<string>>}
 */
const PACOTES_AUDITORIA = new Map();

/**
 * Pre-passada: acha `const NOME = { ... }` que declare colunas de auditoria.
 * @param {string[]} files
 */
function coletarPacotesDeAuditoria(files) {
  for (const file of files) {
    if (!CODE_EXT.has(extname(file))) continue;
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const re = /(?:export\s+)?const\s+(\w+)\s*=\s*\{/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const nome = m[1];
      const corpo = corpoDoObjeto(content, m.index + m[0].length - 1);
      if (!corpo) continue;
      const fornece = TODAS.filter((c) => corpo.includes(c));
      if (fornece.length === 0) continue;
      const acumulado = PACOTES_AUDITORIA.get(nome) ?? new Set();
      for (const c of fornece) acumulado.add(c);
      PACOTES_AUDITORIA.set(nome, acumulado);
    }
  }
}

/**
 * Extrai o corpo de cada pgTable('nome', { ... }) — ou da forma callback
 * pgTable('nome', (t) => ({ ... })) — e verifica as colunas.
 * @param {string} content @param {string} file @param {Finding[]} findings
 */
function checkDrizzleTables(content, file, findings) {
  const re = /pgTable\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*(?:\(?\s*\w*\s*\)?\s*=>\s*\(\s*)?\{/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const tableName = m[1];
    // Janela acima da declaracao: o marcador precisa estar perto da tabela.
    const janela = content.slice(Math.max(0, m.index - 600), m.index);
    if (MARCADORES.some((mk) => janela.includes(mk))) continue;
    const body = corpoDoObjeto(content, m.index + m[0].length - 1);
    if (!body) continue;

    // So conta o pacote que REALMENTE declara a coluna: espalhar um objeto
    // qualquer nao isenta a tabela.
    const viaPacote = new Set();
    for (const s of body.matchAll(/\.\.\.(\w+)/g)) {
      for (const col of PACOTES_AUDITORIA.get(s[1]) ?? []) viaPacote.add(col);
    }
    const tem = (col) => body.includes(col) || viaPacote.has(col);

    const missing = AUDIT_COLS.filter((col) => !tem(col));
    if (!RASTREIO.some(tem)) missing.push("modified_by (ou user_id)");
    if (missing.length > 0) {
      const line = content.slice(0, m.index).split("\n").length;
      findings.push({
        level: "error",
        id: "tabela-sem-auditoria",
        file,
        line,
        msg: `Tabela "${tableName}" sem colunas de auditoria: ${missing.join(", ")}.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Checagem heuristica: query sem filtro is_deleted
// ---------------------------------------------------------------------------

// Helpers que JA aplicam o filtro de soft delete. Registre aqui o helper novo
// que o projeto adotar — nome fora desta lista vira aviso falso.
const HELPERS_SOFT_DELETE =
  /\b(vivos|travaDeColisao|marcaDeExclusao|ativo|ativos|ativoPorId|contarAtivos)\s*\(/;

const RE_FIND = /\.query\.\w+\.find(Many|First)\s*\(/;

/** @param {string} content @param {string} file @param {Finding[]} findings */
function checkSoftDeleteFilter(content, file, findings) {
  const temSelect = /\.from\s*\(/.test(content) && /\.select\s*\(/.test(content);
  const temFind = RE_FIND.test(content);
  if (!temSelect && !temFind) return;
  // `is_deleted` e o nome da coluna; `isDeleted` e o nome em camelCase.
  if (/is_deleted|isDeleted/.test(content)) return;
  if (HELPERS_SOFT_DELETE.test(content)) return;
  const idx = temSelect ? content.search(/\.from\s*\(/) : content.search(RE_FIND);
  const line = content.slice(0, idx).split("\n").length;
  findings.push({
    level: "warn",
    id: "query-sem-filtro",
    file,
    line,
    msg: "Arquivo consulta o banco mas nunca filtra is_deleted. Use vivos() de src/lib/db/soft-delete.ts.",
  });
}

// ---------------------------------------------------------------------------
// Analise de um arquivo
// ---------------------------------------------------------------------------

/**
 * @typedef {{level:'error'|'warn',id:string,file:string,line:number,msg:string}} Finding
 * @param {string} file @returns {Finding[]}
 */
function analyzeFile(file) {
  /** @type {Finding[]} */
  const findings = [];
  if (SKIP_FILES.has(basename(file))) return findings; // vale tambem no modo --file
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return findings;
  }
  const ext = extname(file);
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const lines = content.split("\n");

  const isentoDeTamanho = ISENTOS_DE_TAMANHO.some((p) => rel.startsWith(p));
  if (lines.length > MAX_LINES && !isentoDeTamanho) {
    findings.push({
      level: "error",
      id: "arquivo-grande",
      file: rel,
      line: lines.length,
      msg: `Arquivo com ${lines.length} linhas (limite ${MAX_LINES}). Quebre em modulos.`,
    });
  }

  lines.forEach((text, i) => {
    // ignora linhas de comentario para reduzir falso-positivo de exemplos
    const trimmed = text.trim();
    const isComment = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
    for (const rule of LINE_RULES) {
      if (rule.ext && !rule.ext.has(ext)) continue;
      if (isComment && !rule.vale_em_comentario) continue;
      if (rule.re.test(text)) {
        findings.push({ level: rule.level, id: rule.id, file: rel, line: i + 1, msg: rule.msg });
      }
    }
  });

  if (CODE_EXT.has(ext)) {
    checkDrizzleTables(content, rel, findings);
    checkSoftDeleteFilter(content, rel, findings);
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(readFileSync(new URL(import.meta.url)).toString().split("\n").slice(3, 27).join("\n").replace(/^ \* ?/gm, ""));
    process.exit(0);
  }
  const asJson = args.includes("--json");
  const quiet = args.includes("--quiet");
  const fileFlag = args.indexOf("--file");

  const srcDir = join(ROOT, "src");
  const scanRoot = existsSync(srcDir) ? srcDir : ROOT;
  const todosOsArquivos = walk(scanRoot, []);

  /** @type {string[]} */
  let files = [];
  if (fileFlag !== -1 && args[fileFlag + 1]) {
    const target = resolve(args[fileFlag + 1]);
    if (existsSync(target) && statSync(target).isFile()) files = [target];
  } else {
    files = todosOsArquivos;
  }

  // Pre-passada sempre sobre o projeto INTEIRO, mesmo com --file: o pacote de
  // colunas mora em outro arquivo (`_compartilhado.ts`).
  coletarPacotesDeAuditoria(todosOsArquivos);

  /** @type {Finding[]} */
  let findings = [];
  for (const f of files) findings = findings.concat(analyzeFile(f));

  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");

  if (asJson) {
    console.log(JSON.stringify({
      ok: errors.length === 0,
      scanned: files.length,
      errors: errors.length,
      warnings: warns.length,
      findings,
    }, null, 2));
    process.exit(errors.length === 0 ? 0 : 1);
  }

  const show = quiet ? errors : findings;
  if (show.length === 0) {
    console.log(`OK — ${files.length} arquivo(s) escaneado(s), nenhuma violacao.`);
    process.exit(0);
  }

  /** @type {Map<string,Finding[]>} */
  const byFile = new Map();
  for (const f of show) {
    const arr = byFile.get(f.file) || [];
    arr.push(f);
    byFile.set(f.file, arr);
  }
  for (const [file, fs] of byFile) {
    console.log(`\n${file}`);
    for (const f of fs.sort((a, b) => a.line - b.line)) {
      const tag = f.level === "error" ? "ERRO " : "AVISO";
      console.log(`  ${tag} L${f.line}  [${f.id}] ${f.msg}`);
    }
  }
  console.log(`\n${"-".repeat(60)}`);
  console.log(`Escaneados: ${files.length} | Erros: ${errors.length} | Avisos: ${warns.length}`);
  process.exit(errors.length === 0 ? 0 : 1);
}

main();
