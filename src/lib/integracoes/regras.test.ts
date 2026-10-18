import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eduzzContrato, eduzzFatura, hotmartAssinaturaCancelada, hotmartCompra } from "../../../tests/integracoes/exemplos";
import { assinaturaEduzzConfere, hottokConfere } from "./autenticidade";
import { acessoAte, chaveDoAcesso, DIA_MS, normalizarEduzz, normalizarHotmart, referenciaDoAcesso, urlDoWebhook } from "./regras";

describe("autenticidade", () => {
  it("hottok: só o token exato", () => {
    expect(hottokConfere("abc12345", "abc12345")).toBe(true);
    expect(hottokConfere(" abc12345 ", "abc12345")).toBe(true);
    expect(hottokConfere("abc1234", "abc12345")).toBe(false);
    expect(hottokConfere(null, "abc12345")).toBe(false);
  });

  it("Eduzz: HMAC-SHA256 do corpo cru em hex ou base64; corpo adulterado recusa", () => {
    const corpo = JSON.stringify(eduzzFatura());
    const mac = createHmac("sha256", "chave-secreta").update(corpo).digest();
    expect(assinaturaEduzzConfere(mac.toString("hex"), "chave-secreta", corpo)).toBe(true);
    expect(assinaturaEduzzConfere(mac.toString("hex").toUpperCase(), "chave-secreta", corpo)).toBe(true);
    expect(assinaturaEduzzConfere(mac.toString("base64"), "chave-secreta", corpo)).toBe(true);
    expect(assinaturaEduzzConfere(mac.toString("hex"), "outra-chave", corpo)).toBe(false);
    expect(assinaturaEduzzConfere(mac.toString("hex"), "chave-secreta", `${corpo} `)).toBe(false);
    expect(assinaturaEduzzConfere(null, "chave-secreta", corpo)).toBe(false);
  });
});

describe("tradução da Hotmart", () => {
  it("compra aprovada avulsa", () => {
    const p = hotmartCompra({ transacao: "HP0000000001", produtoId: 42, email: "Maria@Teste.Local" });
    const [e] = normalizarHotmart(p)!;
    expect(e).toMatchObject({ eventoId: p.id, tipo: "COMPRA_APROVADA", transacao: "HP0000000001", assinatura: null, produtoExterno: "42", email: "maria@teste.local", proximaCobranca: null });
  });

  it("assinatura: código do assinante e próxima cobrança; cancelamento traz o assinante em data.subscriber", () => {
    const prox = new Date("2027-01-10T12:00:00Z");
    const [e] = normalizarHotmart(hotmartCompra({ assinante: "SUB00001", proximaCobranca: prox }))!;
    expect(e).toMatchObject({ assinatura: "SUB00001", proximaCobranca: prox });
    const [c] = normalizarHotmart(hotmartAssinaturaCancelada({ assinante: "SUB00001", proximaCobranca: prox }))!;
    expect(c).toMatchObject({ tipo: "ASSINATURA_CANCELADA", assinatura: "SUB00001", transacao: null, proximaCobranca: prox });
  });

  it("mapa dos eventos e formato inválido", () => {
    const tipo = (evento: string) => normalizarHotmart(hotmartCompra({ evento }))![0].tipo;
    expect(tipo("PURCHASE_COMPLETE")).toBe("COMPRA_APROVADA");
    expect(tipo("PURCHASE_REFUNDED")).toBe("REEMBOLSO");
    expect(tipo("PURCHASE_CHARGEBACK")).toBe("CHARGEBACK");
    expect(tipo("PURCHASE_CANCELED")).toBe("CANCELAMENTO");
    expect(tipo("PURCHASE_DELAYED")).toBe("ASSINATURA_ATRASADA");
    expect(tipo("PURCHASE_BILLET_PRINTED")).toBe("OUTRO");
    expect(normalizarHotmart({ event: "PURCHASE_APPROVED" })).toBeNull();
    expect(normalizarHotmart(null)).toBeNull();
    // id com caractere fora da lista não entra (vira nulo, nunca vai cru ao banco)
    expect(normalizarHotmart(hotmartCompra({ transacao: "HP 1;drop" }))![0].transacao).toBeNull();
  });
});

describe("tradução da Eduzz", () => {
  it("fatura paga: um recibo por produto; recorrência usa o contrato como assinatura", () => {
    const p = eduzzFatura({ faturaId: "12345678", itens: [{ productId: "P567", billingType: "recurrence" }, { productId: "P789", isBump: true }], contratoId: "C1" });
    const es = normalizarEduzz(p)!;
    expect(es.map((e) => [e.eventoId, e.produtoExterno])).toEqual([
      [p.id, "P567"],
      [`${p.id}-2`, "P789"],
    ]);
    expect(es[0]).toMatchObject({ tipo: "COMPRA_APROVADA", transacao: "12345678", assinatura: "C1" });
    expect(normalizarEduzz(eduzzFatura({ contratoId: "C2" }))![0].assinatura).toBeNull();
  });

  it("reembolso, chargeback, cancelamento, contrato e ping", () => {
    expect(normalizarEduzz(eduzzFatura({ evento: "myeduzz.invoice_refunded" }))![0].tipo).toBe("REEMBOLSO");
    expect(normalizarEduzz(eduzzFatura({ evento: "myeduzz.invoice_chargeback" }))![0].tipo).toBe("CHARGEBACK");
    expect(normalizarEduzz(eduzzFatura({ evento: "myeduzz.invoice_canceled" }))![0].tipo).toBe("CANCELAMENTO");
    expect(normalizarEduzz(eduzzContrato({ contratoId: "C9", status: "canceled" }))![0]).toMatchObject({ tipo: "ASSINATURA_CANCELADA", assinatura: "C9" });
    expect(normalizarEduzz(eduzzContrato({ contratoId: "C9", status: "late" }))![0].tipo).toBe("ASSINATURA_ATRASADA");
    expect(normalizarEduzz(eduzzContrato({ contratoId: "C9", status: "upToDate" }))![0].tipo).toBe("OUTRO");
    expect(normalizarEduzz({ id: "l927c4root16a9zvq8v78lcr6", event: "ping", data: { message: "ping" }, sentDate: "2025-05-27T19:42:47.103Z" })![0]).toMatchObject({ tipo: "OUTRO", produtoExterno: null });
  });
});

describe("acesso", () => {
  it("referência estável: assinatura usa o código; avulsa, a transação", () => {
    expect(chaveDoAcesso("HOTMART", { transacao: "HP1", assinatura: null })).toBe("hotmart:HP1");
    expect(chaveDoAcesso("HOTMART", { transacao: "HP1", assinatura: "SUB1" })).toBe("hotmart-assinatura:SUB1");
    expect(chaveDoAcesso("EDUZZ", { transacao: null, assinatura: null })).toBeNull();
    expect(referenciaDoAcesso("eduzz:123", "abc")).toBe("eduzz:123:abc");
  });

  it("prazo: próxima cobrança + 3 dias; senão os dias do mapeamento; sem dias = vitalício", () => {
    const agora = new Date("2026-10-18T12:00:00Z");
    const prox = new Date("2026-11-18T12:00:00Z");
    expect(acessoAte({ proximaCobranca: prox, diasAcesso: 10 }, agora)).toEqual(new Date(prox.getTime() + 3 * DIA_MS));
    expect(acessoAte({ proximaCobranca: null, diasAcesso: 10 }, agora)).toEqual(new Date(agora.getTime() + 10 * DIA_MS));
    expect(acessoAte({ proximaCobranca: null, diasAcesso: null }, agora)).toBeNull();
  });

  it("URL do webhook no apex", () => {
    expect(urlDoWebhook("https://lideresdeimpacto.com.br/", "HOTMART", "id-1")).toBe("https://lideresdeimpacto.com.br/api/integracoes/hotmart/id-1");
  });
});
