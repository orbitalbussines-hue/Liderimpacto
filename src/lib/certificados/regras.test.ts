import { describe, expect, it } from "vitest";
import { modeloCertificadoSchema } from "@/lib/validators/avaliacoes";
import { cargaHorariaTexto, codigoLegivel, corDoCertificado, dataPorExtenso, gerarCodigo, MODELO_PADRAO, normalizarCodigo, preencherTexto, RE_CODIGO, urlDeVerificacao } from "./regras";

describe("código de verificação (RN-128)", () => {
  it("10 caracteres base32 sem ambíguos, não sequencial", () => {
    const codigos = Array.from({ length: 2000 }, gerarCodigo);
    expect(codigos.every((c) => RE_CODIGO.test(c))).toBe(true);
    expect(codigos.some((c) => /[01OI]/.test(c))).toBe(false);
    expect(new Set(codigos).size).toBe(codigos.length);
  });
  it("normaliza o digitado; recusa formato errado", () => {
    expect(normalizarCodigo("k7m2x-9qp4h")).toBe("K7M2X9QP4H");
    expect(normalizarCodigo(" K7M2X 9QP4H ")).toBe("K7M2X9QP4H");
    expect(normalizarCodigo("K7M2X9QP4")).toBeNull();
    expect(normalizarCodigo("O7M2X9QP4H")).toBeNull();
    expect(codigoLegivel("K7M2X9QP4H")).toBe("K7M2X-9QP4H");
  });
});

describe("texto, carga e data", () => {
  it("preenche as 4 variáveis do modelo padrão", () => {
    expect(preencherTexto(MODELO_PADRAO.texto, { nome: "Ana", curso: "Curso X", carga_horaria: "8 horas", data: "14 de outubro de 2026" })).toBe(
      "Certificamos que Ana concluiu o curso Curso X, com carga horária de 8 horas, em 14 de outubro de 2026.",
    );
  });
  it("carga arredondada à hora, mínimo 1", () => {
    expect(cargaHorariaTexto(0)).toBe("1 hora");
    expect(cargaHorariaTexto(5399)).toBe("1 hora");
    expect(cargaHorariaTexto(5400)).toBe("2 horas");
    expect(cargaHorariaTexto(9 * 3600 + 1500)).toBe("9 horas");
  });
  it("data em Brasília por extenso e URL pública", () => {
    expect(dataPorExtenso(new Date("2026-10-15T02:00:00Z"))).toBe("14 de outubro de 2026");
    expect(urlDeVerificacao("https://liderdeimpacto.com.br", "lider", "K7M2X9QP4H")).toBe("https://lider.liderdeimpacto.com.br/certificado/K7M2X9QP4H");
    expect(urlDeVerificacao("http://localhost:3011", "demo", "K7M2X9QP4H")).toBe("http://demo.localhost:3011/certificado/K7M2X9QP4H");
  });
  it("cor: modelo → curso → criador → dourado, legível no papel claro", () => {
    expect(corDoCertificado(null, null, null)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(corDoCertificado("#123456", "#ff0000")).toBe(corDoCertificado("#123456"));
    expect(corDoCertificado(null, "#ff0000", "#00ff00")).toBe(corDoCertificado("#ff0000"));
  });
  it("modelo: só variáveis conhecidas e {nome} obrigatório", () => {
    const base = { produtoId: null, versao: null, titulo: "Certificado", assinaturaNome: "Valmer" };
    expect(modeloCertificadoSchema.safeParse({ ...base, texto: "Certificamos que {nome} concluiu {curso}." }).success).toBe(true);
    expect(modeloCertificadoSchema.safeParse({ ...base, texto: "Certificamos que {aluno} concluiu {curso}." }).success).toBe(false);
    expect(modeloCertificadoSchema.safeParse({ ...base, texto: "Certificamos a conclusão de {curso}." }).success).toBe(false);
  });
});
