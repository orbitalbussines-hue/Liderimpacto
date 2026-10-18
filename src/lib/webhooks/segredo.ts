import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * Segredo de assinatura do webhook (ADR-0018 item 5). Precisa ser RECUPERÁVEL (o servidor assina
 * cada entrega com ele), então é guardado CIFRADO: AES-256-GCM com chave derivada (HKDF-SHA256) do
 * `BETTER_AUTH_SECRET` com rótulo próprio, e o id do webhook como AAD (copiar a cifra para outro
 * webhook não decifra). Mesmo ciclo de vida da semente do TOTP: sem variável nova para esquecer no
 * deploy. Formato: `v1:<base64url(iv[12] | tag[16] | cifra)>`.
 */

const VERSAO = "v1";

function chave(env: Record<string, string | undefined> = process.env): Buffer {
  const base = env.BETTER_AUTH_SECRET;
  if (!base || base.length < 32) throw new Error("BETTER_AUTH_SECRET ausente ou curto: webhooks precisam dele para cifrar o segredo.");
  return Buffer.from(hkdfSync("sha256", base, "lider-impacto", `webhooks:${VERSAO}`, 32));
}

/** `whsec_` + 32 bytes aleatórios em base64url. Mostrado UMA vez na tela. */
export const gerarSegredoWebhook = () => `whsec_${randomBytes(32).toString("base64url")}`;

export function cifrarSegredo(segredo: string, webhookId: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  c.setAAD(Buffer.from(`webhook:${webhookId}`));
  const cifra = Buffer.concat([c.update(segredo, "utf8"), c.final()]);
  return `${VERSAO}:${Buffer.concat([iv, c.getAuthTag(), cifra]).toString("base64url")}`;
}

/** Decifra e AUTENTICA (lança se adulterado, de outro webhook ou de outra chave). */
export function decifrarSegredo(guardado: string, webhookId: string): string {
  const [versao, corpo] = guardado.split(":");
  if (versao !== VERSAO || !corpo) throw new Error("Formato de segredo desconhecido.");
  const bruto = Buffer.from(corpo, "base64url");
  const d = createDecipheriv("aes-256-gcm", chave(), bruto.subarray(0, 12));
  d.setAAD(Buffer.from(`webhook:${webhookId}`));
  d.setAuthTag(bruto.subarray(12, 28));
  return Buffer.concat([d.update(bruto.subarray(28)), d.final()]).toString("utf8");
}

/** Valor do cabeçalho de assinatura: `t=<unix>,v1=<hex HMAC-SHA256(segredo, "<t>.<corpo>")>`. */
export function assinarCorpo(segredo: string, corpo: string, instante: Date): string {
  const t = Math.floor(instante.getTime() / 1000);
  return `t=${t},v1=${createHmac("sha256", segredo).update(`${t}.${corpo}`).digest("hex")}`;
}
