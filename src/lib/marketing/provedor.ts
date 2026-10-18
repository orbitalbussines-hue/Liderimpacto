import "server-only";
import { and, asc, gt, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { emails_disparos as ed } from "@/lib/db/schema";
import { emailConfigurado, enviarEmail, type Email } from "@/lib/email/enviar";
import { esperaDoTeto, limitesDeEnvio } from "./regras";

/**
 * PROVEDOR de envio dos e-mails da fila `emails` (ADR-0020). Interface pequena de propósito: hoje é o
 * SMTP da Hostinger (`enviarEmail`, que registra o disparo); trocar por Brevo/SES/Resend = outra
 * implementação desta interface + `usarProvedorEmail` na subida do worker, sem mexer em tela nem em
 * campanha. Os testes usam o `ProvedorFalso` (nunca sai e-mail de verdade).
 */
export interface ProvedorEmail {
  configurado(): boolean;
  /** `true` = aceito pelo provedor; `false` = sem configuração (nada saiu). Falha de envio LANÇA. */
  enviar(e: Email): Promise<boolean>;
}

export const provedorSmtp: ProvedorEmail = { configurado: emailConfigurado, enviar: enviarEmail };

let atual: ProvedorEmail = provedorSmtp;
export const provedorEmail = () => atual;
/** Só testes (e a futura troca de provedor no worker). */
export function usarProvedorEmail(p: ProvedorEmail): void {
  atual = p;
}

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

/**
 * Quando a janela (`ms` para trás) volta a ter vaga: o (n - limite + 1)-ésimo mais antigo + janela.
 * Conta TODO e-mail que saiu (ou tentou) pela caixa: transacional também gasta a cota do SMTP.
 */
async function liberaEm(agora: Date, janelaMs: number, limite: number): Promise<Date | null> {
  const desde = new Date(agora.getTime() - janelaMs);
  // `emails_disparos` é append-only: sem is_deleted (nada se exclui), por isso sem vivos().
  const onde = and(gt(ed.created_at, desde), lte(ed.created_at, agora), ne(ed.situacao, "NAO_CONFIGURADO"));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(ed).where(onde);
  if (n < limite) return null;
  const [l] = await db.select({ quando: ed.created_at }).from(ed).where(onde).orderBy(asc(ed.created_at)).offset(n - limite).limit(1);
  return l ? new Date(l.quando.getTime() + janelaMs) : null;
}

/**
 * Milissegundos até caber o próximo envio (0 = pode enviar agora). Janela DESLIZANTE de 1 h e de 24 h
 * sobre `emails_disparos` (o registro de todo envio). O que passa do teto ESPERA (nunca é descartado).
 * ponytail: um worker com concorrência 1 lê e envia em sequência; com réplicas do worker, trocar por
 * contador atômico (Redis) para não estourar por corrida.
 */
export async function esperaParaEnviar(agora = new Date(), limites = limitesDeEnvio()): Promise<number> {
  const [hora, dia] = await Promise.all([liberaEm(agora, HORA_MS, limites.hora), liberaEm(agora, DIA_MS, limites.dia)]);
  return esperaDoTeto(agora, hora, dia);
}
