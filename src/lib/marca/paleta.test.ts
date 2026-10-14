import { describe, expect, it } from "vitest";
import { PALETA_PADRAO, contraste, cssDaMarca, gerarPaleta } from "./paleta";

const FUNDOS = { dark: ["#0b0b0d", "#15151a"], light: ["#f5f4ef", "#ffffff"] } as const;

describe("gerarPaleta", () => {
  it("recusa hex invalido", () => {
    for (const cor of ["", "dourado", "#12", "#12345", "#ggg", "#1234567", "red;}body{"]) {
      expect(() => gerarPaleta(cor)).toThrow(/cor invalida/i);
    }
  });

  it("aceita #RGB e normaliza", () => {
    expect(gerarPaleta("#FFF").dark["--accent"]).toBe("#ffffff");
  });

  it("dourado padrao: escuro igual ao README, claro perto de #B5842A", () => {
    const p = gerarPaleta(PALETA_PADRAO);
    expect(p.dark["--accent"]).toBe("#d9a441");
    expect(p.dark["--accent-soft"]).toBe("rgba(217, 164, 65, 0.14)");
    expect(p.dark["--accent-ink"]).toBe("#1a1205");
    expect(contraste(p.light["--accent"], "#b5842a")).toBeLessThan(1.3);
  });

  it("tinta: cor clara pede tinta escura, cor escura pede branco", () => {
    expect(gerarPaleta("#FFE680").dark["--accent-ink"]).toBe("#1a1205");
    expect(gerarPaleta("#1A237E").light["--accent-ink"]).toBe("#ffffff");
  });

  it.each([
    ["#FFE680", "light"],
    ["#1A237E", "dark"],
    ["#7B1E3A", "dark"],
    ["#9BE15D", "light"],
  ] as const)("ajusta %s no tema %s ate contraste >= 3", (cor, tema) => {
    const accent = gerarPaleta(cor)[tema]["--accent"];
    expect(accent).not.toBe(cor.toLowerCase());
    for (const fundo of FUNDOS[tema]) expect(contraste(accent, fundo)).toBeGreaterThanOrEqual(3);
  });

  it("CSS so carrega valores normalizados", () => {
    const css = cssDaMarca("#1A237E");
    expect(css).toContain('[data-area="aluno"][data-theme="dark"]');
    expect(css).toContain("--marca-fixo:");
    expect(css).not.toMatch(/1A237E/);
  });
});
