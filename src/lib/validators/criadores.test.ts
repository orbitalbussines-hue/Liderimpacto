import { describe, expect, it } from "vitest";
import { slugSchema } from "./criadores";

describe("slug do criador", () => {
  it("normaliza caixa e espacos e aceita [a-z0-9-] sem hifen nas pontas", () => {
    expect(slugSchema.parse("  Lider-De-Impacto ")).toBe("lider-de-impacto");
    expect(slugSchema.parse("a1")).toBe("a1");
  });

  it("recusa reservados, acento, espaco, ponto, hifen nas pontas e mais de 63", () => {
    for (const ruim of ["www", "admin", "api", "app", "plataforma", "ação", "a b", "a.b", "-a", "a-", "", "a".repeat(64)]) {
      expect(slugSchema.safeParse(ruim).success, ruim).toBe(false);
    }
  });
});
