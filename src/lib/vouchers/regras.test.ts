import { describe, expect, it } from "vitest";
import {
  ALFABETO_VOUCHER,
  RE_CODIGO_VOUCHER,
  expiracaoDoResgate,
  formatarCodigoVoucher,
  gerarCodigoVoucher,
  motivoRecusaResgate,
  normalizarCodigoVoucher,
  transicaoVoucherValida,
} from "./regras";

describe("código do voucher", () => {
  it("alfabeto sem 0/O/1/I, 32 símbolos, gerado sempre válido", () => {
    expect(ALFABETO_VOUCHER).toHaveLength(32);
    expect(ALFABETO_VOUCHER).not.toMatch(/[0O1I]/);
    for (let i = 0; i < 200; i++) expect(gerarCodigoVoucher()).toMatch(RE_CODIGO_VOUCHER);
    expect(gerarCodigoVoucher(8, () => new Uint8Array([0, 31, 32, 255, 8, 9, 10, 23]))).toBe("A9A9JKLZ");
  });

  it("normaliza caixa, espaço e hífen; não corrige ambíguos", () => {
    expect(normalizarCodigoVoucher(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(RE_CODIGO_VOUCHER.test(normalizarCodigoVoucher("lider2026"))).toBe(false); // I e 0
    expect(formatarCodigoVoucher("ABCDEFGHJK")).toBe("ABCD-EFGH-JK");
  });
});

describe("resgate", () => {
  const agora = new Date("2026-10-17T12:00:00Z");
  const base = { situacao: "ATIVO" as const, validoAte: null, limiteUsos: null, limitePorPessoa: 1, usos: 0, usosDaPessoa: 0 };

  it("recusa na ordem: encerrado, pausado, expirado, esgotado, limite da pessoa", () => {
    expect(motivoRecusaResgate(base, agora)).toBeNull();
    expect(motivoRecusaResgate({ ...base, situacao: "ENCERRADO", usos: 9, limiteUsos: 1 }, agora)).toBe("ENCERRADO");
    expect(motivoRecusaResgate({ ...base, situacao: "PAUSADO" }, agora)).toBe("PAUSADO");
    expect(motivoRecusaResgate({ ...base, validoAte: agora }, agora)).toBe("EXPIRADO");
    expect(motivoRecusaResgate({ ...base, limiteUsos: 3, usos: 3 }, agora)).toBe("ESGOTADO");
    expect(motivoRecusaResgate({ ...base, limitePorPessoa: 2, usosDaPessoa: 2 }, agora)).toBe("LIMITE_PESSOA");
    expect(motivoRecusaResgate({ ...base, limitePorPessoa: 2, usosDaPessoa: 1 }, agora)).toBeNull();
  });

  it("encerrado é final; expiração da matrícula em dias", () => {
    expect(transicaoVoucherValida("ATIVO", "PAUSADO")).toBe(true);
    expect(transicaoVoucherValida("PAUSADO", "ATIVO")).toBe(true);
    expect(transicaoVoucherValida("ENCERRADO", "ATIVO")).toBe(false);
    expect(transicaoVoucherValida("ATIVO", "ATIVO")).toBe(false);
    expect(expiracaoDoResgate(null, agora)).toBeNull();
    expect(expiracaoDoResgate(30, agora)?.toISOString()).toBe("2026-11-16T12:00:00.000Z");
  });
});
