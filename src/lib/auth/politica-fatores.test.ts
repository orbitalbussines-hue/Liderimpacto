import { describe, expect, it } from "vitest";
import { contaProvisoria, exige2FA } from "./politica-fatores";

describe("politica do segundo fator", () => {
  it("so SUPER_ADMIN e obrigado nesta fase", () => {
    expect(exige2FA("SUPER_ADMIN")).toBe(true);
    expect(exige2FA("NENHUM")).toBe(false);
  });

  it("SUPER_ADMIN sem TOTP confirmado fica provisorio", () => {
    const base = { papelPlataforma: "SUPER_ADMIN" as const };
    expect(contaProvisoria({ ...base, twoFactorEnabled: false, totpVerificado: false })).toBe(true);
    expect(contaProvisoria({ ...base, twoFactorEnabled: true, totpVerificado: false })).toBe(true);
    expect(contaProvisoria({ ...base, twoFactorEnabled: false, totpVerificado: true })).toBe(true);
    expect(contaProvisoria({ ...base, twoFactorEnabled: true, totpVerificado: true })).toBe(false);
  });

  it("conta comum nunca e provisoria", () => {
    expect(contaProvisoria({ papelPlataforma: "NENHUM", twoFactorEnabled: false, totpVerificado: false })).toBe(false);
  });
});
