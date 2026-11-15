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

/**
 * Bling: `X-Bling-Signature-256: sha256=<hex>` = HMAC-SHA256(client_secret, corpo cru em UTF-8)
 * (developer.bling.com.br/webhooks, "Validação do hash"). Hex em qualquer caixa; sem o prefixo, recusa.
 */
export function assinaturaBlingConfere(recebida: string | null, clientSecret: string, corpoCru: string): boolean {
  const r = recebida?.trim() ?? "";
  if (!r.toLowerCase().startsWith("sha256=")) return false;
  const mac = createHmac("sha256", clientSecret).update(corpoCru, "utf8").digest("hex");
  return iguaisEmTempoConstante(r.slice(7).toLowerCase(), mac);
}

/** Página de vendas própria (ADR-0025): mesmo esquema do Bling (`sha256=<hex>` do corpo cru), no cabeçalho `x-assinatura`. */
export const assinaturaPaginaConfere = assinaturaBlingConfere;
