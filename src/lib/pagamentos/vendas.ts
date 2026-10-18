import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db, type Transacao } from "@/lib/db";
import type { SituacaoVenda } from "@/lib/db/schema/_enums";
import {
  criadores_assinaturas as assinaturas,
  criadores_ofertas as ofertas,
  criadores_ofertas_produtos as ofertasProdutos,
  criadores_vendas as vendas,
  produtos,
  type MatriculaDaVenda,
} from "@/lib/db/schema";
import { MSG_COLISAO, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { vincularPessoa } from "@/lib/membros/vinculos";
import { concederAcesso, encerrarAcesso } from "./acesso";
import { contaDoCriador } from "./conta";
import { acessoAte, calcularTaxa, prefixoDaReferencia, referenciaDaAssinatura, referenciaDaVenda, taxaDevolvida } from "./regras";
import type { GatewayStripe } from "./stripe";

/**
 * Estados da venda (RN-215, RN-216), chamados pelo worker do webhook (autor = sistema) e pelo
 * reembolso do DONO. Tudo idempotente: o mesmo evento duas vezes não muda nada na segunda.
 */

const TABELA = "criadores_vendas";

/** Produtos VIVOS da oferta (curso removido depois da venda sai do acesso). */
async function produtosDaOferta(tx: Transacao, ofertaId: string): Promise<string[]> {
  const linhas = await tx
    .select({ id: ofertasProdutos.produto_id })
    .from(ofertasProdutos)
    .innerJoin(produtos, eq(produtos.id, ofertasProdutos.produto_id))
    .where(and(eq(ofertasProdutos.oferta_id, ofertaId), vivos(ofertasProdutos), vivos(produtos)))
    .orderBy(ofertasProdutos.produto_id);
  return linhas.map((l) => l.id);
}

export interface Comprador {
  email: string | null;
  nome: string;
}

export interface VendaConfirmada {
  vendaId: string;
  membroId: string;
  /** Matrículas criadas/reativadas agora (notificação e webhook de saída depois do commit). */
  novas: string[];
  /** Conta criada pela compra (primeiro acesso por e-mail depois do commit). */
  contaNova: { usuarioId: string; email: string; nome: string } | null;
  /** Membro vinculado agora (webhook MEMBRO_CADASTRADO). */
  membroNovo: boolean;
}

/**
 * Pagamento confirmado (cartão na hora; Pix/boleto no `async_payment_succeeded`). Resolve o comprador
 * (membro logado ao abrir, ou o e-mail do Checkout → conta + vínculo ALUNO), cria a assinatura e
 * libera os produtos. Venda já PAGA/REEMBOLSADA = nada (`null`).
 */
export async function confirmarVenda(
  tx: Transacao,
  p: { criadorId: string; sessaoId: string; comprador: Comprador; paymentIntentId: string | null; stripeAssinaturaId: string | null; faturaId: string | null; agora: Date },
): Promise<VendaConfirmada | null> {
  const [v] = await tx.select().from(vendas).where(and(eq(vendas.criador_id, p.criadorId), eq(vendas.checkout_sessao_id, p.sessaoId), vivos(vendas))).for("update");
  if (!v || v.situacao === "PAGA" || v.situacao === "REEMBOLSADA") return null;
  const [oferta] = await tx.select().from(ofertas).where(eq(ofertas.id, v.oferta_id));

  let membroId = v.membro_id;
  let contaNova: VendaConfirmada["contaNova"] = null;
  let membroNovo = false;
  if (!membroId) {
    if (!p.comprador.email) throw new ErroDeNegocio("Pagamento sem e-mail do comprador.");
    const r = await vincularPessoa(tx, { criadorId: p.criadorId, autorId: null, nome: p.comprador.nome, email: p.comprador.email, papel: "ALUNO" });
    membroId = r.membroId;
    membroNovo = r.tipo === "vinculado";
    if (r.tipo === "vinculado" && r.identidadeNova) contaNova = { usuarioId: r.usuarioId, email: p.comprador.email, nome: p.comprador.nome };
  }

  let assinaturaId: string | null = null;
  if (v.tipo === "ASSINATURA") {
    if (!p.stripeAssinaturaId) throw new ErroDeNegocio("Checkout de assinatura sem assinatura.");
    await tx
      .insert(assinaturas)
      .values({ criador_id: p.criadorId, oferta_id: v.oferta_id, membro_id: membroId, stripe_assinatura_id: p.stripeAssinaturaId, taxa_bps: v.taxa_bps, modified_by: v.modified_by })
      .onConflictDoNothing();
    const [a] = await tx.select({ id: assinaturas.id }).from(assinaturas).where(and(eq(assinaturas.stripe_assinatura_id, p.stripeAssinaturaId), eq(assinaturas.criador_id, p.criadorId)));
    assinaturaId = a.id;
  }

  const ate = acessoAte({ tipo: v.tipo, diasAcesso: oferta.dias_acesso, intervalo: oferta.intervalo }, p.agora);
  const matriculas: MatriculaDaVenda[] = [];
  for (const produtoId of await produtosDaOferta(tx, v.oferta_id)) {
    const referencia = v.tipo === "AVULSO" ? referenciaDaVenda(v.id, produtoId) : referenciaDaAssinatura(p.stripeAssinaturaId!, produtoId);
    matriculas.push(await concederAcesso(tx, { criadorId: p.criadorId, membroId, produtoId, ate, referencia, agora: p.agora }));
  }
  const depois = {
    situacao: "PAGA" as const,
    pago_em: p.agora,
    membro_id: membroId,
    comprador_email: p.comprador.email ?? v.comprador_email,
    payment_intent_id: p.paymentIntentId,
    fatura_id: p.faturaId,
    assinatura_id: assinaturaId,
    matriculas,
  };
  await tx.update(vendas).set({ ...depois, updated_at: p.agora }).where(eq(vendas.id, v.id));
  await registrarAuditoria(tx, {
    userId: null,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: v.id,
    detalhes: `Venda paga: "${oferta.nome}"`,
    dadosAnteriores: { situacao: v.situacao },
    dadosNovos: { ...depois, pago_em: p.agora.toISOString() },
  });
  return { vendaId: v.id, membroId, novas: matriculas.filter((m) => m.resultado !== "ja-existia").map((m) => m.matriculaId), contaNova, membroNovo };
}

/** Transição simples (Pix/boleto emitido, falhou, expirou) só a partir das situações dadas. */
export async function marcarVenda(tx: Transacao, p: { criadorId: string; sessaoId: string; de: readonly SituacaoVenda[]; para: SituacaoVenda; email?: string | null; agora: Date }): Promise<boolean> {
  const [v] = await tx
    .select()
    .from(vendas)
    .where(and(eq(vendas.criador_id, p.criadorId), eq(vendas.checkout_sessao_id, p.sessaoId), inArray(vendas.situacao, [...p.de]), vivos(vendas)))
    .for("update");
  if (!v) return false;
  await tx.update(vendas).set({ situacao: p.para, comprador_email: p.email ?? v.comprador_email, updated_at: p.agora }).where(eq(vendas.id, v.id));
  await registrarAuditoria(tx, { userId: null, criadorId: p.criadorId, acao: "atualizar", tabela: TABELA, registroId: v.id, detalhes: `Venda: ${v.situacao} → ${p.para}`, dadosAnteriores: { situacao: v.situacao }, dadosNovos: { situacao: p.para } });
  return true;
}

/**
 * Reembolso visto no Stripe (`charge.refunded`, cumulativo). Parcial: continua PAGA com o valor
 * reembolsado. TOTAL: REEMBOLSADA e, se avulsa, o acesso desta venda é encerrado (assinatura: o acesso
 * acaba com o cancelamento dela). A taxa devolvida é proporcional (`refund_application_fee`).
 */
export async function registrarReembolso(tx: Transacao, p: { criadorId: string; paymentIntentId: string; reembolsadoCentavos: number; agora: Date }): Promise<{ vendaId: string; encerradas: string[] } | null> {
  const [v] = await tx.select().from(vendas).where(and(eq(vendas.criador_id, p.criadorId), eq(vendas.payment_intent_id, p.paymentIntentId), vivos(vendas))).for("update");
  if (!v) return null;
  const total = Math.min(p.reembolsadoCentavos, v.valor_centavos);
  if (total <= v.reembolsado_centavos) return { vendaId: v.id, encerradas: [] };
  const situacao = total >= v.valor_centavos ? "REEMBOLSADA" : v.situacao;
  const depois = { reembolsado_centavos: total, taxa_devolvida_centavos: taxaDevolvida(v.taxa_centavos, v.valor_centavos, total), situacao };
  await tx.update(vendas).set({ ...depois, updated_at: p.agora }).where(eq(vendas.id, v.id));
  await registrarAuditoria(tx, {
    userId: null,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: v.id,
    detalhes: `Reembolso de ${total} centavos`,
    dadosAnteriores: { reembolsado_centavos: v.reembolsado_centavos, situacao: v.situacao },
    dadosNovos: depois,
  });
  const encerradas = situacao === "REEMBOLSADA" && v.tipo === "AVULSO" ? await encerrarAcesso(tx, { criadorId: p.criadorId, prefixo: prefixoDaReferencia(v.id), motivo: "Compra reembolsada", agora: p.agora }) : [];
  return { vendaId: v.id, encerradas };
}

/**
 * Renovação paga (`invoice.paid`, `subscription_cycle`): uma venda nova por fatura (idempotente pelo
 * `fatura_id`) e o acesso estendido até o fim do novo período + tolerância. Assinatura ainda não
 * gravada (evento antes do checkout) = LANÇA para a fila tentar de novo.
 */
export async function renovarAssinatura(
  tx: Transacao,
  p: { criadorId: string; stripeAssinaturaId: string; faturaId: string; valorCentavos: number; paymentIntentId: string | null; periodoFim: Date; agora: Date },
): Promise<{ vendaId: string | null; novas: string[] }> {
  const [a] = await tx.select().from(assinaturas).where(and(eq(assinaturas.criador_id, p.criadorId), eq(assinaturas.stripe_assinatura_id, p.stripeAssinaturaId))).for("update");
  if (!a) throw new Error(`assinatura ${p.stripeAssinaturaId} ainda não gravada`);
  const [ja] = await tx.select({ id: vendas.id }).from(vendas).where(eq(vendas.fatura_id, p.faturaId));
  let vendaId: string | null = null;
  if (!ja) {
    const [v] = await tx
      .insert(vendas)
      .values({
        criador_id: p.criadorId,
        oferta_id: a.oferta_id,
        tipo: "ASSINATURA",
        membro_id: a.membro_id,
        assinatura_id: a.id,
        fatura_id: p.faturaId,
        payment_intent_id: p.paymentIntentId,
        situacao: "PAGA",
        valor_centavos: p.valorCentavos,
        taxa_bps: a.taxa_bps,
        taxa_centavos: calcularTaxa(p.valorCentavos, a.taxa_bps),
        pago_em: p.agora,
        modified_by: a.modified_by,
      })
      .returning({ id: vendas.id });
    vendaId = v.id;
    await registrarAuditoria(tx, { userId: null, criadorId: p.criadorId, acao: "criar", tabela: TABELA, registroId: v.id, detalhes: `Renovação paga da assinatura ${p.stripeAssinaturaId}`, dadosNovos: { fatura_id: p.faturaId, valor_centavos: p.valorCentavos } });
  }
  const ate = acessoAte({ tipo: "ASSINATURA", diasAcesso: null, intervalo: null, periodoFim: p.periodoFim }, p.agora);
  const novas: string[] = [];
  const matriculas: MatriculaDaVenda[] = [];
  for (const produtoId of await produtosDaOferta(tx, a.oferta_id)) {
    const m = await concederAcesso(tx, { criadorId: p.criadorId, membroId: a.membro_id, produtoId, ate, referencia: referenciaDaAssinatura(a.stripe_assinatura_id, produtoId), agora: p.agora });
    matriculas.push(m);
    if (m.resultado !== "ja-existia") novas.push(m.matriculaId);
  }
  if (vendaId) await tx.update(vendas).set({ matriculas }).where(eq(vendas.id, vendaId));
  if (!a.periodo_fim || a.periodo_fim.getTime() < p.periodoFim.getTime()) await tx.update(assinaturas).set({ periodo_fim: p.periodoFim }).where(eq(assinaturas.id, a.id));
  return { vendaId, novas };
}

/**
 * Estado da assinatura (`customer.subscription.updated`/`deleted`). Evento mais velho que o último
 * aplicado é ignorado. Virou CANCELADA = acesso encerrado. Assinatura desconhecida = LANÇA (retentativa).
 */
export async function aplicarAssinatura(
  tx: Transacao,
  p: { criadorId: string; stripeAssinaturaId: string; situacao: (typeof assinaturas.$inferSelect)["situacao"]; cancelarNoFim: boolean; periodoFim: Date | null; ocorridoEm: Date; agora: Date },
): Promise<string[]> {
  const [a] = await tx.select().from(assinaturas).where(and(eq(assinaturas.criador_id, p.criadorId), eq(assinaturas.stripe_assinatura_id, p.stripeAssinaturaId))).for("update");
  if (!a) throw new Error(`assinatura ${p.stripeAssinaturaId} ainda não gravada`);
  if (a.evento_em && a.evento_em.getTime() > p.ocorridoEm.getTime()) return [];
  const encerrou = p.situacao === "CANCELADA" && a.situacao !== "CANCELADA";
  const depois = { situacao: p.situacao, cancelar_no_fim: p.cancelarNoFim, periodo_fim: p.periodoFim ?? a.periodo_fim, evento_em: p.ocorridoEm, encerrada_em: encerrou ? p.agora : a.encerrada_em };
  await tx.update(assinaturas).set(depois).where(eq(assinaturas.id, a.id));
  if (a.situacao !== p.situacao || a.cancelar_no_fim !== p.cancelarNoFim) {
    await registrarAuditoria(tx, {
      userId: null,
      criadorId: p.criadorId,
      acao: "atualizar",
      tabela: "criadores_assinaturas",
      registroId: a.id,
      detalhes: `Assinatura ${a.stripe_assinatura_id}: ${a.situacao} → ${p.situacao}${p.cancelarNoFim ? " (cancela no fim do período)" : ""}`,
      dadosAnteriores: { situacao: a.situacao, cancelar_no_fim: a.cancelar_no_fim },
      dadosNovos: { situacao: p.situacao, cancelar_no_fim: p.cancelarNoFim },
    });
  }
  return encerrou ? encerrarAcesso(tx, { criadorId: p.criadorId, prefixo: prefixoDaReferencia(a.stripe_assinatura_id), motivo: "Assinatura encerrada", agora: p.agora }) : [];
}

/**
 * Reembolso TOTAL pedido pelo DONO (RN-216): no Stripe (na conta conectada, devolvendo a taxa) e já
 * aplicado aqui (o `charge.refunded` que chega depois não muda nada). Venda de assinatura: a
 * assinatura também é cancelada no Stripe (o `customer.subscription.deleted` encerra o acesso).
 */
export async function reembolsarVenda(gateway: GatewayStripe, p: { criadorId: string; vendaId: string; versao: Date; autor: string }) {
  const [v] = await db.select().from(vendas).where(and(travaDeColisao(vendas, p.vendaId, p.versao), eq(vendas.criador_id, p.criadorId)));
  if (!v) throw new ErroDeNegocio(MSG_COLISAO);
  if (v.situacao !== "PAGA" || v.reembolsado_centavos >= v.valor_centavos) throw new ErroDeNegocio("Só venda paga e ainda não reembolsada pode ser reembolsada.");
  const conta = await contaDoCriador(p.criadorId);
  if (!conta) throw new ErroDeNegocio("Conta Stripe não conectada.");
  const paymentIntentId = v.payment_intent_id ?? (v.fatura_id ? await gateway.pagamentoDaFatura(conta.conta_id, v.fatura_id) : null);
  if (!paymentIntentId) throw new ErroDeNegocio("Pagamento não localizado no Stripe. Reembolse pelo Dashboard do Stripe.");
  await gateway.reembolsar(conta.conta_id, paymentIntentId, `reembolso-${v.id}`);
  if (v.assinatura_id) {
    const [a] = await db.select({ stripeId: assinaturas.stripe_assinatura_id, situacao: assinaturas.situacao }).from(assinaturas).where(eq(assinaturas.id, v.assinatura_id));
    if (a && a.situacao !== "CANCELADA") await gateway.cancelarAssinatura(conta.conta_id, a.stripeId);
  }
  const agora = new Date();
  return db.transaction(async (tx) => {
    if (!v.payment_intent_id) await tx.update(vendas).set({ payment_intent_id: paymentIntentId }).where(eq(vendas.id, v.id));
    await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "atualizar", tabela: TABELA, registroId: v.id, detalhes: "Pediu o reembolso total no Stripe", dadosNovos: { payment_intent_id: paymentIntentId } });
    const r = await registrarReembolso(tx, { criadorId: p.criadorId, paymentIntentId, reembolsadoCentavos: v.valor_centavos, agora });
    return { encerradas: r?.encerradas ?? [] };
  });
}
