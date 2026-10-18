import type Stripe from "stripe";
import type { IntervaloAssinatura, SituacaoAssinatura, TipoCupom, TipoOferta } from "@/lib/db/schema/_enums";

/**
 * Regras PURAS dos pagamentos (ADR-0019, RN-210 a RN-217): dinheiro em CENTAVOS INTEIROS, taxa e
 * comissão em basis points (bps: 800 = 8%), arredondamento meio-para-cima uma vez só. Sem banco e sem
 * rede: tela, serviço e teste usam as mesmas funções.
 */

export const TAXA_PADRAO_BPS = 800;
export const TAXA_MAXIMA_BPS = 5000;
/** Mínimo de cobrança em BRL aceito pelo Stripe é R$ 0,50; a plataforma usa R$ 1,00. */
export const PRECO_MINIMO_CENTAVOS = 100;
export const PRECO_MAXIMO_CENTAVOS = 100_000_000;
export const MOEDA = "brl";
/** Meios oferecidos: o Stripe mostra só os elegíveis (conta e modo) — Pix não entra em assinatura. */
export const MEIOS_DE_PAGAMENTO = ["card", "pix", "boleto"] as const satisfies readonly Stripe.Checkout.SessionCreateParams.AllowedPaymentMethodType[];
/** Folga depois do fim do período pago antes de cortar o acesso da assinatura (renovação atrasada). */
export const TOLERANCIA_ASSINATURA_DIAS = 3;
/** Teto de Checkouts abertos por IP em 10 minutos (rota pública de compra). */
export const TETO_CHECKOUT_POR_IP = 20;

export const RE_CODIGO_CUPOM = /^[A-Z0-9]{3,20}$/;
export const RE_CODIGO_AFILIADO = /^[A-Z0-9]{4,20}$/;
export const RE_CONTA_STRIPE = /^acct_[A-Za-z0-9]{1,100}$/;

/** Código digitado: maiúsculo, sem espaço e sem hífen. */
export const normalizarCodigo = (codigo: string): string => codigo.toUpperCase().replace(/[\s-]/g, "");

/** `centavos * bps / 10000`, meio-para-cima, em inteiro (sem ponto flutuante no meio). */
export function porBps(centavos: number, bps: number): number {
  if (!Number.isSafeInteger(centavos) || !Number.isSafeInteger(bps) || centavos < 0 || bps < 0) throw new Error("Valor ou taxa inválidos.");
  return Number((BigInt(centavos) * BigInt(bps) + BigInt(5000)) / BigInt(10000));
}

/** Taxa da plataforma sobre o valor cobrado. */
export const calcularTaxa = (valorCentavos: number, taxaBps: number): number => porBps(valorCentavos, taxaBps);

/** Comissão do afiliado: sobre o que sobra ao criador depois da taxa da plataforma. */
export const calcularComissao = (valorCentavos: number, taxaCentavos: number, comissaoBps: number): number => porBps(valorCentavos - taxaCentavos, comissaoBps);

/** Parte da taxa devolvida num reembolso (`refund_application_fee` é proporcional ao reembolsado). */
export function taxaDevolvida(taxaCentavos: number, valorCentavos: number, reembolsadoCentavos: number): number {
  if (valorCentavos === 0) return 0;
  const r = Math.min(reembolsadoCentavos, valorCentavos);
  return Number((BigInt(taxaCentavos) * BigInt(r) + BigInt(Math.floor(valorCentavos / 2))) / BigInt(valorCentavos));
}

/** `application_fee_percent` da assinatura: bps / 100 com 2 casas (800 → 8). */
export const percentualDaTaxa = (bps: number): number => Number((bps / 100).toFixed(2));

export interface CupomAplicavel {
  tipo: TipoCupom;
  percentualBps: number | null;
  valorCentavos: number | null;
}

/** Desconto em centavos (nunca maior que o preço). */
export function descontoDoCupom(precoCentavos: number, c: CupomAplicavel): number {
  const d = c.tipo === "PERCENTUAL" ? porBps(precoCentavos, c.percentualBps ?? 0) : (c.valorCentavos ?? 0);
  return Math.min(d, precoCentavos);
}

export type MotivoCupomInvalido = "SITUACAO" | "VENCIDO" | "OUTRA_OFERTA" | "ESGOTADO" | "PRECO_MINIMO";

export const TEXTO_CUPOM_INVALIDO: Record<MotivoCupomInvalido, string> = {
  SITUACAO: "Cupom inválido.",
  VENCIDO: "Este cupom venceu.",
  OUTRA_OFERTA: "Este cupom não vale para esta oferta.",
  ESGOTADO: "Este cupom esgotou.",
  PRECO_MINIMO: "Com este cupom o valor fica abaixo do mínimo (R$ 1,00).",
};

export function motivoCupomInvalido(
  c: { situacao: string; validoAte: Date | null; ofertaId: string | null; limiteUsos: number | null; usos: number },
  ofertaId: string,
  precoFinal: number,
  agora: Date,
): MotivoCupomInvalido | null {
  if (c.situacao !== "ATIVO") return "SITUACAO";
  if (c.validoAte && c.validoAte.getTime() <= agora.getTime()) return "VENCIDO";
  if (c.ofertaId !== null && c.ofertaId !== ofertaId) return "OUTRA_OFERTA";
  if (c.limiteUsos !== null && c.usos >= c.limiteUsos) return "ESGOTADO";
  if (precoFinal < PRECO_MINIMO_CENTAVOS) return "PRECO_MINIMO";
  return null;
}

export interface ValoresDaVenda {
  valorCentavos: number;
  descontoCentavos: number;
  taxaCentavos: number;
  comissaoCentavos: number;
}

export function valoresDaVenda(p: { precoCentavos: number; descontoCentavos: number; taxaBps: number; comissaoBps: number | null }): ValoresDaVenda {
  const valorCentavos = p.precoCentavos - p.descontoCentavos;
  const taxaCentavos = calcularTaxa(valorCentavos, p.taxaBps);
  return { valorCentavos, descontoCentavos: p.descontoCentavos, taxaCentavos, comissaoCentavos: p.comissaoBps === null ? 0 : calcularComissao(valorCentavos, taxaCentavos, p.comissaoBps) };
}

/** Soma `meses` em UTC (31/01 + 1 mês = 28/02 ou 29/02, não 03/03). */
export function somarMeses(d: Date, meses: number): Date {
  const r = new Date(d);
  const dia = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(dia, ultimo));
  return r;
}

const DIA_MS = 86_400_000;

/** Até quando a venda libera o acesso: avulso = dias da oferta (nulo = sem fim); assinatura = fim do período + tolerância. */
export function acessoAte(p: { tipo: TipoOferta; diasAcesso: number | null; intervalo: IntervaloAssinatura | null; periodoFim?: Date | null }, agora: Date): Date | null {
  if (p.tipo === "AVULSO") return p.diasAcesso === null ? null : new Date(agora.getTime() + p.diasAcesso * DIA_MS);
  const fim = p.periodoFim ?? somarMeses(agora, p.intervalo === "ANO" ? 12 : 1);
  return new Date(fim.getTime() + TOLERANCIA_ASSINATURA_DIAS * DIA_MS);
}

/** Status do Stripe → situação gravada (mapa fechado; desconhecido = INCOMPLETA, sem acesso novo). */
export function situacaoDaAssinatura(status: string): SituacaoAssinatura {
  switch (status) {
    case "active":
    case "trialing":
      return "ATIVA";
    case "past_due":
    case "unpaid":
      return "ATRASADA";
    case "paused":
      return "PAUSADA";
    case "canceled":
    case "incomplete_expired":
      return "CANCELADA";
    default:
      return "INCOMPLETA";
  }
}

/** Referência da matrícula (CHECK `gateway:id`): avulso por venda; assinatura pela assinatura do Stripe (renovação estende a MESMA). */
export const referenciaDaVenda = (vendaId: string, produtoId: string) => `stripe:${vendaId}:${produtoId}`;
export const referenciaDaAssinatura = (stripeAssinaturaId: string, produtoId: string) => `stripe:${stripeAssinaturaId}:${produtoId}`;
/** Prefixo comum às matrículas de uma venda/assinatura (cancelamento por reembolso ou fim da assinatura). */
export const prefixoDaReferencia = (id: string) => `stripe:${id}:`;

export interface PedidoCheckout {
  vendaId: string;
  criadorId: string;
  oferta: { nome: string; tipo: TipoOferta; intervalo: IntervaloAssinatura | null };
  valorCentavos: number;
  taxaCentavos: number;
  taxaBps: number;
  /** E-mail de quem está logado (fica fixo no Checkout); nulo = o Stripe pergunta. */
  email: string | null;
  urlSucesso: string;
  urlCancelamento: string;
}

/**
 * Parâmetros da Checkout Session (DIRECT CHARGE: a sessão é criada NA conta conectada, com
 * `stripeAccount`). Avulso: `payment_intent_data.application_fee_amount` em centavos. Assinatura:
 * `subscription_data.application_fee_percent` (o Stripe aplica em toda renovação). O preço vai
 * como `price_data` (valor já com cupom): nada de Price/Product para sincronizar no Stripe.
 */
export function parametrosCheckout(p: PedidoCheckout): Stripe.Checkout.SessionCreateParams {
  const metadata = { venda_id: p.vendaId, criador_id: p.criadorId };
  const comum = {
    client_reference_id: p.vendaId,
    metadata,
    allowed_payment_method_types: [...MEIOS_DE_PAGAMENTO],
    locale: "pt-BR" as const,
    success_url: p.urlSucesso,
    cancel_url: p.urlCancelamento,
    ...(p.email ? { customer_email: p.email } : {}),
  };
  const produto = { name: p.oferta.nome.slice(0, 250) };
  if (p.oferta.tipo === "AVULSO") {
    return {
      ...comum,
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: MOEDA, unit_amount: p.valorCentavos, product_data: produto } }],
      payment_intent_data: { application_fee_amount: p.taxaCentavos, metadata },
    };
  }
  return {
    ...comum,
    mode: "subscription",
    line_items: [
      { quantity: 1, price_data: { currency: MOEDA, unit_amount: p.valorCentavos, recurring: { interval: p.oferta.intervalo === "ANO" ? "year" : "month" }, product_data: produto } },
    ],
    subscription_data: { application_fee_percent: percentualDaTaxa(p.taxaBps), metadata },
  };
}

/** "R$ 1.234,56" (tela). */
export const formatarCentavos = (centavos: number): string => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
