/**
 * Reconferência dos vídeos contra o storage (incidente 23/10, `scripts/video-reconferir.ts`).
 * Parte PURA: quais chaves do HLS conferir e a classificação a partir dos HEADs. Sem I/O.
 */
import type { SituacaoVideo } from "@/lib/db/schema/_enums";
import { NOME_MASTER } from "./ffmpeg";

export type Classe = "OK" | "REPROCESSAR" | "SEM_ORIGINAL";

/** Master + playlist e 1º segmento de cada resolução gravada (layout do worker, ffmpeg.ts). */
export function chavesDoHls(prefixoHls: string, resolucoes: readonly string[]): string[] {
  return [`${prefixoHls}/${NOME_MASTER}`, ...resolucoes.flatMap((r) => [`${prefixoHls}/${r}/index.m3u8`, `${prefixoHls}/${r}/seg_00000.ts`])];
}

export interface Conferencia {
  /** ENVIANDO fica fora: o original ainda é um multipart aberto. */
  situacao: Exclude<SituacaoVideo, "ENVIANDO">;
  /** HEAD do original (`chave_origem` no bucket videosOriginais) achou o objeto. */
  original: boolean;
  /** HEAD de cada chave de `chavesDoHls` (só PRONTO). Vazio = sem prefixo ou sem resolução gravada. */
  hls: readonly boolean[];
  /** Job do vídeo existe na fila (aguardando ou rodando). */
  naFila: boolean;
}

export function classificar(c: Conferencia): { classe: Classe; motivo: string } {
  // master + (index + seg_00000) de ao menos uma resolução = 3 chaves no mínimo.
  const hlsCompleto = c.hls.length >= 3 && c.hls.every(Boolean);
  if (c.situacao === "PRONTO" && hlsCompleto) return { classe: "OK", motivo: c.original ? "" : "HLS ok, mas o original sumiu (trocar o vídeo exige reenvio)" };
  if (!c.original) return { classe: "SEM_ORIGINAL", motivo: c.situacao === "PRONTO" ? "HLS incompleto e original ausente: reenviar" : "original ausente: reenviar" };
  if (c.situacao === "PRONTO") return { classe: "REPROCESSAR", motivo: "HLS ausente ou incompleto" };
  if (c.situacao === "FALHOU") return { classe: "REPROCESSAR", motivo: "falhou, original no storage" };
  if (c.naFila) return { classe: "OK", motivo: "na fila" };
  return { classe: "REPROCESSAR", motivo: "processando sem job na fila (preso)" };
}
