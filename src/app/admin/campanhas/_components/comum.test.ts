import { describe, expect, it } from "vitest";
import { pessoas, tempoEstimado } from "./comum";

describe("tempoEstimado", () => {
  const teto = { hora: 100, dia: 1000 };
  it("arredonda para 10 min no teto por hora", () => {
    expect(tempoEstimado(138, teto)).toBe("cerca de 1h30");
    expect(tempoEstimado(200, teto)).toBe("cerca de 2h");
    expect(tempoEstimado(60, teto)).toBe("em até 1 hora");
    expect(tempoEstimado(0, teto)).toBe("");
  });
  it("acima do teto diário conta em dias", () => {
    expect(tempoEstimado(2500, teto)).toBe("cerca de 3 dias");
  });
  it("singular e plural", () => {
    expect(pessoas(1)).toBe("1 pessoa");
    expect(pessoas(1380)).toBe("1.380 pessoas");
  });
});
