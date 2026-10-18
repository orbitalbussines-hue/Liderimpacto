"use server";

import { alvoAtual } from "@/lib/criador/atual";
import { descadastrar } from "@/lib/marketing/descadastro";
import { lerTokenDescadastro } from "@/lib/marketing/tokens";

export type EstadoDescadastro = { ok: true } | { ok: false; erro: string } | null;

/**
 * Botão "Confirmar" da página pública (RN-227, sem login). O criador vem do HOST e o token tem de ser
 * dele (o mesmo HMAC das rotas da API); idempotente. O one-click do cliente de e-mail (RFC 8058)
 * continua no POST de `/api/email/descadastro`. Nada de token em log.
 */
export async function confirmarDescadastro(_: EstadoDescadastro, dados: FormData): Promise<EstadoDescadastro> {
  const invalido = { ok: false as const, erro: "Este link não é válido. Use o link do e-mail mais recente." };
  const alvo = await alvoAtual();
  const token = dados.get("t");
  if (alvo?.tipo !== "criador" || typeof token !== "string") return invalido;
  const hash = lerTokenDescadastro(alvo.criador.id, token);
  if (!hash) return invalido;
  try {
    await descadastrar(alvo.criador.id, hash, "LINK");
    return { ok: true };
  } catch {
    return { ok: false, erro: "Não foi possível concluir agora. Tente de novo em alguns minutos." };
  }
}
