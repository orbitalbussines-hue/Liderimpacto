import "server-only";
import Stripe from "stripe";

/**
 * Cliente do Stripe (ADR-0019): interface PEQUENA para os serviços não dependerem do SDK — os testes
 * usam o `StripeFalso` e NUNCA saem para a rede. A chave (`STRIPE_SECRET_KEY`) só existe no servidor:
 * nunca vai ao cliente, a log ou à trilha. Sem chave = `null` (as telas mostram "Pagamentos não
 * configurados"; o app segue normal). Toda chamada de conta conectada leva `stripeAccount`
 * (cabeçalho `Stripe-Account`): é o DIRECT CHARGE.
 */

export interface StatusContaStripe {
  cobrancasAtivas: boolean;
  repassesAtivos: boolean;
  dadosEnviados: boolean;
}

export interface GatewayStripe {
  /** Conta conectada no modelo "Standard" (Dashboard completo, o criador paga as taxas do Stripe). */
  criarConta(p: { email: string; criadorId: string }, idempotencia: string): Promise<{ contaId: string }>;
  linkDeOnboarding(contaId: string, urls: { retorno: string; renovar: string }): Promise<string>;
  statusDaConta(contaId: string): Promise<StatusContaStripe>;
  criarCheckout(contaId: string, params: Stripe.Checkout.SessionCreateParams, idempotencia: string): Promise<{ id: string; url: string }>;
  /** Reembolso TOTAL da cobrança, devolvendo a taxa da plataforma na mesma proporção. */
  reembolsar(contaId: string, paymentIntentId: string, idempotencia: string): Promise<{ id: string; valorCentavos: number }>;
  cancelarAssinatura(contaId: string, stripeAssinaturaId: string): Promise<void>;
  /** PaymentIntent que pagou a fatura (renovação de assinatura), se houver. */
  pagamentoDaFatura(contaId: string, faturaId: string): Promise<string | null>;
  /** Relê o evento NA conta (o worker não confia em payload guardado; nada de PII no banco). */
  obterEvento(contaId: string, eventoId: string): Promise<Stripe.Event>;
}

export const MSG_PAGAMENTOS_DESLIGADOS = "Pagamentos não configurados nesta plataforma.";

export const stripeConfigurado = (): boolean => !!process.env.STRIPE_SECRET_KEY;

const idDe = (x: string | { id: string } | null | undefined): string | null => (x == null ? null : typeof x === "string" ? x : x.id);

class GatewayReal implements GatewayStripe {
  // Versão da API fixada pela própria lib (2026-09-30.endive no stripe@23.0.0). 2 novas tentativas em erro de rede/5xx.
  private readonly api = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { maxNetworkRetries: 2, timeout: 20_000 });

  async criarConta(p: { email: string; criadorId: string }, idempotencia: string) {
    const conta = await this.api.accounts.create(
      {
        country: "BR",
        email: p.email,
        // = antigo "Standard" (docs.stripe.com/connect/migrate-to-controller-properties).
        controller: { stripe_dashboard: { type: "full" }, fees: { payer: "account" }, losses: { payments: "stripe" }, requirement_collection: "stripe" },
        metadata: { criador_id: p.criadorId },
      },
      { idempotencyKey: idempotencia },
    );
    return { contaId: conta.id };
  }

  async linkDeOnboarding(contaId: string, urls: { retorno: string; renovar: string }) {
    const link = await this.api.accountLinks.create({ account: contaId, type: "account_onboarding", return_url: urls.retorno, refresh_url: urls.renovar });
    return link.url;
  }

  async statusDaConta(contaId: string) {
    const c = await this.api.accounts.retrieve(contaId);
    return { cobrancasAtivas: !!c.charges_enabled, repassesAtivos: !!c.payouts_enabled, dadosEnviados: !!c.details_submitted };
  }

  async criarCheckout(contaId: string, params: Stripe.Checkout.SessionCreateParams, idempotencia: string) {
    const s = await this.api.checkout.sessions.create(params, { stripeAccount: contaId, idempotencyKey: idempotencia });
    if (!s.url) throw new Error("Checkout sem URL.");
    return { id: s.id, url: s.url };
  }

  async reembolsar(contaId: string, paymentIntentId: string, idempotencia: string) {
    const r = await this.api.refunds.create({ payment_intent: paymentIntentId, refund_application_fee: true }, { stripeAccount: contaId, idempotencyKey: idempotencia });
    return { id: r.id, valorCentavos: r.amount };
  }

  async cancelarAssinatura(contaId: string, stripeAssinaturaId: string) {
    await this.api.subscriptions.cancel(stripeAssinaturaId, {}, { stripeAccount: contaId });
  }

  async pagamentoDaFatura(contaId: string, faturaId: string) {
    const pagamentos = await this.api.invoicePayments.list({ invoice: faturaId, limit: 10 }, { stripeAccount: contaId });
    const pago = pagamentos.data.find((p) => p.status === "paid") ?? pagamentos.data[0];
    return idDe(pago?.payment.payment_intent);
  }

  async obterEvento(contaId: string, eventoId: string) {
    return this.api.events.retrieve(eventoId, {}, { stripeAccount: contaId });
  }
}

let padrao: GatewayStripe | null = null;
let substituto: GatewayStripe | null | undefined;

/** Gateway do processo (um só), ou `null` sem chave. */
export function gatewayStripe(): GatewayStripe | null {
  if (substituto !== undefined) return substituto;
  if (!stripeConfigurado()) return null;
  padrao ??= new GatewayReal();
  return padrao;
}

/** SÓ TESTES: troca o gateway das actions/rotas (`undefined` volta ao real). */
export function usarGatewayStripe(g: GatewayStripe | null | undefined): void {
  substituto = g;
}

/**
 * Verifica a assinatura `Stripe-Signature` sobre o corpo CRU (HMAC-SHA256 com o segredo do endpoint,
 * tolerância de 5 min) e devolve o evento. Lança se não confere. Não precisa da chave da API.
 */
export function verificarEvento(corpo: string, assinatura: string, segredo: string): Stripe.Event {
  return Stripe.webhooks.constructEvent(corpo, assinatura, segredo);
}
