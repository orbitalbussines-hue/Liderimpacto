import { describe, expect, it } from "vitest";
import {
  acessoAte,
  calcularComissao,
  calcularTaxa,
  descontoDoCupom,
  motivoCupomInvalido,
  normalizarCodigo,
  parametrosCheckout,
  percentualDaTaxa,
  porBps,
  situacaoDaAssinatura,
  somarMeses,
  taxaDevolvida,
  valoresDaVenda,
  type PedidoCheckout,
} from "./regras";

describe("taxa e comissão em centavos inteiros", () => {
  it("8% padrão e taxa customizada, arredondando meio-para-cima uma vez", () => {
    expect(calcularTaxa(9700, 800)).toBe(776);
    expect(calcularTaxa(19990, 800)).toBe(1599); // 1599,2
    expect(calcularTaxa(1, 800)).toBe(0);
    expect(calcularTaxa(7, 800)).toBe(1); // 0,56 → 1
    expect(calcularTaxa(6250, 800)).toBe(500);
    expect(calcularTaxa(12345, 1250)).toBe(1543); // 1543,125
    expect(calcularTaxa(100, 0)).toBe(0);
    expect(porBps(5, 1000)).toBe(1); // 0,5 → 1 (meio sobe)
  });

  it("não perde centavo em valores grandes (sem ponto flutuante)", () => {
    expect(calcularTaxa(100_000_000, 800)).toBe(8_000_000);
    expect(calcularTaxa(99_999_999, 733)).toBe(7_330_000); // 7329999,93 → sobe
    // Soma de 1000 vendas de R$ 0,10 com 8%: cada uma arredonda isolada (como o Stripe cobra por cobrança).
    expect(Array.from({ length: 1000 }, () => calcularTaxa(10, 800)).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(() => porBps(10.5, 800)).toThrow();
    expect(() => porBps(-1, 800)).toThrow();
  });

  it("comissão sobre (valor − taxa da plataforma)", () => {
    expect(calcularComissao(10000, 800, 3000)).toBe(2760);
    expect(valoresDaVenda({ precoCentavos: 19700, descontoCentavos: 1970, taxaBps: 800, comissaoBps: 4000 })).toEqual({
      valorCentavos: 17730,
      descontoCentavos: 1970,
      taxaCentavos: 1418, // 1418,4
      comissaoCentavos: 6525, // (17730 − 1418) × 40% = 6524,8
    });
    expect(valoresDaVenda({ precoCentavos: 5000, descontoCentavos: 0, taxaBps: 800, comissaoBps: null }).comissaoCentavos).toBe(0);
  });

  it("taxa devolvida proporcional ao reembolso", () => {
    expect(taxaDevolvida(800, 10000, 10000)).toBe(800);
    expect(taxaDevolvida(800, 10000, 5000)).toBe(400);
    expect(taxaDevolvida(777, 9999, 3333)).toBe(259);
    expect(taxaDevolvida(800, 10000, 20000)).toBe(800);
    expect(taxaDevolvida(0, 0, 0)).toBe(0);
  });

  it("percentual da assinatura com 2 casas", () => {
    expect(percentualDaTaxa(800)).toBe(8);
    expect(percentualDaTaxa(825)).toBe(8.25);
    expect(percentualDaTaxa(1)).toBe(0.01);
  });
});

describe("cupom", () => {
  const agora = new Date("2026-10-18T12:00:00Z");
  const base = { situacao: "ATIVO", validoAte: null, ofertaId: null, limiteUsos: null, usos: 0 };
  it("desconto percentual e fixo, nunca maior que o preço", () => {
    expect(descontoDoCupom(9700, { tipo: "PERCENTUAL", percentualBps: 1000, valorCentavos: null })).toBe(970);
    expect(descontoDoCupom(9700, { tipo: "VALOR", percentualBps: null, valorCentavos: 2000 })).toBe(2000);
    expect(descontoDoCupom(1500, { tipo: "VALOR", percentualBps: null, valorCentavos: 2000 })).toBe(1500);
  });
  it("motivos de recusa", () => {
    expect(motivoCupomInvalido(base, "o1", 5000, agora)).toBeNull();
    expect(motivoCupomInvalido({ ...base, situacao: "PAUSADO" }, "o1", 5000, agora)).toBe("SITUACAO");
    expect(motivoCupomInvalido({ ...base, validoAte: new Date("2026-10-18T11:59:59Z") }, "o1", 5000, agora)).toBe("VENCIDO");
    expect(motivoCupomInvalido({ ...base, ofertaId: "o2" }, "o1", 5000, agora)).toBe("OUTRA_OFERTA");
    expect(motivoCupomInvalido({ ...base, limiteUsos: 3, usos: 3 }, "o1", 5000, agora)).toBe("ESGOTADO");
    expect(motivoCupomInvalido(base, "o1", 99, agora)).toBe("PRECO_MINIMO");
  });
  it("código digitado com minúscula, espaço e hífen", () => {
    expect(normalizarCodigo(" black-friday 10 ")).toBe("BLACKFRIDAY10");
  });
});

describe("parâmetros da Checkout Session (direct charge)", () => {
  const pedido: PedidoCheckout = {
    vendaId: "v1",
    criadorId: "c1",
    oferta: { nome: "Curso Líder", tipo: "AVULSO", intervalo: null },
    valorCentavos: 19700,
    taxaCentavos: 1576,
    taxaBps: 800,
    email: null,
    urlSucesso: "https://a.exemplo.com/?compra=sucesso",
    urlCancelamento: "https://a.exemplo.com/?compra=cancelada",
  };

  it("avulso: application_fee_amount em centavos, BRL, cartão/Pix/boleto, sem e-mail fixo", () => {
    const p = parametrosCheckout(pedido);
    expect(p.mode).toBe("payment");
    expect(p.payment_intent_data).toEqual({ application_fee_amount: 1576, metadata: { venda_id: "v1", criador_id: "c1" } });
    expect(p.subscription_data).toBeUndefined();
    expect(p.line_items).toEqual([{ quantity: 1, price_data: { currency: "brl", unit_amount: 19700, product_data: { name: "Curso Líder" } } }]);
    expect(p.allowed_payment_method_types).toEqual(["card", "pix", "boleto"]);
    expect(p.client_reference_id).toBe("v1");
    expect(p).not.toHaveProperty("customer_email");
    expect(p.success_url).toBe(pedido.urlSucesso);
  });

  it("assinatura: application_fee_percent, recorrência e e-mail fixo de quem está logado", () => {
    const p = parametrosCheckout({ ...pedido, oferta: { nome: "Clube", tipo: "ASSINATURA", intervalo: "ANO" }, taxaBps: 825, email: "ana@exemplo.com" });
    expect(p.mode).toBe("subscription");
    expect(p.subscription_data).toEqual({ application_fee_percent: 8.25, metadata: { venda_id: "v1", criador_id: "c1" } });
    expect(p.payment_intent_data).toBeUndefined();
    expect(p.line_items?.[0].price_data?.recurring).toEqual({ interval: "year" });
    expect(p.customer_email).toBe("ana@exemplo.com");
  });
});

describe("prazos e situação", () => {
  const agora = new Date("2026-01-31T10:00:00Z");
  it("soma meses sem pular para o mês seguinte", () => {
    expect(somarMeses(agora, 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(somarMeses(agora, 12).toISOString()).toBe("2027-01-31T10:00:00.000Z");
  });
  it("acesso do avulso e da assinatura (+3 dias de tolerância)", () => {
    expect(acessoAte({ tipo: "AVULSO", diasAcesso: null, intervalo: null }, agora)).toBeNull();
    expect(acessoAte({ tipo: "AVULSO", diasAcesso: 30, intervalo: null }, agora)?.toISOString()).toBe("2026-03-02T10:00:00.000Z");
    expect(acessoAte({ tipo: "ASSINATURA", diasAcesso: null, intervalo: "MES" }, agora)?.toISOString()).toBe("2026-03-03T10:00:00.000Z");
    expect(acessoAte({ tipo: "ASSINATURA", diasAcesso: null, intervalo: "MES", periodoFim: new Date("2026-05-01T00:00:00Z") }, agora)?.toISOString()).toBe("2026-05-04T00:00:00.000Z");
  });
  it("status do Stripe → situação", () => {
    expect(situacaoDaAssinatura("active")).toBe("ATIVA");
    expect(situacaoDaAssinatura("past_due")).toBe("ATRASADA");
    expect(situacaoDaAssinatura("canceled")).toBe("CANCELADA");
    expect(situacaoDaAssinatura("incomplete_expired")).toBe("CANCELADA");
    expect(situacaoDaAssinatura("algo_novo")).toBe("INCOMPLETA");
  });
});
