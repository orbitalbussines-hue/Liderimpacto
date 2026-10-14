import { linhaCsvSchema, type LinhaCsv } from "@/lib/validators/membros";

/**
 * Leitura do CSV de importacao de membros (`nome,email,grupo`). Funcao PURA: a tela usa para a
 * previa e a action roda DE NOVO no servidor (o cliente nunca e confiavel). Travada por teste.
 *
 * - ate 1 MB e 1000 linhas de dados; cabecalho obrigatorio (ordem livre, `grupo` opcional);
 * - separador `,` ou `;` (Excel em PT-BR salva com `;`), aspas duplas no padrao RFC 4180;
 * - linha invalida vira erro com o NUMERO da linha no arquivo e nao entra; as validas seguem;
 * - e-mail repetido no arquivo: so a primeira ocorrencia vale.
 */

export const MAX_BYTES_CSV = 1024 * 1024;
export const MAX_LINHAS_CSV = 1000;

export interface LinhaValidaCsv {
  /** Numero da linha no arquivo (1 = cabecalho). */
  numero: number;
  dados: LinhaCsv;
}

export interface ErroCsv {
  numero: number;
  mensagem: string;
}

export type LeituraCsv =
  | { ok: false; erro: string }
  | { ok: true; validas: LinhaValidaCsv[]; erros: ErroCsv[] };

/** Bytes em UTF-8 (o limite e do arquivo, nao do numero de caracteres). */
export const tamanhoEmBytes = (texto: string) => new TextEncoder().encode(texto).length;

/** Quebra uma linha em campos respeitando aspas ("a, b" e "" escapado). */
function campos(linha: string, separador: string): string[] {
  const saida: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === separador) {
      saida.push(atual);
      atual = "";
    } else atual += c;
  }
  saida.push(atual);
  return saida.map((v) => v.trim());
}

const normalizarCabecalho = (v: string) =>
  v
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/^e-mail$/, "email")
    .replace(/[\s-]+/g, "_");

/** O que muda de um CSV para outro: colunas, validacao da linha e o que conta como repetido. */
export interface ConfigCsv<T> {
  obrigatorias: readonly string[];
  opcionais: readonly string[];
  /** "membro", "matrícula": entra na mensagem de arquivo sem linhas. */
  item: string;
  validar: (valores: Record<string, string>, numero: number) => { ok: true; dados: T } | { ok: false; mensagem: string };
  /** Chave de repeticao (so a primeira ocorrencia vale) e a mensagem. */
  chave: (dados: T) => string;
  repetido: string;
}

export type LeituraCsvDe<T> = { ok: false; erro: string } | { ok: true; validas: { numero: number; dados: T }[]; erros: ErroCsv[] };

/** Leitor generico (limites, separador, aspas, cabecalho, erro por linha). Funcao PURA. */
export function lerCsv<T>(texto: string, c: ConfigCsv<T>): LeituraCsvDe<T> {
  const colunas = [...c.obrigatorias, ...c.opcionais];
  const descricao = `${colunas.join(",")}${c.opcionais.length ? ` (${c.opcionais.join(" e ")} ${c.opcionais.length > 1 ? "são opcionais" : "é opcional"})` : ""}`;
  if (tamanhoEmBytes(texto) > MAX_BYTES_CSV) return { ok: false, erro: "Arquivo maior que 1 MB." };
  // ponytail: quebra de linha DENTRO de aspas nao e suportada (nenhuma coluna precisa).
  const brutas = texto.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  const cabecalho = brutas[0] ?? "";
  if (!cabecalho.trim()) return { ok: false, erro: `Arquivo vazio. A primeira linha deve ser o cabeçalho ${colunas.join(",")}.` };
  const separador = cabecalho.includes(";") && !cabecalho.includes(",") ? ";" : ",";
  const nomes = campos(cabecalho, separador).map(normalizarCabecalho);
  const desconhecida = nomes.find((n) => !colunas.includes(n));
  const faltando = c.obrigatorias.find((col) => !nomes.includes(col));
  if (desconhecida !== undefined || faltando || new Set(nomes).size !== nomes.length) {
    return { ok: false, erro: `Cabeçalho inválido. Use exatamente: ${descricao}.` };
  }

  const dados = brutas
    .map((linha, i) => ({ linha, numero: i + 1 }))
    .slice(1)
    .filter((l) => l.linha.trim() !== "");
  if (dados.length === 0) return { ok: false, erro: `O arquivo não tem nenhuma linha de ${c.item}.` };
  if (dados.length > MAX_LINHAS_CSV) return { ok: false, erro: `Arquivo com ${dados.length} linhas. O limite é ${MAX_LINHAS_CSV} por importação.` };

  const validas: { numero: number; dados: T }[] = [];
  const erros: ErroCsv[] = [];
  const vistos = new Set<string>();
  for (const { linha, numero } of dados) {
    const valores = campos(linha, separador);
    if (valores.length > nomes.length) {
      erros.push({ numero, mensagem: `Colunas a mais (esperado ${nomes.length}).` });
      continue;
    }
    const porColuna = Object.fromEntries(colunas.map((col) => [col, nomes.includes(col) ? (valores[nomes.indexOf(col)] ?? "") : ""]));
    const r = c.validar(porColuna, numero);
    if (!r.ok) {
      erros.push({ numero, mensagem: r.mensagem });
      continue;
    }
    const chave = c.chave(r.dados);
    if (vistos.has(chave)) {
      erros.push({ numero, mensagem: c.repetido });
      continue;
    }
    vistos.add(chave);
    validas.push({ numero, dados: r.dados });
  }
  return { ok: true, validas, erros };
}

/** CSV de membros (`nome,email,grupo`). */
export function lerCsvDeMembros(texto: string): LeituraCsv {
  return lerCsv(texto, {
    obrigatorias: ["nome", "email"],
    opcionais: ["grupo"],
    item: "membro",
    validar: (v) => {
      const r = linhaCsvSchema.safeParse({ nome: v.nome, email: v.email, grupo: v.grupo });
      return r.success ? { ok: true, dados: r.data } : { ok: false, mensagem: r.error.issues[0]?.message ?? "Linha inválida." };
    },
    chave: (d) => d.email,
    repetido: "E-mail repetido no arquivo (vale a primeira ocorrência).",
  });
}
