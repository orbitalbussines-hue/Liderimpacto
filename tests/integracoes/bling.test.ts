import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assinarBling, blingAviso, blingPedido } from "./exemplos";
import { assinaturaBlingConfere } from "@/lib/integracoes/autenticidade";
import { hmacDoCpf } from "@/lib/integracoes/bling/cpf";
import { conferirEstado, assinarEstado } from "@/lib/integracoes/bling/oauth";
import { cpfValido, idsDaListaDePedidos, lerPedidoBling, normalizarBling, normalizarNumeroLoja, situacaoDoPedido } from "@/lib/integracoes/bling/regras";
import { normalizar } from "@/lib/integracoes/regras";
import { cpfSchema, resgateCodigoSchema, resgatePedidoSchema } from "@/lib/validators/resgate-publico";

/** Regras puras do Bling (ADR-0024): aviso, pedido lido, CPF, assinatura, state do OAuth e validação do resgate. */

const CPF = "529.982.247-25"; // CPF de exemplo (válido, fictício)

describe("CPF", () => {
  it("confere os dois dígitos verificadores e recusa repetidos", () => {
    expect(cpfValido(CPF)).toBe(true);
    expect(cpfValido("11144477735")).toBe(true);
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("5299822472")).toBe(false);
  });

  it("HMAC: 64 hex, igual com ou sem pontuação, diferente por criador", () => {
    const a = hmacDoCpf("criador-a", CPF);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacDoCpf("criador-a", "52998224725")).toBe(a);
    expect(hmacDoCpf("criador-b", CPF)).not.toBe(a);
    expect(a).not.toContain("52998224725");
  });
});

describe("aviso do Bling", () => {
  it("order.created/updated → PEDIDO_ATUALIZADO; deleted → PEDIDO_EXCLUIDO; transação = id do pedido", () => {
    const [c] = normalizarBling(blingAviso({ pedidoId: "12345678901", numeroLoja: "2000001" }))!;
    expect(c).toMatchObject({ tipo: "PEDIDO_ATUALIZADO", evento: "order.created", transacao: "12345678901", email: null });
    expect(normalizarBling(blingAviso({ evento: "order.updated", pedidoId: "1" }))![0].tipo).toBe("PEDIDO_ATUALIZADO");
    expect(normalizarBling(blingAviso({ evento: "order.deleted", pedidoId: "9" }))![0]).toMatchObject({ tipo: "PEDIDO_EXCLUIDO", transacao: "9" });
    // `normalizar` da plataforma encaminha para o Bling
    expect(normalizar("BLING", blingAviso({ pedidoId: "5" }))![0].transacao).toBe("5");
  });

  it("outro recurso vira OUTRO; sem eventId, ou pedido sem id numérico, é formato inválido", () => {
    expect(normalizarBling({ ...blingAviso({ pedidoId: "1" }), event: "product.created" })![0]).toMatchObject({ tipo: "OUTRO", transacao: null });
    expect(normalizarBling({ ...blingAviso({ pedidoId: "1" }), eventId: "" })).toBeNull();
    expect(normalizarBling({ ...blingAviso({ pedidoId: "1" }), data: { id: "abc" } })).toBeNull();
    expect(normalizarBling("lixo")).toBeNull();
  });

  it("assinatura: sha256=<hex> do corpo cru com o client secret; outro secret ou corpo mexido recusa", () => {
    const corpo = JSON.stringify(blingAviso({ pedidoId: "1" }));
    const sig = assinarBling("segredo-do-app", corpo);
    expect(assinaturaBlingConfere(sig, "segredo-do-app", corpo)).toBe(true);
    expect(assinaturaBlingConfere(sig.toUpperCase().replace("SHA256=", "sha256="), "segredo-do-app", corpo)).toBe(true);
    expect(assinaturaBlingConfere(sig, "outro-segredo", corpo)).toBe(false);
    expect(assinaturaBlingConfere(sig, "segredo-do-app", `${corpo} `)).toBe(false);
    expect(assinaturaBlingConfere(createHmac("sha256", "segredo-do-app").update(corpo).digest("hex"), "segredo-do-app", corpo)).toBe(false); // sem o prefixo
    expect(assinaturaBlingConfere(null, "segredo-do-app", corpo)).toBe(false);
  });
});

describe("pedido lido na API", () => {
  it("pega número da loja, documento só em dígitos, SKUs únicos e a situação", () => {
    const p = lerPedidoBling(blingPedido({ pedidoId: "777", numeroLoja: " 2000 0012 ", cpf: CPF, skus: ["LIVRO-01", "LIVRO-01", "KIT"] }))!;
    expect(p).toMatchObject({ id: "777", numeroLoja: "20000012", documento: "52998224725", skus: ["LIVRO-01", "KIT"], situacaoValor: 1 });
    expect(situacaoDoPedido(p)).toBe("VALIDO");
    expect(situacaoDoPedido({ situacaoValor: 2 })).toBe("CANCELADO");
    expect(situacaoDoPedido(null)).toBe("CANCELADO");
    expect(lerPedidoBling({ data: {} })).toBeNull();
    expect(idsDaListaDePedidos({ data: [{ id: 1 }, { id: "x" }, { id: 3 }] })).toEqual(["1", "3"]);
    expect(normalizarNumeroLoja(" 2000 01 ")).toBe("200001");
  });
});

describe("state do OAuth", () => {
  const agora = new Date("2026-10-31T12:00:00Z");
  it("vale só na mesma sessão e pessoa, até 10 minutos", () => {
    const e = assinarEstado({ integracaoId: "integ-1", sessaoId: "s1", usuarioId: "u1", agora });
    expect(conferirEstado(e, { sessaoId: "s1", usuarioId: "u1", agora })).toBe("integ-1");
    expect(conferirEstado(e, { sessaoId: "s2", usuarioId: "u1", agora })).toBeNull();
    expect(conferirEstado(e, { sessaoId: "s1", usuarioId: "u2", agora })).toBeNull();
    expect(conferirEstado(e, { sessaoId: "s1", usuarioId: "u1", agora: new Date(agora.getTime() + 11 * 60_000) })).toBeNull();
    expect(conferirEstado(e.replace("integ-1", "integ-2"), { sessaoId: "s1", usuarioId: "u1", agora })).toBeNull();
  });
});

describe("validação do resgate público", () => {
  const pessoa = { nome: "Maria Exemplo", email: "maria@teste.local" };
  it("pedido + CPF: limpa espaços e pontuação; CPF com dígito errado recusa", () => {
    expect(resgatePedidoSchema.parse({ numeroPedido: " 2000 0012345 ", cpf: CPF, ...pessoa })).toMatchObject({ numeroPedido: "20000012345", cpf: "52998224725" });
    expect(cpfSchema.safeParse("529.982.247-24").success).toBe(false);
    expect(cpfSchema.safeParse("abc").success).toBe(false);
    expect(resgatePedidoSchema.safeParse({ numeroPedido: "1", cpf: CPF, ...pessoa }).success).toBe(false);
    expect(resgatePedidoSchema.safeParse({ numeroPedido: "2000001<script>", cpf: CPF, ...pessoa }).success).toBe(false);
    expect(resgatePedidoSchema.safeParse({ numeroPedido: "2000001", cpf: CPF, ...pessoa, extra: 1 }).success).toBe(false);
  });

  it("código: mesmo formato do voucher", () => {
    expect(resgateCodigoSchema.safeParse({ codigo: "abcd-efgh", ...pessoa }).success).toBe(true);
    expect(resgateCodigoSchema.safeParse({ codigo: "", ...pessoa }).success).toBe(false);
  });
});
