import "server-only";
import { and, eq } from "drizzle-orm";
import type { CriadorDaRequisicao } from "@/lib/criador/area";
import { alvoAtual } from "@/lib/criador/atual";
import { db } from "@/lib/db";
import { usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { enviarEmail } from "@/lib/email/enviar";
import { emailAvisoSeguranca } from "@/lib/email/mensagens";
import { marcaDaArea } from "@/lib/email/modelo";
import { URL_PLATAFORMA } from "./auth";
import { depoisDaResposta } from "./depois";

/** Criador do host da requisicao; fora de uma requisicao (teste, script) = plataforma. */
async function criadorDoHostAtual(): Promise<CriadorDaRequisicao | null> {
  try {
    const alvo = await alvoAtual();
    return alvo?.tipo === "criador" ? alvo.criador : null;
  } catch {
    return null;
  }
}

/**
 * AVISO AO DONO DA CONTA por canal independente da tela: mudanca de senha ou de segundo
 * fator manda um e-mail para a conta afetada (sequestro silencioso vira sequestro percebido).
 * Marca = a da area onde a mudanca aconteceu (lida ANTES, com a requisicao viva).
 * Roda DEPOIS da resposta. Sem SMTP configurado, nada sai (o evento ja esta na trilha).
 */
export async function avisarDono(usuarioId: string, oQueMudou: string): Promise<void> {
  const marca = marcaDaArea(await criadorDoHostAtual(), URL_PLATAFORMA);
  const quando = new Date();
  await depoisDaResposta(async () => {
    const [u] = await db.select({ nome: usuarios.nome, email: usuarios.email }).from(usuarios).where(and(eq(usuarios.id, usuarioId), vivos(usuarios)));
    if (!u) return;
    await enviarEmail({ para: u.email, ...emailAvisoSeguranca(marca, u.nome, oQueMudou, quando) });
  });
}
