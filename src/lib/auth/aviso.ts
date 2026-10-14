import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { enviarEmail } from "@/lib/email/enviar";
import { depoisDaResposta } from "./depois";

/**
 * AVISO AO DONO DA CONTA por canal independente da tela: mudanca de senha ou de segundo
 * fator manda um e-mail para a conta afetada (sequestro silencioso vira sequestro percebido).
 * Roda DEPOIS da resposta. Sem SMTP configurado, nada sai (o evento ja esta na trilha).
 */
export async function avisarDono(usuarioId: string, oQueMudou: string): Promise<void> {
  await depoisDaResposta(async () => {
    const [u] = await db.select({ nome: usuarios.nome, email: usuarios.email }).from(usuarios).where(and(eq(usuarios.id, usuarioId), vivos(usuarios)));
    if (!u) return;
    await enviarEmail({
      para: u.email,
      assunto: "Líder de Impacto · mudança na segurança da sua conta",
      texto: `Olá, ${u.nome}.\n\n${oQueMudou} em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.\n\nSe não foi você, avise a equipe agora e troque sua senha.`,
    });
  });
}
