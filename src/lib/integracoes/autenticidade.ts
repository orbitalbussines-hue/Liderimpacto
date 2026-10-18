import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Autenticidade do webhook da Hotmart e da Eduzz (ADR-0021 item 3): toda comparação em tempo
 * constante (SHA-256 dos dois lados + `timingSafeEqual`, que exige o mesmo tamanho).
 */

/** Igualdade em tempo constante de dois textos de qualquer tamanho (compara os SHA-256). */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** Hotmart: o cabeçalho `X-HOTMART-HOTTOK` é o próprio token da conta. */
export const hottokConfere = (recebido: string | null, hottok: string) => !!recebido && iguaisEmTempoConstante(recebido.trim(), hottok);

/**
 * Eduzz: `x-signature` = HMAC-SHA256(chave, corpo). A doc não diz a codificação: aceitamos hex
 * (minúsculo ou maiúsculo) e base64 — as duas sobre o CORPO CRU (ADR-0021, dúvida registrada).
 */
export function assinaturaEduzzConfere(recebida: string | null, chave: string, corpoCru: string): boolean {
  if (!recebida) return false;
  const mac = createHmac("sha256", chave).update(corpoCru, "utf8").digest();
  const r = recebida.trim();
  const hex = iguaisEmTempoConstante(r.toLowerCase(), mac.toString("hex"));
  const b64 = iguaisEmTempoConstante(r, mac.toString("base64"));
  return hex || b64;
}
