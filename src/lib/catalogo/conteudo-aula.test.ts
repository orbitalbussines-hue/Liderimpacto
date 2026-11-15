import { describe, expect, it } from "vitest";
import { conteudoAulaSchema, descricaoDoConteudo, MAX_BLOCOS_CONTEUDO, imagensDoConteudo, mesmoConteudo, resumoDoConteudo, trocarPrimeiroTexto, type BlocoConteudo } from "./conteudo-aula";

const IMG = "11111111-1111-4111-8111-111111111111";
const IMG2 = "22222222-2222-4222-8222-222222222222";
const valido = (x: unknown) => conteudoAulaSchema.safeParse(x).success;
const erro = (x: unknown) => {
  const r = conteudoAulaSchema.safeParse(x);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("conteudoAulaSchema", () => {
  it("aceita os três tipos", () => {
    expect(
      valido([
        { tipo: "TEXTO", texto: "Olá" },
        { tipo: "IMAGEM", arquivoId: IMG, alt: "Mapa", legenda: "Figura 1" },
        { tipo: "IMAGEM", arquivoId: IMG, alt: "Mapa" },
        { tipo: "VIDEO", provedor: "YOUTUBE", id: "dQw4w9WgXcQ" },
        { tipo: "VIDEO", provedor: "VIMEO", id: "76979871" },
      ]),
    ).toBe(true);
  });

  it("recusa tipo inválido e campo a mais (strict)", () => {
    expect(valido([{ tipo: "HTML", texto: "<b>x</b>" }])).toBe(false);
    expect(valido([{ tipo: "TEXTO", texto: "x", cor: "red" }])).toBe(false);
    expect(valido([{ tipo: "VIDEO", provedor: "YOUTUBE", id: "dQw4w9WgXcQ", autoplay: true }])).toBe(false);
  });

  it("vídeo só YouTube/Vimeo por id válido", () => {
    expect(valido([{ tipo: "VIDEO", provedor: "DAILYMOTION", id: "x7tgad0" }])).toBe(false);
    expect(valido([{ tipo: "VIDEO", provedor: "YOUTUBE", id: "https://www.dailymotion.com/video/x7tgad0" }])).toBe(false);
    expect(valido([{ tipo: "VIDEO", provedor: "YOUTUBE", id: "curto" }])).toBe(false);
    expect(valido([{ tipo: "VIDEO", provedor: "VIMEO", id: "abc" }])).toBe(false);
  });

  it("no máximo 40 blocos", () => {
    const um = { tipo: "TEXTO", texto: "a" };
    expect(valido(Array(40).fill(um))).toBe(true);
    expect(erro(Array(41).fill(um))).toMatch(/40 blocos/);
  });

  it("imagem: alt obrigatório (até 200), legenda até 200, id uuid", () => {
    expect(erro([{ tipo: "IMAGEM", arquivoId: IMG, alt: "   " }])).toMatch(/descreva/);
    expect(valido([{ tipo: "IMAGEM", arquivoId: IMG }])).toBe(false);
    expect(valido([{ tipo: "IMAGEM", arquivoId: IMG, alt: "a".repeat(201) }])).toBe(false);
    expect(valido([{ tipo: "IMAGEM", arquivoId: IMG, alt: "a", legenda: "b".repeat(201) }])).toBe(false);
    expect(valido([{ tipo: "IMAGEM", arquivoId: "nao-e-uuid", alt: "a" }])).toBe(false);
  });

  it("texto: <script> é aceito como texto; vazio e > 5000 recusados; normaliza", () => {
    const zw = String.fromCharCode(0x200b);
    const r = conteudoAulaSchema.parse([{ tipo: "TEXTO", texto: `  <script>alert(1)</script>\r\nfim${zw}  ` }]);
    expect(r[0]).toEqual({ tipo: "TEXTO", texto: "<script>alert(1)</script>\nfim" });
    expect(valido([{ tipo: "TEXTO", texto: " \n " }])).toBe(false);
    expect(valido([{ tipo: "TEXTO", texto: "a".repeat(5001) }])).toBe(false);
  });
});

const blocos: BlocoConteudo[] = [
  { tipo: "TEXTO", texto: "Primeiro" },
  { tipo: "IMAGEM", arquivoId: IMG, alt: "Mapa" },
  { tipo: "VIDEO", provedor: "YOUTUBE", id: "dQw4w9WgXcQ" },
  { tipo: "TEXTO", texto: "Segundo" },
  { tipo: "IMAGEM", arquivoId: IMG2, alt: "Gráfico" },
  { tipo: "IMAGEM", arquivoId: IMG, alt: "Mapa de novo" },
];

describe("derivações", () => {
  it("descrição = só os TEXTO separados por linha em branco, cortada em 5000", () => {
    expect(descricaoDoConteudo(blocos)).toBe("Primeiro\n\nSegundo");
    expect(descricaoDoConteudo(null)).toBe("");
    expect(descricaoDoConteudo(Array(3).fill({ tipo: "TEXTO", texto: "a".repeat(5000) }))).toHaveLength(5000);
  });

  it("imagens únicas na ordem", () => {
    expect(imagensDoConteudo(blocos)).toEqual([IMG, IMG2]);
    expect(imagensDoConteudo(null)).toEqual([]);
  });

  it("resumo para a trilha", () => {
    expect(resumoDoConteudo(null)).toBe("vazio");
    expect(resumoDoConteudo([])).toBe("vazio");
    expect(resumoDoConteudo(blocos)).toBe("6 blocos (3 imagens, 1 vídeo)");
    expect(resumoDoConteudo([{ tipo: "TEXTO", texto: "a" }])).toBe("1 bloco");
  });

  it("trocarPrimeiroTexto troca o primeiro TEXTO ou insere no topo", () => {
    expect(trocarPrimeiroTexto(blocos, "Novo")[0]).toEqual({ tipo: "TEXTO", texto: "Novo" });
    expect(trocarPrimeiroTexto(blocos, "Novo")[3]).toEqual({ tipo: "TEXTO", texto: "Segundo" });
    const soImagem: BlocoConteudo[] = [{ tipo: "IMAGEM", arquivoId: IMG, alt: "x" }];
    expect(trocarPrimeiroTexto(soImagem, "Novo")).toEqual([{ tipo: "TEXTO", texto: "Novo" }, soImagem[0]]);
    // Cheio e sem TEXTO: não passa do teto do schema (o editor recusaria o próximo salvar).
    const cheio = Array.from({ length: MAX_BLOCOS_CONTEUDO }, () => soImagem[0]);
    expect(() => trocarPrimeiroTexto(cheio, "Novo")).toThrow(/40 blocos/);
    expect(trocarPrimeiroTexto([{ tipo: "TEXTO", texto: "a" }, ...cheio.slice(1)], "Novo")).toHaveLength(MAX_BLOCOS_CONTEUDO);
  });

  it("mesmoConteudo ignora a ordem das chaves (jsonb) e trata [] como nulo", () => {
    const doBanco = JSON.parse('[{"id":"dQw4w9WgXcQ","tipo":"VIDEO","provedor":"YOUTUBE"},{"alt":"Mapa","tipo":"IMAGEM","arquivoId":"' + IMG + '"}]') as BlocoConteudo[];
    expect(mesmoConteudo(doBanco, [blocos[2], blocos[1]])).toBe(true);
    expect(mesmoConteudo(doBanco, [blocos[1], blocos[2]])).toBe(false);
    expect(mesmoConteudo(null, [])).toBe(true);
    expect(mesmoConteudo(null, blocos)).toBe(false);
  });
});
