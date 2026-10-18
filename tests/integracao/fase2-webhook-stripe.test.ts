/**
 * Fase 2 (ADR-0019, RN-215, RN-216) no PostgreSQL real — webhook Connect do Stripe com o StripeFalso
 * (nenhum teste sai para a rede): assinatura inválida recusada, recibo idempotente, mesmo evento 2× = 1
 * matrícula, comprador novo vira conta + ALUNO, Pix/boleto assíncrono, reembolso total/parcial, renovação
 * e fim da assinatura, evento fora de ordem, status da conta e isolamento pela conta conectada.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { novoUsuario, vincular } from "./_apoio";
import { assinar, lojaPronta, sessaoPaga } from "./_pagamentos";

let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let webhook: typeof import("@/lib/pagamentos/webhook");
let processar: typeof import("@/lib/pagamentos/processar");
let checkout: typeof import("@/lib/pagamentos/checkout");
let StripeFalso: typeof import("@/lib/pagamentos/stripe-falso").StripeFalso;

beforeAll(async () => {
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  webhook = await import("@/lib/pagamentos/webhook");
  processar = await import("@/lib/pagamentos/processar");
  checkout = await import("@/lib/pagamentos/checkout");
  StripeFalso = (await import("@/lib/pagamentos/stripe-falso")).StripeFalso;
});

const vendaDe = async (id: string) => (await db.select().from(s.criadores_vendas).where(eq(s.criadores_vendas.id, id)))[0];
const matriculasDe = (produtoId: string) => db.select().from(s.produtos_matriculas).where(eq(s.produtos_matriculas.produto_id, produtoId));
const recibos = (eventoId: string) => db.select().from(s.stripe_eventos).where(eq(s.stripe_eventos.evento_id, eventoId));

/** Entrega o evento como o Stripe faria (corpo assinado) e devolve os jobs enfileirados. */
async function entregar(evento: { id: string }) {
  const corpo = JSON.stringify(evento);
  const jobs: { eventoId: string; contaId: string }[] = [];
  const r = await webhook.receberEventoStripe(corpo, assinar(corpo), async (j) => {
    jobs.push(j);
  });
  return { r, jobs };
}

describe("webhook do Stripe", () => {
  it("recusa assinatura inválida, corpo adulterado e endpoint sem segredo; recibo sem payload", async () => {
    const corpo = JSON.stringify({ id: "evt_x1", object: "event", type: "account.updated", created: 1, livemode: false, data: { object: { id: "acct_x" } } });
    expect((await webhook.receberEventoStripe(corpo, null)).status).toBe(400);
    expect((await webhook.receberEventoStripe(corpo, "t=1,v1=deadbeef")).status).toBe(400);
    expect((await webhook.receberEventoStripe(corpo.replace("acct_x", "acct_y"), assinar(corpo))).status).toBe(400);
    expect((await webhook.receberEventoStripe(corpo, assinar(corpo), async () => undefined, "")).status).toBe(503);
    expect(await recibos("evt_x1")).toHaveLength(0);
  });

  it("mesmo evento 2× = 1 recibo e 1 matrícula; comprador novo vira conta + ALUNO; conta de outro criador não mexe", async () => {
    const { criador: A, contaId, produto, oferta } = await lojaPronta();
    const B = await lojaPronta();
    const falso = new StripeFalso();
    const { vendaId } = await checkout.criarCheckout(falso, { criador: A, ofertaId: oferta.id, afiliadoCodigo: null, cupomCodigo: null, comprador: null });
    const sessaoId = falso.checkouts[0].id;
    const objeto = sessaoPaga(sessaoId);

    // O mesmo id de sessão chegando pela conta de B: B não acha venda dele.
    const deB = falso.publicarEvento(B.contaId, "checkout.session.completed", objeto);
    expect((await entregar(deB)).jobs).toHaveLength(1);
    expect(await processar.processarEventoStripe(falso, deB.id, B.contaId)).toBe("ignorado");
    expect((await vendaDe(vendaId)).situacao).toBe("PENDENTE");

    const ev = falso.publicarEvento(contaId, "checkout.session.completed", objeto);
    const primeira = await entregar(ev);
    const segunda = await entregar(ev);
    expect(primeira.r.status).toBe(200);
    expect(segunda.r.status).toBe(200);
    expect(primeira.jobs).toEqual([{ eventoId: ev.id, contaId }]);
    const [recibo, ...resto] = await recibos(ev.id);
    expect(resto).toHaveLength(0);
    expect(recibo).toMatchObject({ tipo: "checkout.session.completed", conta_id: contaId, criador_id: A.id, objeto_id: sessaoId });
    expect(JSON.stringify(recibo)).not.toContain(objeto.customer_details.email);

    expect(await processar.processarEventoStripe(falso, ev.id, contaId)).toBe("processado");
    expect(await processar.processarEventoStripe(falso, ev.id, contaId)).toBe("ignorado");
    const ms = await matriculasDe(produto.id);
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ origem: "COMPRA", status: "ATIVA", expira_em: null, referencia_externa: `stripe:${vendaId}:${produto.id}` });
    const v = await vendaDe(vendaId);
    expect(v).toMatchObject({ situacao: "PAGA", comprador_email: objeto.customer_details.email, payment_intent_id: objeto.payment_intent, membro_id: ms[0].membro_id });
    const [pessoa] = await db
      .select({ email: s.usuarios.email, nome: s.usuarios.nome, papel: s.criadores_membros.papel })
      .from(s.criadores_membros)
      .innerJoin(s.usuarios, eq(s.usuarios.id, s.criadores_membros.usuario_id))
      .where(eq(s.criadores_membros.id, ms[0].membro_id));
    expect(pessoa).toEqual({ email: objeto.customer_details.email, nome: "Maria da Silva", papel: "ALUNO" });
    // A trilha da venda é do sistema (sem usuário).
    const [trilha] = await db.select().from(s.auditoria).where(and(eq(s.auditoria.registro_id, vendaId), eq(s.auditoria.acao, "atualizar")));
    expect(trilha.user_id).toBeNull();

    // Conta desconhecida: recibo gravado sem criador e nada enfileirado.
    const estranho = falso.publicarEvento("acct_desconhecida1", "checkout.session.completed", objeto);
    const r = await entregar(estranho);
    expect(r.jobs).toHaveLength(0);
    expect((await recibos(estranho.id))[0].criador_id).toBeNull();
  });

  it("Pix/boleto: aguardando → pago libera; falha não libera; expirada; reembolso total encerra e parcial não", async () => {
    const { criador: A, contaId, produto, oferta } = await lojaPronta({ preco: 10000, diasAcesso: 30 });
    const falso = new StripeFalso();
    const abrir = async () => {
      await checkout.criarCheckout(falso, { criador: A, ofertaId: oferta.id, afiliadoCodigo: null, cupomCodigo: null, comprador: null });
      return falso.checkouts.at(-1)!.id;
    };
    const rodar = async (tipo: string, objeto: Record<string, unknown>) => processar.processarEventoStripe(falso, falso.publicarEvento(contaId, tipo, objeto).id, contaId);

    const pix = await abrir();
    const objPix = sessaoPaga(pix, { payment_status: "unpaid" });
    await rodar("checkout.session.completed", objPix);
    const [v1] = await db.select().from(s.criadores_vendas).where(eq(s.criadores_vendas.checkout_sessao_id, pix));
    expect(v1.situacao).toBe("AGUARDANDO_PAGAMENTO");
    expect(await matriculasDe(produto.id)).toHaveLength(0);
    await rodar("checkout.session.async_payment_succeeded", { ...objPix, payment_status: "paid" });
    const [m] = await matriculasDe(produto.id);
    expect(m.status).toBe("ATIVA");
    expect(m.expira_em!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);

    const boleto = await abrir();
    await rodar("checkout.session.completed", sessaoPaga(boleto, { payment_status: "unpaid" }));
    await rodar("checkout.session.async_payment_failed", sessaoPaga(boleto, { payment_status: "unpaid" }));
    const expira = await abrir();
    await rodar("checkout.session.expired", { id: expira, object: "checkout.session", payment_status: "unpaid" });
    const situacoes = await db.select({ sessao: s.criadores_vendas.checkout_sessao_id, situacao: s.criadores_vendas.situacao }).from(s.criadores_vendas).where(eq(s.criadores_vendas.criador_id, A.id));
    expect(Object.fromEntries(situacoes.map((x) => [x.sessao, x.situacao]))).toMatchObject({ [boleto]: "FALHOU", [expira]: "EXPIRADA" });

    // Reembolso parcial: continua PAGA, acesso fica; total: REEMBOLSADA, acesso encerrado, taxa devolvida.
    await rodar("charge.refunded", { id: "ch_1", object: "charge", payment_intent: objPix.payment_intent, amount_refunded: 2500 });
    expect(await vendaDe(v1.id)).toMatchObject({ situacao: "PAGA", reembolsado_centavos: 2500, taxa_devolvida_centavos: 200 });
    expect((await matriculasDe(produto.id))[0].status).toBe("ATIVA");
    await rodar("charge.refunded", { id: "ch_1", object: "charge", payment_intent: objPix.payment_intent, amount_refunded: 10000 });
    expect(await vendaDe(v1.id)).toMatchObject({ situacao: "REEMBOLSADA", reembolsado_centavos: 10000, taxa_centavos: 800, taxa_devolvida_centavos: 800 });
    expect((await matriculasDe(produto.id))[0]).toMatchObject({ status: "CANCELADA", motivo_cancelamento: "Compra reembolsada" });
    // Reembolso de cobrança que não é nossa: ignorado.
    expect(await rodar("charge.refunded", { id: "ch_2", object: "charge", payment_intent: "pi_deoutronegocio", amount_refunded: 100 })).toBe("ignorado");
  });

  it("assinatura: libera com prazo, renovação estende (idempotente), fora de ordem é ignorado, cancelada encerra o acesso", async () => {
    const { criador: A, contaId, produto, oferta } = await lojaPronta({ tipo: "ASSINATURA", preco: 4990 });
    const aluno = await novoUsuario();
    const membro = await vincular(A.id, aluno.id, "ALUNO");
    const falso = new StripeFalso();
    const { vendaId } = await checkout.criarCheckout(falso, { criador: A, ofertaId: oferta.id, afiliadoCodigo: null, cupomCodigo: null, comprador: { membroId: membro.id, usuarioId: aluno.id, email: aluno.email } });
    const { params } = falso.checkouts[0];
    expect(params.mode).toBe("subscription");
    expect(params.subscription_data?.application_fee_percent).toBe(8);
    expect(params.customer_email).toBe(aluno.email);
    const sub = `sub_t${Date.now().toString(36)}`;
    // Ids do Stripe são globais e únicos no banco: cada execução usa os seus.
    const [f1, f2, pi1] = ["in_p", "in_r", "pi_p"].map((p) => `${p}${Date.now().toString(36)}`);
    falso.pagamentosDeFatura.set(f1, pi1);
    const rodar = async (tipo: string, objeto: Record<string, unknown>, quando?: Date) =>
      processar.processarEventoStripe(falso, falso.publicarEvento(contaId, tipo, objeto, quando).id, contaId);

    await rodar("checkout.session.completed", sessaoPaga(falso.checkouts[0].id, { payment_intent: null, subscription: sub, invoice: f1 }));
    const [a] = await db.select().from(s.criadores_assinaturas).where(eq(s.criadores_assinaturas.stripe_assinatura_id, sub));
    expect(a).toMatchObject({ criador_id: A.id, membro_id: membro.id, situacao: "ATIVA", taxa_bps: 800 });
    expect(await vendaDe(vendaId)).toMatchObject({ situacao: "PAGA", assinatura_id: a.id, payment_intent_id: pi1, fatura_id: f1 });
    const [m1] = await matriculasDe(produto.id);
    expect(m1.referencia_externa).toBe(`stripe:${sub}:${produto.id}`);
    const fimProvisorio = m1.expira_em!.getTime();

    // 1ª fatura (subscription_create) não duplica; renovação cria venda nova e estende o acesso.
    const fimPeriodo = Math.floor(Date.now() / 1000) + 62 * 86_400;
    const fatura = (id: string, motivo: string) => ({
      id,
      object: "invoice",
      billing_reason: motivo,
      amount_paid: 4990,
      parent: { subscription_details: { subscription: sub, metadata: { venda_id: vendaId } } },
      lines: { data: [{ period: { end: fimPeriodo } }] },
    });
    expect(await rodar("invoice.paid", fatura(f1, "subscription_create"))).toBe("ignorado");
    await rodar("invoice.paid", fatura(f2, "subscription_cycle"));
    await rodar("invoice.paid", fatura(f2, "subscription_cycle"));
    const vendasDaAssinatura = await db.select().from(s.criadores_vendas).where(eq(s.criadores_vendas.assinatura_id, a.id));
    expect(vendasDaAssinatura).toHaveLength(2);
    expect(vendasDaAssinatura.find((v) => v.fatura_id === f2)).toMatchObject({ situacao: "PAGA", valor_centavos: 4990, taxa_centavos: 399 });
    const [m2] = await matriculasDe(produto.id);
    expect(m2.expira_em!.getTime()).toBeGreaterThan(fimProvisorio);
    expect(m2.expira_em!.getTime()).toBe((fimPeriodo + 3 * 86_400) * 1000);
    expect(await matriculasDe(produto.id)).toHaveLength(1);

    // Assinatura que não é nossa (sem venda_id no metadata): ignorada.
    expect(await rodar("customer.subscription.updated", { id: "sub_outro", status: "active", cancel_at_period_end: false, metadata: {}, items: { data: [] } })).toBe("ignorado");

    const assinaturaObj = (status: string, cancelarNoFim = false) => ({ id: sub, object: "subscription", status, cancel_at_period_end: cancelarNoFim, metadata: { venda_id: vendaId }, items: { data: [{ current_period_end: fimPeriodo }] } });
    await rodar("customer.subscription.updated", assinaturaObj("active", true));
    expect((await db.select().from(s.criadores_assinaturas).where(eq(s.criadores_assinaturas.id, a.id)))[0]).toMatchObject({ situacao: "ATIVA", cancelar_no_fim: true });
    await rodar("customer.subscription.deleted", assinaturaObj("canceled"));
    const [fim] = await db.select().from(s.criadores_assinaturas).where(eq(s.criadores_assinaturas.id, a.id));
    expect(fim.situacao).toBe("CANCELADA");
    expect(fim.encerrada_em).toBeInstanceOf(Date);
    expect((await matriculasDe(produto.id))[0]).toMatchObject({ status: "CANCELADA", motivo_cancelamento: "Assinatura encerrada" });
    // Um `updated` antigo chegando depois não ressuscita a assinatura.
    await rodar("customer.subscription.updated", assinaturaObj("active"), new Date(Date.now() - 3600_000));
    expect((await db.select().from(s.criadores_assinaturas).where(eq(s.criadores_assinaturas.id, a.id)))[0].situacao).toBe("CANCELADA");
  });

  it("account.updated grava o status da conta (evento velho não volta)", async () => {
    const { contaId } = await lojaPronta();
    await db.update(s.criadores_stripe_contas).set({ cobrancas_ativas: false, repasses_ativos: false, dados_enviados: false }).where(eq(s.criadores_stripe_contas.conta_id, contaId));
    const falso = new StripeFalso();
    const conta = (ativa: boolean) => ({ id: contaId, object: "account", charges_enabled: ativa, payouts_enabled: ativa, details_submitted: true });
    await processar.processarEventoStripe(falso, falso.publicarEvento(contaId, "account.updated", conta(true)).id, contaId);
    await processar.processarEventoStripe(falso, falso.publicarEvento(contaId, "account.updated", conta(false), new Date(Date.now() - 60_000)).id, contaId);
    const [c] = await db.select().from(s.criadores_stripe_contas).where(eq(s.criadores_stripe_contas.conta_id, contaId));
    expect(c).toMatchObject({ cobrancas_ativas: true, repasses_ativos: true, dados_enviados: true });
  });
});
