import type Stripe from "stripe";
import type { GatewayStripe, StatusContaStripe } from "./stripe";

/**
 * Stripe FALSO — só testes (nunca chama a API). Guarda cada chamada para o teste conferir o que iria
 * ao Stripe (parâmetros, `stripeAccount`, chave de idempotência). Eventos são "publicados" pelo teste
 * com `publicarEvento` e relidos pelo worker com `obterEvento`, como na API real.
 */
export class StripeFalso implements GatewayStripe {
  contas = new Map<string, StatusContaStripe>();
  eventos = new Map<string, Stripe.Event>();
  checkouts: { contaId: string; params: Stripe.Checkout.SessionCreateParams; idempotencia: string; id: string }[] = [];
  reembolsos: { contaId: string; paymentIntentId: string; idempotencia: string }[] = [];
  cancelamentos: { contaId: string; stripeAssinaturaId: string }[] = [];
  pagamentosDeFatura = new Map<string, string>();
  private seq = 0;

  private id(prefixo: string) {
    return `${prefixo}_falso${Date.now().toString(36)}${(this.seq++).toString(36)}`;
  }

  async criarConta(_p: { email: string; criadorId: string }, idempotencia: string) {
    const contaId = `acct_${idempotencia.replace(/[^A-Za-z0-9]/g, "").slice(-24)}`;
    if (!this.contas.has(contaId)) this.contas.set(contaId, { cobrancasAtivas: false, repassesAtivos: false, dadosEnviados: false });
    return { contaId };
  }

  async linkDeOnboarding(contaId: string, urls: { retorno: string; renovar: string }) {
    return `https://connect.stripe.com/setup/falso/${contaId}?retorno=${encodeURIComponent(urls.retorno)}`;
  }

  async statusDaConta(contaId: string) {
    const s = this.contas.get(contaId);
    if (!s) throw new Error("conta inexistente (falso)");
    return s;
  }

  async criarCheckout(contaId: string, params: Stripe.Checkout.SessionCreateParams, idempotencia: string) {
    const existente = this.checkouts.find((c) => c.idempotencia === idempotencia);
    if (existente) return { id: existente.id, url: `https://checkout.stripe.com/c/pay/${existente.id}` };
    const id = this.id("cs_test");
    this.checkouts.push({ contaId, params, idempotencia, id });
    return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
  }

  async reembolsar(contaId: string, paymentIntentId: string, idempotencia: string) {
    this.reembolsos.push({ contaId, paymentIntentId, idempotencia });
    return { id: this.id("re"), valorCentavos: 0 };
  }

  async cancelarAssinatura(contaId: string, stripeAssinaturaId: string) {
    this.cancelamentos.push({ contaId, stripeAssinaturaId });
  }

  async pagamentoDaFatura(_contaId: string, faturaId: string) {
    return this.pagamentosDeFatura.get(faturaId) ?? null;
  }

  async obterEvento(contaId: string, eventoId: string) {
    const e = this.eventos.get(eventoId);
    if (!e || e.account !== contaId) throw new Error("evento inexistente nesta conta (falso)");
    return e;
  }

  /** Monta um evento Connect (só os campos que o sistema lê) e o deixa disponível para `obterEvento`. */
  publicarEvento(contaId: string, tipo: string, objeto: Record<string, unknown>, criadoEm = new Date()): Stripe.Event {
    const evento = {
      id: this.id("evt"),
      object: "event",
      account: contaId,
      api_version: "2026-09-30.endive",
      created: Math.floor(criadoEm.getTime() / 1000),
      data: { object: objeto },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: tipo,
    } as unknown as Stripe.Event;
    this.eventos.set(evento.id, evento);
    return evento;
  }
}
