import { describe, expect, it } from "vitest";
import { centesimos, formatarPercentual, textoDeCentesimos } from "./valores";

describe("valores digitados (reais e percentual → centésimos)", () => {
  it("aceita vírgula, milhar e ponto decimal", () => {
    expect(centesimos("97,00")).toBe(9700);
    expect(centesimos("97")).toBe(9700);
    expect(centesimos(" 97,5 ")).toBe(9750);
    expect(centesimos("R$ 1.234,56")).toBe(123456);
    expect(centesimos("97.50")).toBe(9750);
    expect(centesimos("1.234")).toBe(123400);
    expect(centesimos("8,25")).toBe(825);
    expect(centesimos("0,07")).toBe(7);
  });

  it("recusa o que não é valor", () => {
    for (const t of ["", "abc", "97,001", "-5", "9,7,0", "1.23,00", "97,"]) expect(centesimos(t)).toBeNull();
  });

  it("volta para o campo e formata percentual", () => {
    expect(textoDeCentesimos(9700)).toBe("97,00");
    expect(textoDeCentesimos(105)).toBe("1,05");
    expect(formatarPercentual(825)).toBe("8,25%");
    expect(formatarPercentual(800)).toBe("8%");
  });
});
