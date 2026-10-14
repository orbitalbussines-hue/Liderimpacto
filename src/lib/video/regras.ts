import { ErroDeNegocio } from "@/lib/acao";
import { extensaoDe, formatarTamanho } from "@/lib/armazenamento/regras";

/**
 * Regras PURAS do envio de vídeo (tela e servidor usam as mesmas). O vídeo não passa pela
 * allowlist de `arquivos`: tem pipeline próprio (ADR-0005) e vai para o bucket de originais.
 */

const MB = 1024 * 1024;
export const TAMANHO_MAXIMO_VIDEO = 10 * 1024 * MB;
/** 16 MB por parte: 10 GB = 640 partes (limite do S3: 10.000); parte que falha reenvia pouco. */
export const TAMANHO_PARTE_VIDEO = 16 * MB;
export const DESCRICAO_VIDEO = "MP4, MOV, MKV ou WebM até 10 GB";

export const TIPOS_VIDEO = [
  { mime: "video/mp4", extensoes: ["mp4", "m4v"] },
  { mime: "video/quicktime", extensoes: ["mov"] },
  { mime: "video/x-matroska", extensoes: ["mkv"] },
  { mime: "video/webm", extensoes: ["webm"] },
] as const;

export const ACCEPT_VIDEO = TIPOS_VIDEO.flatMap((t) => [t.mime, ...t.extensoes.map((e) => `.${e}`)]).join(",");

/** MIME pela extensão (o navegador às vezes manda `type` vazio, comum em .mkv). */
export function mimeDoVideo(nome: string): string | null {
  const ext = extensaoDe(nome);
  return TIPOS_VIDEO.find((t) => (t.extensoes as readonly string[]).includes(ext))?.mime ?? null;
}

/** Confere tipo (MIME + extensão juntos) e tamanho. Fora da regra lança `ErroDeNegocio`. */
export function validarEnvioVideo(a: { nome: string; mime: string; tamanho: number }): { mime: string; extensao: string } {
  const extensao = extensaoDe(a.nome);
  const tipo = TIPOS_VIDEO.find((t) => t.mime === a.mime.toLowerCase() && (t.extensoes as readonly string[]).includes(extensao));
  if (!tipo) throw new ErroDeNegocio(`Tipo de vídeo não aceito. Envie ${DESCRICAO_VIDEO}.`);
  if (!Number.isInteger(a.tamanho) || a.tamanho <= 0) throw new ErroDeNegocio("Arquivo vazio.");
  if (a.tamanho > TAMANHO_MAXIMO_VIDEO) throw new ErroDeNegocio(`Vídeo grande demais (${formatarTamanho(a.tamanho)}). Envie ${DESCRICAO_VIDEO}.`);
  return { mime: tipo.mime, extensao };
}

export const totalDePartes = (tamanho: number) => Math.max(1, Math.ceil(tamanho / TAMANHO_PARTE_VIDEO));

/** Fatia [inicio, fim) da parte `numero` (1..n). */
export function faixaDaParte(numero: number, tamanho: number): { inicio: number; fim: number } {
  const inicio = (numero - 1) * TAMANHO_PARTE_VIDEO;
  return { inicio, fim: Math.min(tamanho, inicio + TAMANHO_PARTE_VIDEO) };
}

/** Caminho pedido dentro da pasta HLS: master, playlist de degrau ou segmento. Nada mais. */
const RE_CAMINHO_HLS = /^(master\.m3u8|\d{3,4}p\/index\.m3u8|\d{3,4}p\/seg_\d{5}\.ts)$/;

export type CaminhoHls = { tipo: "playlist" | "segmento"; relativo: string };

export function lerCaminhoHls(partes: readonly string[]): CaminhoHls | null {
  const relativo = partes.join("/");
  if (!RE_CAMINHO_HLS.test(relativo)) return null;
  return { tipo: relativo.endsWith(".ts") ? "segmento" : "playlist", relativo };
}

/** Rótulos da situação para a tela. */
export const ROTULO_SITUACAO_VIDEO = {
  ENVIANDO: "Enviando",
  PROCESSANDO: "Processando",
  PRONTO: "Pronto",
  FALHOU: "Falhou",
} as const;
