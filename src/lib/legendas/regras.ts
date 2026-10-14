import { ErroDeNegocio } from "@/lib/acao";
import { formatarTempo } from "@/lib/validators/catalogo";

/**
 * Legendas e transcrição (ADR-0013, RN-180) — PURO: o servidor usa para validar, converter e
 * sanitizar o envio; a tela usa para ler o `.vtt` normalizado (aba Transcrição) e para buscar.
 * Parser próprio e pequeno (sem dependência): aceita WebVTT e SRT, devolve trechos de TEXTO PURO.
 * Nenhuma tag sobrevive (`<b>`, `<i>`, `<c>`, `<v>`, `<script>`...): a legenda é exibida como texto.
 */

export const LIMITES_LEGENDA = {
  bytes: 2 * 1024 * 1024,
  trechos: 20_000,
  caracteresPorTrecho: 1_000,
  /** Quanto a legenda pode passar do fim do vídeo (arredondamentos de quem exportou). */
  folgaSeg: 10,
} as const;

/** BCP-47 simples (o mesmo CHECK do banco): `pt-BR`, `en`, `es-419`. */
export const RE_IDIOMA = /^[a-z]{2,3}(-([A-Z]{2}|[0-9]{3}))?$/;

export interface Trecho {
  /** Segundos (com milissegundos). */
  inicio: number;
  fim: number;
  texto: string;
}

const erro = (m: string) => new ErroDeNegocio(m);

/**
 * Bytes -> texto. UTF-8 (com ou sem BOM) primeiro; UTF-16 só com BOM; o que não é UTF-8 válido é
 * lido como Windows-1252 (o "ANSI"/latin1 do Bloco de Notas antigo e de muitos .srt).
 */
export function decodificarLegenda(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // O Node 24 decodifica "windows-1252" como ISO-8859-1 (0x80-0x9F viram controles C1): a
    // faixa é trocada pela tabela do 1252 (no navegador o decodificador já acerta e nada muda).
    return new TextDecoder("windows-1252").decode(bytes).replace(/[\u0080-\u009f]/g, (c) => CP1252[c.charCodeAt(0) - 0x80]);
  }
}

/** 0x80-0x9F do Windows-1252 (os 5 indefinidos ficam como estão e saem na sanitização). */
const CP1252 =
  "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f" +
  "\u0090‘’“”•–—˜™š›œ\u009džŸ";

const TAG = /<[^>\n]*>/g;
const TAG_SSA = /\{\\[^}\n]*\}/g;
const ENTIDADE = /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi;
const NOMEADAS: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", lrm: "", rlm: "" };
// Controles C0/C1 (menos \n e \t), largura zero, bidi e BOM.
const INVISIVEIS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

function entidade(_: string, nome: string): string {
  const n = nome.toLowerCase();
  if (n.startsWith("#")) {
    const codigo = n[1] === "x" ? Number.parseInt(n.slice(2), 16) : Number.parseInt(n.slice(1), 10);
    return codigo > 0 && codigo <= 0x10ffff && (codigo < 0xd800 || codigo > 0xdfff) ? String.fromCodePoint(codigo) : "";
  }
  return NOMEADAS[n] ?? `&${nome};`;
}

/**
 * Texto de um trecho como TEXTO PURO: tira toda tag (VTT/HTML e `{\an8}` do SSA), decodifica as
 * entidades DEPOIS (então `&lt;script&gt;` vira o texto "<script>", nunca uma tag), remove
 * caracteres invisíveis, junta espaços e descarta linhas vazias.
 */
export function sanitizarTexto(bruto: string): string {
  return bruto
    .replace(TAG, "")
    .replace(TAG_SSA, "")
    .replace(ENTIDADE, entidade)
    .replace(INVISIVEIS, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const TEMPO = /^(?:(\d{1,3}):)?([0-5]\d):([0-5]\d)[.,](\d{3})$/;
const SETA = /^\s*(\S+)\s+-->\s+(\S+)(?:\s.*)?$/;

/** "00:01:02,345" (SRT), "00:01:02.345" ou "01:02.345" (VTT) -> segundos. */
function lerTempo(s: string): number | null {
  const m = TEMPO.exec(s);
  if (!m) return null;
  return (Number(m[1] ?? 0) * 3600 * 1000 + Number(m[2]) * 60_000 + Number(m[3]) * 1000 + Number(m[4])) / 1000;
}

/**
 * Lê WebVTT (com cabeçalho `WEBVTT`; NOTE/STYLE/REGION ignorados) ou SRT. Recusa com a linha do
 * problema: bloco sem tempo, tempo inválido, fim antes do início, inícios fora de ordem, trecho
 * longo demais, trechos demais, nenhum texto. Ajustes de posição do VTT são descartados.
 */
export function lerLegenda(entrada: string): Trecho[] {
  const linhas = entrada.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const vazia = (l: string | undefined) => (l ?? "").trim() === "";
  const ehVtt = /^WEBVTT(?:[ \t].*)?$/.test(linhas[0] ?? "");
  let i = 0;
  if (ehVtt) while (i < linhas.length && !vazia(linhas[i])) i++;
  const trechos: Trecho[] = [];
  while (i < linhas.length) {
    if (vazia(linhas[i])) {
      i++;
      continue;
    }
    const primeira = i + 1;
    const bloco: string[] = [];
    while (i < linhas.length && !vazia(linhas[i])) bloco.push(linhas[i++]);
    if (ehVtt && /^(NOTE|STYLE|REGION)(\s|$)/.test(bloco[0])) continue;
    const pos = bloco[0].includes("-->") ? 0 : bloco[1]?.includes("-->") ? 1 : -1;
    if (pos < 0) throw erro(`Linha ${primeira}: trecho sem o tempo (ex.: 00:00:01,000 --> 00:00:03,000).`);
    const linha = primeira + pos;
    const m = SETA.exec(bloco[pos]);
    const inicio = m ? lerTempo(m[1]) : null;
    const fim = m ? lerTempo(m[2]) : null;
    if (inicio === null || fim === null) throw erro(`Linha ${linha}: tempo em formato inválido.`);
    if (fim <= inicio) throw erro(`Linha ${linha}: o fim do trecho vem antes do início.`);
    const anterior = trechos.at(-1);
    if (anterior && inicio < anterior.inicio) throw erro(`Linha ${linha}: os tempos precisam estar em ordem crescente.`);
    const texto = sanitizarTexto(bloco.slice(pos + 1).join("\n"));
    if (!texto) continue;
    if (texto.length > LIMITES_LEGENDA.caracteresPorTrecho) throw erro(`Linha ${linha}: trecho com texto longo demais (máximo de ${LIMITES_LEGENDA.caracteresPorTrecho} caracteres).`);
    if (trechos.length >= LIMITES_LEGENDA.trechos) throw erro(`Legenda com trechos demais (máximo de ${LIMITES_LEGENDA.trechos.toLocaleString("pt-BR")}).`);
    trechos.push({ inicio, fim, texto });
  }
  if (!trechos.length) throw erro("A legenda não tem nenhum trecho com texto.");
  return trechos;
}

const dois = (n: number) => String(n).padStart(2, "0");

/** Segundos -> "00:01:02.345" (WebVTT). */
export function tempoVtt(seg: number): string {
  const ms = Math.round(seg * 1000);
  return `${dois(Math.floor(ms / 3_600_000))}:${dois(Math.floor(ms / 60_000) % 60)}:${dois(Math.floor(ms / 1000) % 60)}.${String(ms % 1000).padStart(3, "0")}`;
}

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** WebVTT normalizado: só tempos e texto escapado (sem identificador, ajuste nem tag). */
export function gerarVtt(trechos: readonly Trecho[]): string {
  return `WEBVTT\n\n${trechos.map((t) => `${tempoVtt(t.inicio)} --> ${tempoVtt(t.fim)}\n${escapar(t.texto)}\n`).join("\n")}`;
}

/** Transcrição sem tempos: um trecho por linha. */
export const textoPuro = (trechos: readonly Trecho[]) => trechos.map((t) => t.texto.replace(/\n/g, " ")).join("\n");

export interface LegendaProcessada {
  vtt: string;
  texto: string;
  trechos: number;
  duracaoSeg: number;
}

/**
 * O envio inteiro: tamanho, codificação, estrutura e tempos (até a duração do vídeo + folga, quando
 * ela é conhecida) -> `.vtt` normalizado + texto puro.
 */
export function processarLegenda(bytes: Uint8Array, duracaoVideoSeg: number | null): LegendaProcessada {
  if (bytes.byteLength === 0) throw erro("Arquivo vazio.");
  if (bytes.byteLength > LIMITES_LEGENDA.bytes) throw erro("Arquivo grande demais. Envie VTT ou SRT até 2 MB.");
  const trechos = lerLegenda(decodificarLegenda(bytes));
  const ultimo = trechos.reduce((max, t) => Math.max(max, t.fim), 0);
  if (duracaoVideoSeg && ultimo > duracaoVideoSeg + LIMITES_LEGENDA.folgaSeg) {
    throw erro(`A legenda vai até ${formatarTempo(ultimo)}, mas o vídeo tem ${formatarTempo(duracaoVideoSeg)}. Confira se é a legenda desta aula.`);
  }
  return { vtt: gerarVtt(trechos), texto: textoPuro(trechos), trechos: trechos.length, duracaoSeg: Math.ceil(ultimo) };
}

// ------------------------------------------------------------------ transcrição na tela

/** Minúsculas e sem acento ("Ação" e "acao" se acham). */
const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Índices dos trechos que contêm o termo (sem diferenciar acento e caixa). Termo vazio = todos. */
export function buscarTrechos(trechos: readonly Trecho[], termo: string): number[] {
  const alvo = normalizar(termo.trim());
  return trechos.flatMap((t, i) => (!alvo || normalizar(t.texto).includes(alvo) ? [i] : []));
}

/** Pedaços do texto com o termo marcado (para `<mark>`, sem HTML montado à mão). */
export function partesComDestaque(texto: string, termo: string): { texto: string; destaque: boolean }[] {
  const alvo = normalizar(termo.trim());
  if (!alvo) return [{ texto, destaque: false }];
  // Mapa: posição no texto normalizado -> posição no original (um acento some, um "İ" vira dois).
  let norm = "";
  const origem: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    for (const c of normalizar(texto[i])) {
      norm += c;
      origem.push(i);
    }
  }
  const partes: { texto: string; destaque: boolean }[] = [];
  let pos = 0;
  for (let k = norm.indexOf(alvo); k !== -1; k = norm.indexOf(alvo, k + alvo.length)) {
    const ini = Math.max(origem[k], pos);
    const fim = origem[k + alvo.length - 1] + 1;
    if (fim <= ini) continue;
    if (ini > pos) partes.push({ texto: texto.slice(pos, ini), destaque: false });
    partes.push({ texto: texto.slice(ini, fim), destaque: true });
    pos = fim;
  }
  if (pos < texto.length) partes.push({ texto: texto.slice(pos), destaque: false });
  return partes;
}

/** Trecho que está tocando: o último que já começou (-1 antes do primeiro). Busca binária. */
export function trechoAtual(trechos: readonly Trecho[], tempo: number): number {
  let [lo, hi, r] = [0, trechos.length - 1, -1];
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (trechos[m].inicio <= tempo) [r, lo] = [m, m + 1];
    else hi = m - 1;
  }
  return r;
}
