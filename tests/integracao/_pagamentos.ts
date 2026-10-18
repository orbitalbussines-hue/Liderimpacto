/**
 * Apoio dos testes de pagamentos (ADR-0019) no PostgreSQL real: criador com conta Stripe (falsa)
 * liberada, oferta com curso e evento assinado como o Stripe assinaria. Nada sai para a rede.
 * Importar só dentro do teste (depois do _ambiente.ts).
 */
import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import { db } from "@/lib/db";
import type { IntervaloAssinatura, TipoOferta } from "@/lib/db/schema/_enums";
import { criadores_stripe_contas } from "@/lib/db/schema";
import { criarOferta } from "@/lib/pagamentos/ofertas";
import { novoCriador, novoUsuario, vincular } from "./_apoio";
import { cursoPronto } from "./_progresso";

export const contaFalsa = () => `acct_t${randomBytes(6).toString("hex")}`;

/** Criador + conta conectada com cobranças liberadas + oferta com 1 curso. */
export async function lojaPronta(o: { tipo?: TipoOferta; preco?: number; intervalo?: IntervaloAssinatura | null; diasAcesso?: number | null } = {}) {
  const criador = await novoCriador();
  const dono = await novoUsuario();
  await vincular(criador.id, dono.id, "DONO");
  const contaId = contaFalsa();
  await db.insert(criadores_stripe_contas).values({ criador_id: criador.id, conta_id: contaId, cobrancas_ativas: true, repasses_ativos: true, dados_enviados: true, modified_by: criador.id });
  const { produto } = await cursoPronto(criador.id, { aulas: 1 });
  const tipo = o.tipo ?? "AVULSO";
  const oferta = await db.transaction((tx) =>
    criarOferta(tx, {
      criadorId: criador.id,
      autor: dono.id,
      tipo,
      nome: "Oferta de teste",
      precoCentavos: o.preco ?? 19700,
      intervalo: o.intervalo ?? (tipo === "ASSINATURA" ? "MES" : null),
      diasAcesso: o.diasAcesso ?? null,
      produtoIds: [produto.id],
    }),
  );
  return { criador, dono, contaId, produto, oferta };
}

/** Cabeçalho `Stripe-Signature` válido para o corpo (mesmo segredo do _ambiente.ts). */
export const assinar = (corpo: string) => Stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: process.env.STRIPE_WEBHOOK_SECRET! });

/** Sessão de Checkout "paga" como o Stripe manda (só os campos que o sistema lê). */
export const sessaoPaga = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  object: "checkout.session",
  payment_status: "paid",
  payment_intent: `pi_${randomBytes(6).toString("hex")}`,
  subscription: null,
  invoice: null,
  customer_details: { email: `compra-${randomBytes(4).toString("hex")}@teste.local`, name: "Maria da Silva" },
  ...extra,
});
