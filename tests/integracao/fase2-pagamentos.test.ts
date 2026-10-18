/**
 * Fase 2 (ADR-0019, RN-210 a RN-217) no PostgreSQL real com o StripeFalso (nada sai para a rede):
 * permissão por action, conexão da conta, taxa só do SUPER_ADMIN, ofertas/cupons/afiliados com trava e
 * isolamento A×B, link de compra abrindo o Checkout NA conta conectada com taxa/cupom/afiliado certos,
 * reembolso do DONO e as leituras das telas (vendas, resumo, afiliados).
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhos, cabecalhosLogados, novoUsuario, superAdminPleno, vincular } from "./_apoio";
import { lojaPronta, sessaoPaga } from "./_pagamentos";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let stripe: typeof import("@/lib/pagamentos/stripe");
let StripeFalso: typeof import("@/lib/pagamentos/stripe-falso").StripeFalso;
let acoes: typeof import("@/lib/actions/pagamentos");
let acoesO: typeof import("@/lib/actions/ofertas");
let rota: typeof import("@/lib/pagamentos/rota-compra");
let processar: typeof import("@/lib/pagamentos/processar");
let consultas: typeof import("@/lib/pagamentos/consultas");

beforeAll(async () => {
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  stripe = await import("@/lib/pagamentos/stripe");
  StripeFalso = (await import("@/lib/pagamentos/stripe-falso")).StripeFalso;
  acoes = await import("@/lib/actions/pagamentos");
  acoesO = await import("@/lib/actions/ofertas");
  rota = await import("@/lib/pagamentos/rota-compra");
  processar = await import("@/lib/pagamentos/processar");
  consultas = await import("@/lib/pagamentos/consultas");
});

afterEach(() => stripe.usarGatewayStripe(undefined));

const comprar = (slug: string, query: string, h: Headers = cabecalhos(slug)) => rota.atenderCompra(new Request(`http://${slug}.localhost:3011/api/stripe/checkout?${query}`, { headers: h }), stripe.gatewayStripe());

describe("pagamentos — actions e permissões", () => {
  it("ofertas/cupons/afiliados: equipe sim, aluno não; trava de versão; curso de outro criador recusado", async () => {
    const { criador: A, produto } = await lojaPronta();
    const { criador: B, produto: produtoB } = await lojaPronta();
    const admin = await novoUsuario();
    const aluno = await novoUsuario();
    await vincular(A.id, admin.id, "ADMIN");
    await vincular(A.id, aluno.id, "ALUNO");
    const nova = { tipo: "AVULSO", nome: "Curso + bônus", precoCentavos: 29700, produtoIds: [produto.id] };

    req.h = await cabecalhosLogados(aluno.email, A.slug);
    expect(await acoesO.acaoCriarOferta(nova)).toEqual({ ok: false, erro: "Sem permissão para esta ação." });
    expect(await acoesO.acaoCriarCupom({ codigo: "X10", tipo: "PERCENTUAL", percentualBps: 1000 })).toMatchObject({ ok: false, erro: "Sem permissão para esta ação." });
    expect(await acoesO.acaoCriarAfiliado({ nome: "Ana", email: "ana@exemplo.com", comissaoBps: 3000 })).toMatchObject({ ok: false, erro: "Sem permissão para esta ação." });

    req.h = await cabecalhosLogados(admin.email, A.slug);
    expect(await acoesO.acaoCriarOferta({ ...nova, produtoIds: [produtoB.id] })).toEqual({ ok: false, erro: "Curso não encontrado." });
    expect(await acoesO.acaoCriarOferta({ ...nova, tipo: "ASSINATURA" })).toMatchObject({ ok: false, erro: expect.stringMatching(/intervalo/) });
    expect(await acoesO.acaoCriarOferta({ ...nova, precoCentavos: 99 })).toMatchObject({ ok: false, erro: "Preço mínimo de R$ 1,00." });
    expect(await acoesO.acaoCriarOferta({ ...nova, precoCentavos: 10.5 })).toMatchObject({ ok: false });
    const o = await acoesO.acaoCriarOferta(nova);
    if (!o.ok) throw new Error(o.erro);
    const salvo = await acoesO.acaoSalvarOferta({ ofertaId: o.dados.id, versao: o.dados.versao, nome: "Curso + 2 bônus", precoCentavos: 24700, produtoIds: [produto.id] });
    expect(salvo.ok).toBe(true);
    expect(await acoesO.acaoSalvarOferta({ ofertaId: o.dados.id, versao: o.dados.versao, nome: "Outro", precoCentavos: 100, produtoIds: [produto.id] })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado/) });

    const c = await acoesO.acaoCriarCupom({ codigo: "black-10", tipo: "PERCENTUAL", percentualBps: 1000, ofertaId: o.dados.id });
    expect(c).toMatchObject({ ok: true });
    expect(await acoesO.acaoCriarCupom({ codigo: "BLACK10", tipo: "VALOR", valorCentavos: 500 })).toEqual({ ok: false, erro: "Já existe um cupom com este código." });
    expect(await acoesO.acaoCriarCupom({ codigo: "OUTRA", tipo: "VALOR", valorCentavos: 500, percentualBps: 10 })).toMatchObject({ ok: false });
    const af = await acoesO.acaoCriarAfiliado({ nome: "Ana Souza", email: "Ana@Exemplo.com", comissaoBps: 3000 });
    expect(af).toMatchObject({ ok: true, dados: { codigo: expect.stringMatching(/^[A-Z0-9]{8}$/) } });

    // B não vê nem mexe no que é de A (o host decide o criador).
    const donoB = await novoUsuario();
    await vincular(B.id, donoB.id, "DONO");
    req.h = await cabecalhosLogados(donoB.email, B.slug);
    if (!salvo.ok) throw new Error(salvo.erro);
    expect(await acoesO.acaoExcluirOferta({ ofertaId: o.dados.id, versao: salvo.dados.versao })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado/) });
    expect((await consultas.listarOfertas(B.id, B.slug)).map((x) => x.id)).not.toContain(o.dados.id);
    // A FK composta recusa venda de B apontando para oferta de A.
    await expect(
      db.insert(s.criadores_vendas).values({ criador_id: B.id, oferta_id: o.dados.id, tipo: "AVULSO", checkout_sessao_id: "cs_x_fk", valor_centavos: 100, taxa_bps: 800, taxa_centavos: 8, modified_by: donoB.id }),
    ).rejects.toThrow();
  });

  it("conectar Stripe: só DONO; sem chave = mensagem clara; conta única por criador; status pela API", async () => {
    const { criador: A } = await lojaPronta();
    await db.update(s.criadores_stripe_contas).set({ is_deleted: true, deleted_at: new Date() }).where(eq(s.criadores_stripe_contas.criador_id, A.id));
    const dono = await novoUsuario();
    const admin = await novoUsuario();
    await vincular(A.id, dono.id, "DONO");
    await vincular(A.id, admin.id, "ADMIN");

    req.h = await cabecalhosLogados(admin.email, A.slug);
    expect(await acoes.acaoConectarStripe()).toEqual({ ok: false, erro: "Sem permissão para esta ação." });
    req.h = await cabecalhosLogados(dono.email, A.slug);
    expect(await acoes.acaoConectarStripe()).toEqual({ ok: false, erro: "Pagamentos não configurados nesta plataforma." });

    const falso = new StripeFalso();
    stripe.usarGatewayStripe(falso);
    const r1 = await acoes.acaoConectarStripe();
    const r2 = await acoes.acaoConectarStripe();
    expect(r1).toMatchObject({ ok: true, dados: { url: expect.stringContaining(encodeURIComponent("/admin/configuracoes/pagamentos?stripe=retorno")) } });
    expect(r2.ok).toBe(true);
    const vivas = await db.select().from(s.criadores_stripe_contas).where(eq(s.criadores_stripe_contas.criador_id, A.id));
    expect(vivas.filter((c) => !c.is_deleted)).toHaveLength(1);
    const contaId = vivas.find((c) => !c.is_deleted)!.conta_id;
    expect((await consultas.contaStripe(A.id))).toMatchObject({ conectada: true, cobrancasAtivas: false, taxaBps: 800 });

    falso.contas.set(contaId, { cobrancasAtivas: true, repassesAtivos: false, dadosEnviados: true });
    expect(await acoes.acaoAtualizarContaStripe()).toMatchObject({ ok: true, dados: { cobrancasAtivas: true } });
    expect((await consultas.contaStripe(A.id))).toMatchObject({ cobrancasAtivas: true, repassesAtivos: false, dadosEnviados: true });
  });

  it("taxa do criador: só SUPER_ADMIN no apex, com trava e limites", async () => {
    const { criador: A, dono } = await lojaPronta();
    req.h = await cabecalhosLogados(dono.email, A.slug);
    expect(await acoes.acaoMudarTaxaCriador({ criadorId: A.id, versao: A.updated_at.toISOString(), taxaBps: 500 })).toEqual({ ok: false, erro: "Sem permissão para esta ação." });
    const sa = await superAdminPleno(null);
    req.h = sa.h;
    const [atual] = await db.select().from(s.criadores).where(eq(s.criadores.id, A.id));
    expect(await acoes.acaoMudarTaxaCriador({ criadorId: A.id, versao: atual.updated_at.toISOString(), taxaBps: 5001 })).toMatchObject({ ok: false, erro: "Taxa máxima de 50%." });
    expect(await acoes.acaoMudarTaxaCriador({ criadorId: A.id, versao: atual.updated_at.toISOString(), taxaBps: 650 })).toMatchObject({ ok: true });
    expect(await acoes.acaoMudarTaxaCriador({ criadorId: A.id, versao: atual.updated_at.toISOString(), taxaBps: 700 })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado/) });
    expect((await consultas.pagamentosDosCriadores()).find((c) => c.criadorId === A.id)?.taxaBps).toBe(650);
    const [trilha] = await db.select().from(s.auditoria).where(eq(s.auditoria.detalhes, `Taxa da plataforma de ${A.slug}: 8% → 6.5%`));
    expect(trilha.user_id).toBe(sa.usuario.id);
  });
});

describe("pagamentos — link de compra, reembolso e leituras", () => {
  it("abre o Checkout NA conta do criador com taxa customizada, cupom e afiliado; recusa o que não vale", async () => {
    const { criador: A, contaId, oferta, dono } = await lojaPronta({ preco: 20000 });
    const B = await lojaPronta();
    await db.update(s.criadores).set({ taxa_plataforma_bps: 1000 }).where(eq(s.criadores.id, A.id));
    const [af] = await db.insert(s.criadores_afiliados).values({ criador_id: A.id, nome: "Ana", email: "ana@exemplo.com", codigo: "ANA2026", comissao_bps: 3000, modified_by: dono.id }).returning();
    await db.insert(s.criadores_cupons).values({ criador_id: A.id, codigo: "DEZ", tipo: "PERCENTUAL", percentual_bps: 1000, limite_usos: 1, modified_by: dono.id });

    expect((await comprar(A.slug, `oferta=${oferta.id}`)).status).toBe(503); // sem chave
    const falso = new StripeFalso();
    stripe.usarGatewayStripe(falso);
    const r = await comprar(A.slug, `oferta=${oferta.id}&afiliado=ana-2026&cupom=dez`);
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const [chamada] = falso.checkouts;
    expect(chamada.contaId).toBe(contaId); // direct charge: na conta conectada (stripeAccount)
    expect(chamada.params.line_items?.[0].price_data?.unit_amount).toBe(18000);
    expect(chamada.params.payment_intent_data?.application_fee_amount).toBe(1800); // 10% de 180,00
    const [venda] = await db.select().from(s.criadores_vendas).where(eq(s.criadores_vendas.checkout_sessao_id, chamada.id));
    expect(venda).toMatchObject({ criador_id: A.id, afiliado_id: af.id, valor_centavos: 18000, desconto_centavos: 2000, taxa_bps: 1000, taxa_centavos: 1800, comissao_centavos: 4860, membro_id: null, situacao: "PENDENTE" });
    expect(chamada.idempotencia).toBe(`checkout-${venda.id}`);

    // Oferta de A pelo host de B, oferta pausada, afiliado inexistente (ignorado) e cupom esgotado.
    expect(await (await comprar(B.criador.slug, `oferta=${oferta.id}`)).text()).toBe("Oferta indisponível.");
    expect((await comprar(A.slug, `oferta=${oferta.id}&afiliado=NAOEXISTE`)).status).toBe(303);
    expect(falso.checkouts.at(-1)!.params.payment_intent_data?.application_fee_amount).toBe(2000);
    await processar.processarEventoStripe(falso, falso.publicarEvento(contaId, "checkout.session.completed", sessaoPaga(chamada.id)).id, contaId);
    expect(await (await comprar(A.slug, `oferta=${oferta.id}&cupom=DEZ`)).text()).toBe("Este cupom esgotou.");
    await db.update(s.criadores_ofertas).set({ situacao: "PAUSADA" }).where(eq(s.criadores_ofertas.id, oferta.id));
    expect((await comprar(A.slug, `oferta=${oferta.id}`)).status).toBe(400);

    // Logado: e-mail fixo e venda já com o membro.
    await db.update(s.criadores_ofertas).set({ situacao: "ATIVA" }).where(eq(s.criadores_ofertas.id, oferta.id));
    const aluno = await novoUsuario();
    const m = await vincular(A.id, aluno.id, "ALUNO");
    await comprar(A.slug, `oferta=${oferta.id}`, await cabecalhosLogados(aluno.email, A.slug));
    expect(falso.checkouts.at(-1)!.params.customer_email).toBe(aluno.email);
    const [doAluno] = await db.select().from(s.criadores_vendas).where(eq(s.criadores_vendas.checkout_sessao_id, falso.checkouts.at(-1)!.id));
    expect(doAluno.membro_id).toBe(m.id);

    // Leituras: afiliado com 1 venda paga e comissão; resumo do período.
    const [afl] = await consultas.listarAfiliados(A.id);
    expect(afl).toMatchObject({ codigo: "ANA2026", vendas: 1, vendidoCentavos: 18000, comissaoCentavos: 4860 });
    expect(await consultas.resumoFinanceiro(A.id)).toEqual({ vendas: 1, brutoCentavos: 18000, descontosCentavos: 2000, reembolsadoCentavos: 0, taxaPlataformaCentavos: 1800, comissoesCentavos: 4860, liquidoEstimadoCentavos: 16200 });
    const lista = await consultas.listarVendas(A.id, { situacao: "PAGA", pagina: 1, porPagina: 10 });
    expect(lista.total).toBe(1);
    expect(lista.linhas[0]).toMatchObject({ afiliado: "Ana", cupom: "DEZ", liquidoEstimadoCentavos: 16200 });
    expect((await consultas.listarVendas(B.criador.id, { pagina: 1, porPagina: 10 })).linhas.map((v) => v.id)).not.toContain(venda.id);
  });

  it("reembolso: só DONO; chama o Stripe na conta certa e encerra o acesso", async () => {
    const { criador: A, contaId, oferta, produto, dono } = await lojaPronta({ preco: 10000 });
    const admin = await novoUsuario();
    await vincular(A.id, admin.id, "ADMIN");
    const falso = new StripeFalso();
    stripe.usarGatewayStripe(falso);
    await comprar(A.slug, `oferta=${oferta.id}`);
    const sessao = sessaoPaga(falso.checkouts[0].id);
    await processar.processarEventoStripe(falso, falso.publicarEvento(contaId, "checkout.session.completed", sessao).id, contaId);
    const [v] = await db.select().from(s.criadores_vendas).where(eq(s.criadores_vendas.checkout_sessao_id, sessao.id));

    req.h = await cabecalhosLogados(admin.email, A.slug);
    expect(await acoes.acaoReembolsarVenda({ vendaId: v.id, versao: v.updated_at.toISOString() })).toEqual({ ok: false, erro: "Sem permissão para esta ação." });
    req.h = await cabecalhosLogados(dono.email, A.slug);
    expect(await acoes.acaoReembolsarVenda({ vendaId: v.id, versao: v.updated_at.toISOString() })).toEqual({ ok: true, dados: { matriculasCanceladas: 1 } });
    expect(falso.reembolsos).toEqual([{ contaId, paymentIntentId: sessao.payment_intent, idempotencia: `reembolso-${v.id}` }]);
    const [depois] = await db.select().from(s.criadores_vendas).where(eq(s.criadores_vendas.id, v.id));
    expect(depois).toMatchObject({ situacao: "REEMBOLSADA", reembolsado_centavos: 10000, taxa_devolvida_centavos: 800 });
    const [mat] = await db.select().from(s.produtos_matriculas).where(eq(s.produtos_matriculas.produto_id, produto.id));
    expect(mat.status).toBe("CANCELADA");
    // O charge.refunded que chega depois não muda nada; reembolsar de novo é recusado.
    await processar.processarEventoStripe(falso, falso.publicarEvento(contaId, "charge.refunded", { id: "ch_r", payment_intent: sessao.payment_intent, amount_refunded: 10000 }).id, contaId);
    expect(await consultas.resumoFinanceiro(A.id)).toMatchObject({ brutoCentavos: 10000, reembolsadoCentavos: 10000, taxaPlataformaCentavos: 0, liquidoEstimadoCentavos: 0 });
    expect(await acoes.acaoReembolsarVenda({ vendaId: v.id, versao: depois.updated_at.toISOString() })).toMatchObject({ ok: false, erro: expect.stringMatching(/Só venda paga/) });
  });

  it("oferta sem curso vivo não vende", async () => {
    const { criador: A, oferta, produto, dono } = await lojaPronta();
    const falso = new StripeFalso();
    stripe.usarGatewayStripe(falso);
    await db.update(s.produtos).set({ is_deleted: true, deleted_at: new Date(), modified_by: dono.id }).where(eq(s.produtos.id, produto.id));
    expect(await (await comprar(A.slug, `oferta=${oferta.id}`)).text()).toBe("Oferta indisponível.");
    expect(falso.checkouts).toHaveLength(0);
  });
});
