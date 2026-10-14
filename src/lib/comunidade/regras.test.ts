import { describe, expect, it } from "vitest";
import { publicarSchema } from "@/lib/validators/comunidade";
import { codificarCursor, decodificarCursor, finalidadeDoAnexo, iniciais, normalizarTexto, problemaDosAnexos, resumo, segmentosDeTexto } from "./regras";

describe("segmentosDeTexto (texto puro + links)", () => {
  it("separa texto e links http(s), sem a pontuação colada no fim", () => {
    expect(segmentosDeTexto("Veja https://exemplo.com/a?b=1. E http://x.org!")).toEqual([
      { tipo: "texto", valor: "Veja " },
      { tipo: "link", valor: "https://exemplo.com/a?b=1", href: "https://exemplo.com/a?b=1" },
      { tipo: "texto", valor: ". E " },
      { tipo: "link", valor: "http://x.org", href: "http://x.org/" },
      { tipo: "texto", valor: "!" },
    ]);
  });

  it("HTML continua texto (o React escapa); javascript: e data: nunca viram link", () => {
    const html = '<script>alert(1)</script><a href="javascript:alert(1)">x</a> data:text/html,oi';
    expect(segmentosDeTexto(html)).toEqual([{ tipo: "texto", valor: html }]);
  });

  it("link sem host com ponto ou com usuário:senha fica como texto", () => {
    expect(segmentosDeTexto("http://localhost:3000 https://user:pw@site.com")).toEqual([{ tipo: "texto", valor: "http://localhost:3000 https://user:pw@site.com" }]);
  });

  it("texto sem link = um segmento", () => {
    expect(segmentosDeTexto("só texto")).toEqual([{ tipo: "texto", valor: "só texto" }]);
    expect(segmentosDeTexto("")).toEqual([]);
  });
});

describe("normalizarTexto e validador", () => {
  it("tira controles, bidi e largura zero; mantém quebra de linha; não mexe em < >", () => {
    expect(normalizarTexto("  a‮b​c\r\nd\u0007 <b> ")).toBe("abc\nd <b>");
  });

  it("post: só espaço/invisível = vazio; 5001 = longo; HTML guardado literal", () => {
    const base = { canalId: "6f1f4f0a-1c3e-4c8e-9a51-2a8f0b3c4d5e" };
    expect(publicarSchema.safeParse({ ...base, texto: " ​ " }).success).toBe(false);
    expect(publicarSchema.safeParse({ ...base, texto: "x".repeat(5001) }).success).toBe(false);
    expect(publicarSchema.parse({ ...base, texto: "<b>oi</b>" }).texto).toBe("<b>oi</b>");
  });

  it("enquete: 2 a 6 opções, sem repetir", () => {
    const base = { canalId: "6f1f4f0a-1c3e-4c8e-9a51-2a8f0b3c4d5e", texto: "Vote" };
    expect(publicarSchema.safeParse({ ...base, enquete: { pergunta: "?", opcoes: ["A"] } }).success).toBe(false);
    expect(publicarSchema.safeParse({ ...base, enquete: { pergunta: "?", opcoes: ["A", "a"] } }).success).toBe(false);
    expect(publicarSchema.safeParse({ ...base, enquete: { pergunta: "?", opcoes: ["1", "2", "3", "4", "5", "6", "7"] } }).success).toBe(false);
    expect(publicarSchema.parse({ ...base, enquete: { pergunta: "?", opcoes: ["A", "B"] } }).enquete).toMatchObject({ opcoes: ["A", "B"], encerraEm: null });
  });
});

describe("anexos", () => {
  it("limites: 4 imagens e 2 PDFs", () => {
    const img = "COMUNIDADE_IMAGEM" as const;
    const pdf = "COMUNIDADE_PDF" as const;
    expect(problemaDosAnexos([img, img, img, img, pdf, pdf])).toBeNull();
    expect(problemaDosAnexos([img, img, img, img, img])).toMatch(/4 imagens/);
    expect(problemaDosAnexos([pdf, pdf, pdf])).toMatch(/2 PDFs/);
    expect(problemaDosAnexos(["IMAGEM"])).toMatch(/inválido/);
  });

  it("finalidade pelo tipo", () => {
    expect(finalidadeDoAnexo("image/png")).toBe("COMUNIDADE_IMAGEM");
    expect(finalidadeDoAnexo("application/pdf")).toBe("COMUNIDADE_PDF");
    expect(finalidadeDoAnexo("application/x-msdownload")).toBeNull();
  });
});

describe("cursor e apoio", () => {
  it("cursor vai e volta; lixo vira null", () => {
    const c = { curtidas: 3, criadoEm: new Date("2026-10-01T12:00:00.123Z"), id: "6f1f4f0a-1c3e-4c8e-9a51-2a8f0b3c4d5e" };
    expect(decodificarCursor(codificarCursor(c))).toEqual(c);
    expect(decodificarCursor("lixo")).toBeNull();
    expect(decodificarCursor(Buffer.from('[1,"x","y"]').toString("base64url"))).toBeNull();
  });

  it("iniciais e resumo", () => {
    expect(iniciais("Ana Paula Pacheco")).toBe("AP");
    expect(iniciais("Edson")).toBe("ED");
    expect(resumo("a  b\nc", 80)).toBe("a b c");
    expect(resumo("x".repeat(100), 10)).toHaveLength(10);
  });
});
