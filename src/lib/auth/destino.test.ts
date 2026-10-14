import { describe, expect, it } from "vitest";
import { destinoSeguro } from "./destino";

describe("destino pos-login (open redirect)", () => {
  it("aceita so caminho interno", () => {
    expect(destinoSeguro("/admin/conteudos?aba=1")).toBe("/admin/conteudos?aba=1");
    expect(destinoSeguro("/conta/seguranca")).toBe("/conta/seguranca");
  });

  it("recusa outro dominio, esquema e lixo", () => {
    for (const ruim of ["//evil.com", "https://evil.com", "/\\evil.com","javascript:alert(1)", "evil.com", "", null, 42, "/a b"]) {
      expect(destinoSeguro(ruim)).toBe("/");
    }
  });
});
