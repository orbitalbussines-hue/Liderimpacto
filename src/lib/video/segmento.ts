/**
 * Conferência PURA da cifra dos segmentos: o worker só aceita a saída se o segmento NÃO é
 * MPEG-TS legível em claro e, decifrado com a chave do vídeo, volta a ser MPEG-TS.
 */
import { createDecipheriv } from "node:crypto";

const TAMANHO_PACOTE_TS = 188;
const BYTE_SINCRONIA = 0x47;

/** MPEG-TS = byte 0x47 no início de cada pacote de 188 bytes (confere até 20 pacotes). */
export function pareceMpegTs(dados: Buffer): boolean {
  const pacotes = Math.min(20, Math.floor(dados.length / TAMANHO_PACOTE_TS));
  if (pacotes < 2) return false;
  for (let i = 0; i < pacotes; i++) if (dados[i * TAMANHO_PACOTE_TS] !== BYTE_SINCRONIA) return false;
  return true;
}

/** IV do `#EXT-X-KEY` (`IV=0x...`); sem IV, o HLS manda usar o número de sequência. */
export function ivDaPlaylist(m3u8: string, sequencia = 0): Buffer {
  const hex = /#EXT-X-KEY:[^\n]*IV=0x([0-9a-fA-F]{32})/.exec(m3u8)?.[1];
  if (hex) return Buffer.from(hex, "hex");
  const iv = Buffer.alloc(16);
  iv.writeBigUInt64BE(BigInt(sequencia), 8);
  return iv;
}

export function decifrarSegmento(dados: Buffer, chave: Buffer, iv: Buffer): Buffer {
  const decifrador = createDecipheriv("aes-128-cbc", chave, iv);
  return Buffer.concat([decifrador.update(dados), decifrador.final()]);
}
