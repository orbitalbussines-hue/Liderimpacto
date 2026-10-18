import "server-only";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { alvoDosCabecalhos, type CriadorDaRequisicao } from "@/lib/criador/area";
import { db } from "@/lib/db";
import { usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { enviarEmail } from "@/lib/email/enviar";
import { emailAvisoSeguranca } from "@/lib/email/mensagens";
import { marcaDaArea } from "@/lib/email/modelo";
import { URL_PLATAFORMA } from "./auth";
import { depoisDaResposta } from "./depois";

/**
 * Criador do host da requisicao; fora de uma requisicao (teste, script) = plataforma.
 * Le os cabecalhos direto (sem `@/lib/criador/atual`): aquele modulo puxa `next/navigation`,
 * que quebra os scripts e workers que importam o auth fora do Next (seed, sessao:demo).
 */
async function criadorDoHostAtual(): Promise<CriadorDaRequisicao | null> {
  try {
    const alvo = await alvoDosCabecalhos(await headers());
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
  const criador = await criadorDoHostAtual();
  const marca = marcaDaArea(criador, URL_PLATAFORMA);
  const quando = new Date();
  await depoisDaResposta(async () => {
    const [u] = await db.select({ nome: usuarios.nome, email: usuarios.email }).from(usuarios).where(and(eq(usuarios.id, usuarioId), vivos(usuarios)));
    if (!u) return;
    await enviarEmail({ para: u.email, tipo: "AVISO_SEGURANCA", criadorId: criador?.id ?? null, ...emailAvisoSeguranca(marca, u.nome, oQueMudou, quando) });
  });
}
