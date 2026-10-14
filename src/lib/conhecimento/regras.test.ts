import { describe, expect, it } from "vitest";
import { consultaDaPergunta, dividirEmTrechos, dividirTranscricao, LIMITES_CONHECIMENTO } from "./regras";

const frase = (n: number, palavra = "liderança") => `${Array.from({ length: n }, () => palavra).join(" ")}.`;

describe("dividirEmTrechos", () => {
  it("junta parágrafos curtos até passar do mínimo, sem estourar o máximo", () => {
    const paragrafos = Array.from({ length: 10 }, (_, i) => `Parágrafo ${i}: ${frase(25)}`);
    const t = dividirEmTrechos(paragrafos.join("\n\n"));
    expect(t.length).toBeGreaterThan(1);
    for (const x of t.slice(0, -1)) {
      expect(x.length).toBeGreaterThanOrEqual(LIMITES_CONHECIMENTO.minimo);
      expect(x.length).toBeLessThanOrEqual(LIMITES_CONHECIMENTO.maximo);
    }
    // Nada se perde nem se repete.
    expect(t.join("\n").replace(/\s+/g, " ")).toBe(paragrafos.join(" ").replace(/\s+/g, " "));
  });

  it("parágrafo longo quebra por sentença; palavra sem fim quebra no máximo", () => {
    const longo = Array.from({ length: 30 }, (_, i) => `Sentença número ${i} sobre cultura e feedback no time.`).join(" ");
    expect(dividirEmTrechos(longo).every((x) => x.length <= LIMITES_CONHECIMENTO.maximo)).toBe(true);
    const semEspaco = "a".repeat(3000);
    const t = dividirEmTrechos(semEspaco);
    expect(t.every((x) => x.length <= LIMITES_CONHECIMENTO.maximo)).toBe(true);
    expect(t.join("")).toBe(semEspaco);
  });

  it("texto vazio = nenhum trecho; texto curto = um trecho", () => {
    expect(dividirEmTrechos("  \n\n ")).toEqual([]);
    expect(dividirEmTrechos("Uma linha só.")).toEqual(["Uma linha só."]);
  });
});

describe("dividirTranscricao", () => {
  it("cada trecho guarda o segundo inicial da primeira fala que entrou (arredondado para baixo)", () => {
    const falas = Array.from({ length: 60 }, (_, i) => ({ inicio: i * 4 + 0.7, texto: `Fala ${i} sobre cultura organizacional no dia a dia.` }));
    const t = dividirTranscricao(falas);
    expect(t.length).toBeGreaterThan(1);
    expect(t[0].inicioSeg).toBe(0);
    expect(t.every((x) => x.texto.length <= LIMITES_CONHECIMENTO.maximo)).toBe(true);
    const segundo = falas.findIndex((f) => t[1].texto.startsWith(f.texto));
    expect(t[1].inicioSeg).toBe(Math.floor(falas[segundo].inicio));
  });

  it("ignora falas vazias e junta quebras de linha", () => {
    expect(dividirTranscricao([{ inicio: 3, texto: "  " }, { inicio: 5.9, texto: "Olá,\nturma" }])).toEqual([{ texto: "Olá, turma", inicioSeg: 5 }]);
  });
});

describe("consultaDaPergunta", () => {
  it("só letras e dígitos, com OU entre os termos (nada de operador do tsquery vindo de fora)", () => {
    expect(consultaDaPergunta("O que é cultura? (feedback) & 'liderança' | !x:*")).toBe("que | cultura | feedback | liderança");
  });
  it("sem repetir, com teto de termos; vazio quando não sobra nada", () => {
    expect(consultaDaPergunta("Cultura cultura CULTURA")).toBe("cultura");
    expect(consultaDaPergunta(Array.from({ length: 40 }, (_, i) => `termo${i}`).join(" ")).split(" | ")).toHaveLength(LIMITES_CONHECIMENTO.termos);
    expect(consultaDaPergunta("? ! a")).toBe("");
  });
});
