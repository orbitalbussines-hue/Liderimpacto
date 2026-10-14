import { describe, expect, it } from "vitest";
import { atributoAccept, chaveDeArquivo, chaveDoCriador, chavePertenceAoCriador, extensaoDe, mimeDaExtensao, validarEnvio } from "./regras";

const A = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const B = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const ARQ = "11111111-2222-4333-8444-555555555555";

describe("chave de objeto", () => {
  it("sempre prefixada pelo criador", () => {
    expect(chaveDeArquivo(A, "IMAGEM", ARQ, "png")).toBe(`criadores/${A}/imagens/${ARQ}.png`);
    expect(chaveDeArquivo(A, "MATERIAL", ARQ, "pdf")).toBe(`criadores/${A}/materiais/${ARQ}.pdf`);
    expect(chaveDoCriador(A.toUpperCase(), "videos", ARQ, "original.mp4")).toBe(`criadores/${A}/videos/${ARQ}/original.mp4`);
  });

  it("recusa criador invalido e segmento que sobe pasta ou tem barra", () => {
    expect(() => chaveDoCriador("nao-e-uuid", "x")).toThrow();
    expect(() => chaveDoCriador(A)).toThrow();
    for (const ruim of ["..", ".", "a/b", "", "a b", "ç"]) expect(() => chaveDoCriador(A, ruim), ruim).toThrow();
  });

  it("chave de A nunca passa como de B", () => {
    const deA = chaveDeArquivo(A, "IMAGEM", ARQ, "png");
    expect(chavePertenceAoCriador(deA, A)).toBe(true);
    expect(chavePertenceAoCriador(deA, B)).toBe(false);
    expect(chavePertenceAoCriador(`criadores/${A}/../${B}/x.png`, A)).toBe(false);
    expect(chavePertenceAoCriador(`criadores/${A}`, A)).toBe(false);
    expect(chavePertenceAoCriador(`criadores/${A}//x.png`, A)).toBe(false);
    expect(chavePertenceAoCriador(`xcriadores/${A}/x.png`, A)).toBe(false);
  });
});

describe("allowlist", () => {
  it("MIME e extensao precisam bater; tamanho dentro do limite", () => {
    expect(validarEnvio("IMAGEM", { nome: "Capa.JPG", mime: "image/jpeg", tamanho: 1000 })).toMatchObject({ extensao: "jpg", mime: "image/jpeg" });
    expect(validarEnvio("MATERIAL", { nome: "a.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", tamanho: 10 })).toMatchObject({ material: "DOC" });
    expect(() => validarEnvio("IMAGEM", { nome: "a.png", mime: "image/jpeg", tamanho: 10 })).toThrow(/não aceito/);
    expect(() => validarEnvio("IMAGEM", { nome: "a.svg", mime: "image/svg+xml", tamanho: 10 })).toThrow(/não aceito/);
    expect(() => validarEnvio("IMAGEM", { nome: "a", mime: "image/png", tamanho: 10 })).toThrow(/não aceito/);
    expect(() => validarEnvio("MATERIAL", { nome: "a.png", mime: "image/png", tamanho: 10 })).toThrow(/não aceito/);
    expect(() => validarEnvio("IMAGEM", { nome: "a.png", mime: "image/png", tamanho: 10 * 1024 * 1024 + 1 })).toThrow(/grande demais/);
    expect(() => validarEnvio("MATERIAL", { nome: "a.pdf", mime: "application/pdf", tamanho: 0 })).toThrow(/vazio/);
    expect(validarEnvio("MATERIAL", { nome: "a.pdf", mime: "application/pdf", tamanho: 50 * 1024 * 1024 }).material).toBe("PDF");
  });

  it("extensao, mime pela extensao e accept", () => {
    expect(extensaoDe("Relatório Final.PDF")).toBe("pdf");
    expect(extensaoDe("sem-extensao")).toBe("");
    expect(mimeDaExtensao("IMAGEM", "foto.webp")).toBe("image/webp");
    expect(mimeDaExtensao("IMAGEM", "foto.gif")).toBeNull();
    expect(atributoAccept("IMAGEM")).toContain(".jpeg");
  });
});
