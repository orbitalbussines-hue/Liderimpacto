import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { criadores_stripe_contas as contas, stripe_eventos } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { enfileirarEventoStripe, type JobPagamento } from "./fila";
import { verificarEvento } from "./stripe";

/**
 * Recepção do webhook CONNECT do Stripe (ADR-0019 item 5): confere a assinatura sobre o corpo CRU,
 * grava o recibo (append-only, idempotente pelo id do evento), resolve o criador pela CONTA CONECTADA
 * (`event.account`) e enfileira — responde rápido; o trabalho é do worker. Fila fora do ar = 500 (o
 * Stripe reenvia e o reenvio, já com recibo, só enfileira de novo).
 */

/** Eventos que o worker trata (o endpoint no Dashboard deve assinar exatamente estes). */
export const EVENTOS_TRATADOS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "invoice.paid",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "account.updated",
] as const;
const TRATADOS = new Set<string>(EVENTOS_TRATADOS);

export interface RespostaWebhook {
  status: number;
  corpo: { recebido: boolean; erro?: string };
}

export async function receberEventoStripe(
  corpo: string,
  assinatura: string | null,
  enfileirar: (job: JobPagamento) => Promise<void> = enfileirarEventoStripe,
  segredo: string | undefined = process.env.STRIPE_WEBHOOK_SECRET,
): Promise<RespostaWebhook> {
  if (!segredo) return { status: 503, corpo: { recebido: false, erro: "Webhook do Stripe não configurado." } };
  if (!assinatura) return { status: 400, corpo: { recebido: false, erro: "Assinatura ausente." } };
  let evento;
  try {
    evento = verificarEvento(corpo, assinatura, segredo);
  } catch {
    return { status: 400, corpo: { recebido: false, erro: "Assinatura inválida." } };
  }

  const contaId = evento.account ?? null;
  const [conta] = contaId ? await db.select({ criadorId: contas.criador_id }).from(contas).where(and(eq(contas.conta_id, contaId), vivos(contas))) : [];
  const objeto = evento.data.object as { id?: unknown };
  await db
    .insert(stripe_eventos)
    .values({
      evento_id: evento.id,
      tipo: evento.type.slice(0, 100),
      conta_id: contaId,
      criador_id: conta?.criadorId ?? null,
      objeto_id: typeof objeto.id === "string" ? objeto.id.slice(0, 255) : null,
      livemode: evento.livemode,
      ocorrido_em: new Date(evento.created * 1000),
    })
    .onConflictDoNothing({ target: stripe_eventos.evento_id });

  // Conta desconhecida ou evento que não tratamos: recibo gravado, nada a fazer.
  if (!conta || !contaId || !TRATADOS.has(evento.type)) return { status: 200, corpo: { recebido: true } };
  try {
    await enfileirar({ eventoId: evento.id, contaId });
  } catch (e) {
    console.error("CRITICAL [stripe] evento não enfileirado (o Stripe reenvia):", evento.id, e instanceof Error ? e.message : e);
    return { status: 500, corpo: { recebido: false, erro: "Fila indisponível." } };
  }
  return { status: 200, corpo: { recebido: true } };
}
