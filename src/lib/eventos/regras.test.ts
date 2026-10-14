import { describe, expect, it } from "vitest";
import { chaveDoLembrete, fimDoEvento, idDoJobLembrete, linkDeEventoValido, momentoDoEvento, momentoDoLembrete, quandoDoEvento } from "./regras";

const inicio = new Date("2026-10-21T22:30:00Z"); // 19:30 em Brasília
const ev = { inicioEm: inicio, duracaoMin: 90 };
const mais = (min: number) => new Date(inicio.getTime() + min * 60_000);

describe("janela do link", () => {
  it("abre 15 min antes e fecha no fim (início + duração)", () => {
    expect(momentoDoEvento(ev, mais(-16))).toBe("EM_BREVE");
    expect(momentoDoEvento(ev, mais(-15))).toBe("ABERTO");
    expect(momentoDoEvento(ev, mais(89))).toBe("ABERTO");
    expect(momentoDoEvento(ev, mais(90))).toBe("ENCERRADO");
    expect(fimDoEvento(ev).toISOString()).toBe("2026-10-22T00:00:00.000Z");
  });

  it("lembrete 1 h antes; job e chave mudam quando o horário muda", () => {
    expect(momentoDoLembrete(inicio).toISOString()).toBe("2026-10-21T21:30:00.000Z");
    expect(idDoJobLembrete("e1", inicio)).toBe(`lembrete-e1-${inicio.getTime()}`);
    expect(chaveDoLembrete("e1", inicio)).not.toBe(chaveDoLembrete("e1", mais(30)));
  });
});

describe("linkDeEventoValido", () => {
  it.each(["https://zoom.us/j/123?pwd=abc", "https://meet.google.com/abc-defg-hij", "https://www.youtube.com/live/x#t", "https://sala.exemplo.com.br:8443/a"])("aceita %s", (l) =>
    expect(linkDeEventoValido(l)).toBe(true),
  );
  it.each(["http://zoom.us/j/1", "javascript:alert(1)", "https://localhost/x", "https://user:senha@zoom.us/j", "https://zoom .us", "https://-a.com", `https://a.com/${"x".repeat(500)}`, "zoom.us/j/1"])(
    "recusa %s",
    (l) => expect(linkDeEventoValido(l)).toBe(false),
  );
});

it("formata em Brasília", () => {
  expect(quandoDoEvento(inicio)).toBe("21/10 às 19:30");
});
