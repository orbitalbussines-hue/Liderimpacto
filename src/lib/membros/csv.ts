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
const COLUNAS_OBRIGATORIAS = ["nome", "email"] as const;
const COLUNAS_ACEITAS = ["nome", "email", "grupo"];

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
    .replace(/^e-mail$/, "email")
    .trim();

export function lerCsvDeMembros(texto: string): LeituraCsv {
  if (tamanhoEmBytes(texto) > MAX_BYTES_CSV) return { ok: false, erro: "Arquivo maior que 1 MB." };
  // ponytail: quebra de linha DENTRO de aspas nao e suportada (nome/e-mail/grupo nao precisam).
  const brutas = texto.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  const cabecalho = brutas[0] ?? "";
  if (!cabecalho.trim()) return { ok: false, erro: "Arquivo vazio. A primeira linha deve ser o cabeçalho nome,email,grupo." };
  const separador = cabecalho.includes(";") && !cabecalho.includes(",") ? ";" : ",";
  const nomes = campos(cabecalho, separador).map(normalizarCabecalho);
  const desconhecida = nomes.find((n) => !COLUNAS_ACEITAS.includes(n));
  const faltando = COLUNAS_OBRIGATORIAS.find((c) => !nomes.includes(c));
  if (desconhecida !== undefined || faltando || new Set(nomes).size !== nomes.length) {
    return { ok: false, erro: "Cabeçalho inválido. Use exatamente: nome,email,grupo (a coluna grupo é opcional)." };
  }
  const posicao = (c: string) => nomes.indexOf(c);

  const dados = brutas
    .map((linha, i) => ({ linha, numero: i + 1 }))
    .slice(1)
    .filter((l) => l.linha.trim() !== "");
  if (dados.length === 0) return { ok: false, erro: "O arquivo não tem nenhuma linha de membro." };
  if (dados.length > MAX_LINHAS_CSV) return { ok: false, erro: `Arquivo com ${dados.length} linhas. O limite é ${MAX_LINHAS_CSV} por importação.` };

  const validas: LinhaValidaCsv[] = [];
  const erros: ErroCsv[] = [];
  const vistos = new Set<string>();
  for (const { linha, numero } of dados) {
    const valores = campos(linha, separador);
    if (valores.length > nomes.length) {
      erros.push({ numero, mensagem: `Colunas a mais (esperado ${nomes.length}).` });
      continue;
    }
    const r = linhaCsvSchema.safeParse({
      nome: valores[posicao("nome")] ?? "",
      email: valores[posicao("email")] ?? "",
      grupo: posicao("grupo") >= 0 ? (valores[posicao("grupo")] ?? "") : "",
    });
    if (!r.success) {
      erros.push({ numero, mensagem: r.error.issues[0]?.message ?? "Linha inválida." });
      continue;
    }
    if (vistos.has(r.data.email)) {
      erros.push({ numero, mensagem: "E-mail repetido no arquivo (vale a primeira ocorrência)." });
      continue;
    }
    vistos.add(r.data.email);
    validas.push({ numero, dados: r.data });
  }
  return { ok: true, validas, erros };
}
