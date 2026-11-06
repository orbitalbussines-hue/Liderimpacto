import "server-only";
import { createHmac, hkdfSync } from "node:crypto";
import { soDigitos } from "./regras";

/**
 * HMAC do CPF do comprador (ADR-0024 item 4, RN-262). O CPF NUNCA é gravado em claro: guardamos
 * HMAC-SHA256 de `<criador>:<11 dígitos>` com chave HKDF do `BETTER_AUTH_SECRET` (rótulo próprio, como
 * `webhooks/segredo.ts`). O criador entra na mensagem: o mesmo CPF dá códigos diferentes em áreas
 * diferentes (nada se cruza entre criadores). Sem a chave do servidor, o código não volta ao CPF.
 */

function chave(): Buffer {
  const base = process.env.BETTER_AUTH_SECRET;
  if (!base || base.length < 32) throw new Error("BETTER_AUTH_SECRET ausente ou curto: o resgate por pedido precisa dele.");
  return Buffer.from(hkdfSync("sha256", base, "lider-impacto", "cpf-pedidos:v1", 32));
}

/** Hex de 64. Recebe o CPF com ou sem pontuação; quem chama já validou o dígito verificador. */
export const hmacDoCpf = (criadorId: string, cpf: string) => createHmac("sha256", chave()).update(`${criadorId}:${soDigitos(cpf)}`, "utf8").digest("hex");
