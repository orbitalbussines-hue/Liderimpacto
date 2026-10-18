import { receberEventoStripe } from "@/lib/pagamentos/webhook";

/**
 * Webhook CONNECT do Stripe (ADR-0019 item 5). Público no apex (`/api/*` passa no proxy); a única
 * credencial é a assinatura `Stripe-Signature`, conferida sobre o corpo CRU com `STRIPE_WEBHOOK_SECRET`.
 * Responde rápido: grava o recibo e enfileira (worker `worker:certificados`). Contrato: docs/back.md.
 */
export async function POST(req: Request) {
  const r = await receberEventoStripe(await req.text(), req.headers.get("stripe-signature"));
  return Response.json(r.corpo, { status: r.status });
}
