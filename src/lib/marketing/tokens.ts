import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { hashDoDestinatario } from "@/lib/email/disparos";

/**
 * Assinaturas dos links dos e-mails de marketing (ADR-0020): abertura (pixel), clique (redirect) e
 * descadastro. HMAC-SHA256 com chave derivada (HKDF) do BETTER_AUTH_SECRET, uma chave por USO (um
 * token de clique não serve de descadastro). Comparação em tempo constante. Nenhum dado pessoal no
 * link: o descadastro leva o HMAC do endereço (o mesmo de `emails_disparos`), nunca o e-mail.
 */

type Uso = "abertura" | "clique" | "descadastro";

function chave(uso: Uso): Buffer {
  const base = process.env.BETTER_AUTH_SECRET;
  if (!base || base.length < 32) throw new Error("BETTER_AUTH_SECRET ausente ou curto.");
  return Buffer.from(hkdfSync("sha256", base, "lider-impacto", `marketing:${uso}:v1`, 32));
}

const assinar = (uso: Uso, ...partes: string[]) => createHmac("sha256", chave(uso)).update(partes.join("\n")).digest("base64url");

function confere(uso: Uso, assinatura: string, ...partes: string[]): boolean {
  const esperada = Buffer.from(assinar(uso, ...partes));
  const recebida = Buffer.from(assinatura);
  return recebida.length === esperada.length && timingSafeEqual(recebida, esperada);
}

export const assinaturaAbertura = (envioId: string) => assinar("abertura", envioId);
export const aberturaValida = (envioId: string, assinatura: string) => confere("abertura", assinatura, envioId);

/** O clique assina (envio, URL): só uma URL que NÓS pusemos no e-mail volta pelo redirect. */
export const assinaturaClique = (envioId: string, url: string) => assinar("clique", envioId, url);
export const cliqueValido = (envioId: string, url: string, assinatura: string) => confere("clique", assinatura, envioId, url);

const RE_TOKEN = /^([0-9a-f]{64})\.([A-Za-z0-9_-]{43})$/;

/** `<hmac do e-mail>.<assinatura(criador, hmac)>`: amarrado à área, sem validade (descadastro vale sempre). */
export function tokenDescadastro(criadorId: string, email: string): string {
  const hash = hashDoDestinatario(email);
  return `${hash}.${assinar("descadastro", criadorId, hash)}`;
}

/** O HMAC do e-mail se o token é desta área e não foi adulterado; senão `null`. */
export function lerTokenDescadastro(criadorId: string, token: string | null | undefined): string | null {
  const m = RE_TOKEN.exec(token ?? "");
  if (!m) return null;
  return confere("descadastro", m[2], criadorId, m[1]) ? m[1] : null;
}
