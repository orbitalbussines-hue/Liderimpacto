import { describe, expect, it } from "vitest";
import { saudacaoPorHorario } from "./saudacao";

// São Paulo = UTC-3 o ano todo (sem horário de verão desde 2019).
const sp = (hora: number, min = 0) => new Date(Date.UTC(2026, 8, 21, hora + 3, min));

describe("saudacaoPorHorario", () => {
  it("manhã", () => {
    expect(saudacaoPorHorario(sp(5))).toBe("Bom dia");
    expect(saudacaoPorHorario(sp(11, 59))).toBe("Bom dia");
  });
  it("tarde", () => {
    expect(saudacaoPorHorario(sp(12))).toBe("Boa tarde");
    expect(saudacaoPorHorario(sp(17, 59))).toBe("Boa tarde");
  });
  it("noite e madrugada", () => {
    expect(saudacaoPorHorario(sp(18))).toBe("Boa noite");
    expect(saudacaoPorHorario(sp(0))).toBe("Boa noite");
    expect(saudacaoPorHorario(sp(4, 59))).toBe("Boa noite");
  });
  it("usa o fuso de São Paulo, não o do servidor", () => {
    // 02:00 UTC = 23:00 em SP (noite), mesmo sendo "madrugada" em UTC.
    expect(saudacaoPorHorario(new Date(Date.UTC(2026, 8, 21, 2, 0)))).toBe("Boa noite");
    // 15:00 UTC = 12:00 em SP.
    expect(saudacaoPorHorario(new Date(Date.UTC(2026, 8, 21, 15, 0)))).toBe("Boa tarde");
  });
});
