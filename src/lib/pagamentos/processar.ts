import "server-only";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { criadores, criadores_stripe_contas as contas } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { emailPessoa, nomePessoa } from "@/lib/validators/membros";
import { notificarMatriculas } from "@/lib/notificacoes/gerar";
import { webhookMatriculas, webhookMembrosCadastrados } from "@/lib/webhooks/emitir";
import { aplicarStatusConta } from "./conta";
import { situacaoDaAssinatura } from "./regras";
import type { GatewayStripe } from "./stripe";
import { aplicarAssinatura, confirmarVenda, marcarVenda, registrarReembolso, renovarAssinatura, type Comprador, type VendaConfirmada } from "./vendas";

/**
 * Worker do webhook do Stripe (5º Worker de `worker:certificados`, ADR-0019 item 5). O criador vem da
 * CONTA CONECTADA gravada aqui (`contaId` do job = `event.account`), nunca de metadata; o evento é
 * RELIDO na API dessa conta (o banco não guarda payload). Objetos que não são nossos (venda de outro
 * negócio do criador na mesma conta Stripe) são ignorados. Efeitos colaterais (notificação, webhook
 * de saída, e-mail de primeiro acesso) só DEPOIS do commit e sem lançar.
 */

export type ResultadoEvento = "processado" | "ignorado";

const idDe = (x: string | { id: string } | null | undefined): string | null => (x == null ? null : typeof x === "string" ? x : x.id);
const segundos = (s: number) => new Date(s * 1000);

function compradorDe(s: Stripe.Checkout.Session): Comprador {
  const email = emailPessoa.safeParse(s.customer_details?.email ?? "");
  const nome = nomePessoa.safeParse(s.customer_details?.name ?? "");
  return { email: email.success ? email.data : null, nome: nome.success ? nome.data : "Aluno" };
}

async function depoisDaVenda(criadorId: string, r: VendaConfirmada | null) {
  if (!r) return;
  await notificarMatriculas(criadorId, r.novas, null);
  await webhookMatriculas(criadorId, r.novas, "MATRICULA_CRIADA", null);
  if (r.membroNovo) await webhookMembrosCadastrados(criadorId, [r.membroId], r.contaNova?.usuarioId ?? r.membroId);
  if (r.contaNova) {
    try {
      // Import tardio: o Better Auth exige BETTER_AUTH_SECRET ao carregar; sem ele só este passo falha.
      const [{ gerarLinkDeSenha }, { enviarPrimeiroAcesso }] = await Promise.all([import("@/lib/auth/recuperacao"), import("@/lib/membros/primeiro-acesso")]);
      const [c] = await db.select({ id: criadores.id, slug: criadores.slug, nome: criadores.nome, cor_marca: criadores.cor_marca }).from(criadores).where(eq(criadores.id, criadorId));
      const link = await gerarLinkDeSenha(r.contaNova.usuarioId, c, null);
      await enviarPrimeiroAcesso(r.contaNova.email, r.contaNova.nome, c, { url: link.url, expiraEm: link.expiraEm.toISOString() });
    } catch (e) {
      // A compra já está gravada; a pessoa pode pedir "Esqueci a senha".
      console.error("[stripe] primeiro acesso não enviado:", e instanceof Error ? e.name : "erro");
    }
  }
}

const confirmar = (criadorId: string, s: Stripe.Checkout.Session, paymentIntentId: string | null, agora: Date) =>
  db.transaction((tx) =>
    confirmarVenda(tx, { criadorId, sessaoId: s.id, comprador: compradorDe(s), paymentIntentId, stripeAssinaturaId: idDe(s.subscription), faturaId: idDe(s.invoice), agora }),
  );

/** PaymentIntent da cobrança da sessão: avulso vem nela; assinatura, pela fatura (para o reembolso casar). */
async function intencaoDaSessao(gateway: GatewayStripe, contaId: string, s: Stripe.Checkout.Session) {
  const pi = idDe(s.payment_intent);
  if (pi) return pi;
  const fatura = idDe(s.invoice);
  return fatura ? gateway.pagamentoDaFatura(contaId, fatura) : null;
}

export async function processarEventoStripe(gateway: GatewayStripe, eventoId: string, contaId: string, agora: () => Date = () => new Date()): Promise<ResultadoEvento> {
  const [conta] = await db.select({ criadorId: contas.criador_id }).from(contas).where(and(eq(contas.conta_id, contaId), vivos(contas)));
  if (!conta) return "ignorado";
  const criadorId = conta.criadorId;
  const evento = await gateway.obterEvento(contaId, eventoId);
  if (evento.account !== contaId) return "ignorado";
  const ocorridoEm = segundos(evento.created);

  switch (evento.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = evento.data.object;
      if (s.payment_status === "unpaid") {
        // Pix/boleto emitido: espera o `async_payment_succeeded`.
        const ok = await db.transaction((tx) => marcarVenda(tx, { criadorId, sessaoId: s.id, de: ["PENDENTE"], para: "AGUARDANDO_PAGAMENTO", email: compradorDe(s).email, agora: agora() }));
        return ok ? "processado" : "ignorado";
      }
      const r = await confirmar(criadorId, s, await intencaoDaSessao(gateway, contaId, s), agora());
      await depoisDaVenda(criadorId, r);
      return r ? "processado" : "ignorado";
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const s = evento.data.object;
      const para = evento.type === "checkout.session.expired" ? "EXPIRADA" : "FALHOU";
      const ok = await db.transaction((tx) => marcarVenda(tx, { criadorId, sessaoId: s.id, de: ["PENDENTE", "AGUARDANDO_PAGAMENTO"], para, agora: agora() }));
      return ok ? "processado" : "ignorado";
    }
    case "charge.refunded": {
      const c = evento.data.object;
      const pi = idDe(c.payment_intent);
      if (!pi) return "ignorado";
      const r = await db.transaction((tx) => registrarReembolso(tx, { criadorId, paymentIntentId: pi, reembolsadoCentavos: c.amount_refunded, agora: agora() }));
      if (r) await webhookMatriculas(criadorId, r.encerradas, "MATRICULA_CANCELADA", null);
      return r ? "processado" : "ignorado";
    }
    case "invoice.paid": {
      const f = evento.data.object;
      const detalhes = f.parent?.subscription_details;
      const sub = idDe(detalhes?.subscription);
      // 1ª fatura: o checkout.session.completed já liberou. Só renovação, e só assinatura nossa.
      if (f.billing_reason !== "subscription_cycle" || !sub || !detalhes?.metadata?.venda_id) return "ignorado";
      const periodoFim = segundos(Math.max(...f.lines.data.map((l) => l.period.end)));
      const pi = await gateway.pagamentoDaFatura(contaId, f.id);
      const r = await db.transaction((tx) =>
        renovarAssinatura(tx, { criadorId, stripeAssinaturaId: sub, faturaId: f.id, valorCentavos: f.amount_paid, paymentIntentId: pi, periodoFim, agora: agora() }),
      );
      await notificarMatriculas(criadorId, r.novas, null);
      await webhookMatriculas(criadorId, r.novas, "MATRICULA_CRIADA", null);
      return "processado";
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const a = evento.data.object;
      if (!a.metadata?.venda_id) return "ignorado";
      const fim = a.items.data.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
      const encerradas = await db.transaction((tx) =>
        aplicarAssinatura(tx, {
          criadorId,
          stripeAssinaturaId: a.id,
          situacao: situacaoDaAssinatura(a.status),
          cancelarNoFim: a.cancel_at_period_end,
          periodoFim: fim.length ? segundos(Math.max(...fim)) : null,
          ocorridoEm,
          agora: agora(),
        }),
      );
      await webhookMatriculas(criadorId, encerradas, "MATRICULA_CANCELADA", null);
      return "processado";
    }
    case "account.updated": {
      const c = evento.data.object;
      if (c.id !== contaId) return "ignorado";
      await db.transaction((tx) =>
        aplicarStatusConta(tx, { contaId, status: { cobrancasAtivas: !!c.charges_enabled, repassesAtivos: !!c.payouts_enabled, dadosEnviados: !!c.details_submitted }, ocorridoEm, autor: null }),
      );
      return "processado";
    }
    default:
      return "ignorado";
  }
}
