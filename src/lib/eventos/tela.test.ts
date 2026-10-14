import { describe, expect, it } from "vitest";
import { aberturaDoLink, diaEMes, duracaoTexto, quandoPorExtenso, textoConfirmados, textoDaContagem } from "./tela";

const MIN = 60_000;
// 21/10/2026 19:30 em Brasília (UTC−3).
const inicio = new Date("2026-10-21T22:30:00.000Z");
const e = { inicioEm: inicio, fimEm: new Date(inicio.getTime() + 60 * MIN) };
const antes = (min: number) => new Date(inicio.getTime() - min * MIN);

describe("textoDaContagem", () => {
  it("minutos, horas, amanhã, dias, ao vivo e encerrado", () => {
    expect(textoDaContagem(e, antes(12))).toBe("Começa em 12 min");
    expect(textoDaContagem(e, antes(0.5))).toBe("Começa em 1 min");
    expect(textoDaContagem(e, antes(200))).toBe("Começa em 3 h 20 min");
    expect(textoDaContagem(e, antes(120))).toBe("Começa em 2 h");
    expect(textoDaContagem(e, new Date("2026-10-20T12:00:00.000Z"))).toBe("Amanhã");
    expect(textoDaContagem(e, new Date("2026-10-17T12:00:00.000Z"))).toBe("Em 4 dias");
    expect(textoDaContagem(e, inicio)).toBe("Ao vivo agora");
    expect(textoDaContagem(e, e.fimEm)).toBe("Encerrado");
  });
});

describe("formatos", () => {
  it("por extenso e bloco de data em Brasília", () => {
    expect(quandoPorExtenso(inicio)).toBe("Quarta-feira, 21 de outubro · 19:30");
    expect(diaEMes(inicio)).toEqual({ dia: "21", mes: "out" });
    // 23:30 de Brasília ainda é o dia 21 (em UTC já é 22).
    expect(diaEMes(new Date("2026-10-22T02:30:00.000Z")).dia).toBe("21");
  });
  it("abertura do link 15 min antes, duração e confirmados", () => {
    expect(aberturaDoLink(inicio).getTime()).toBe(inicio.getTime() - 15 * MIN);
    expect([duracaoTexto(45), duracaoTexto(60), duracaoTexto(90)]).toEqual(["45 min", "1 h", "1 h 30 min"]);
    expect([textoConfirmados(0), textoConfirmados(1), textoConfirmados(7)]).toEqual(["Ninguém confirmou ainda", "1 confirmado", "7 confirmados"]);
  });
});
