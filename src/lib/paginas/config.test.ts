import { describe, expect, it } from "vitest";
import { blocoSchema, configPaginaSchema, idDoVideo, pendenciasParaPublicar, slugDoTitulo, urlDoPlayer, urlHttps } from "./config";
import { conversaoTotal, conversoes } from "./metricas";
import { paginaDoModelo } from "./modelos";
import { consultaDaVisita, lerParametros } from "./visita";

describe("idDoVideo: só YouTube/Vimeo, sempre pelo id", () => {
  it("aceita os formatos de link e o id puro", () => {
    expect(idDoVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toEqual({ provedor: "YOUTUBE", id: "dQw4w9WgXcQ" });
    expect(idDoVideo("https://youtu.be/dQw4w9WgXcQ")).toEqual({ provedor: "YOUTUBE", id: "dQw4w9WgXcQ" });
    expect(idDoVideo("https://youtube.com/shorts/dQw4w9WgXcQ")).toEqual({ provedor: "YOUTUBE", id: "dQw4w9WgXcQ" });
    expect(idDoVideo("https://vimeo.com/76979871")).toEqual({ provedor: "VIMEO", id: "76979871" });
    expect(idDoVideo("dQw4w9WgXcQ")).toEqual({ provedor: "YOUTUBE", id: "dQw4w9WgXcQ" });
  });
  it("recusa outras origens, http e lixo", () => {
    for (const x of ["https://evil.com/watch?v=dQw4w9WgXcQ", "http://youtu.be/dQw4w9WgXcQ", "javascript:alert(1)", "<iframe src=x>", "https://www.youtube.com/watch?v=curto", "https://vimeo.com/abc"]) expect(idDoVideo(x)).toBeNull();
  });
  it("o player sai de domínio fixo", () => {
    expect(urlDoPlayer({ provedor: "YOUTUBE", id: "dQw4w9WgXcQ" })).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
    expect(urlDoPlayer({ provedor: "VIMEO", id: "76979871" })).toBe("https://player.vimeo.com/video/76979871?dnt=1");
  });
});

describe("schema da página", () => {
  it("link só https completo", () => {
    expect(urlHttps.safeParse("https://exemplo.com.br/a?b=1").success).toBe(true);
    for (const x of ["http://exemplo.com", "javascript:alert(1)", "https://exemplo", "https://a.com/\"onmouseover=x", "//exemplo.com"]) expect(urlHttps.safeParse(x).success).toBe(false);
  });
  it("vídeo com id inválido, mídia desconhecida e campo a mais recusam", () => {
    const capa = { id: "c", visivel: true, tipo: "CAPA", titulo: "T", subtitulo: "", botao: null };
    expect(blocoSchema.safeParse({ ...capa, midia: { tipo: "VIDEO", provedor: "YOUTUBE", id: "dQw4w9WgXcQ" } }).success).toBe(true);
    expect(blocoSchema.safeParse({ ...capa, midia: { tipo: "VIDEO", provedor: "VIMEO", id: "dQw4w9WgXcQ" } }).success).toBe(false);
    expect(blocoSchema.safeParse({ ...capa, midia: { tipo: "IFRAME", src: "https://x.com" } }).success).toBe(false);
    expect(blocoSchema.safeParse({ ...capa, midia: { tipo: "NENHUMA" }, html: "<b>" }).success).toBe(false);
  });
  it("os dois modelos validam; um formulário só; pendências para publicar", () => {
    const venda = paginaDoModelo("VENDA", { produtoId: null, ofertaId: null });
    expect(configPaginaSchema.safeParse(venda).success).toBe(true);
    expect(configPaginaSchema.safeParse(paginaDoModelo("CAPTURA", { produtoId: null, ofertaId: null })).success).toBe(true);
    expect(pendenciasParaPublicar(venda)).toEqual(["escolha a oferta do bloco Preço", "escolha o curso do bloco Módulos"]);
    const cap = paginaDoModelo("CAPTURA", { produtoId: null, ofertaId: null });
    const form = cap.blocos.find((b) => b.tipo === "FORMULARIO")!;
    expect(configPaginaSchema.safeParse({ ...cap, blocos: [...cap.blocos, { ...form, id: "outro" }] }).success).toBe(false);
    expect(pendenciasParaPublicar({ ...cap, blocos: cap.blocos.map((b) => ({ ...b, visivel: false })) })).toEqual(["mostre ao menos um bloco"]);
  });
  it("slug sugerido", () => {
    expect(slugDoTitulo("  Curso de Liderança: Turma #3!  ")).toBe("curso-de-lideranca-turma-3");
  });
});

describe("visita e conversão", () => {
  it("parâmetros inválidos somem; repasse na ordem", () => {
    const p = lerParametros((k) => ({ funil: "nao-uuid", cupom: "dez", afiliado: "x", utm_source: "ads", utm_medium: "<b>" })[k]);
    expect(p).toEqual({ funil: null, cupom: "DEZ", afiliado: null, utm: { source: "ads" } });
    expect(consultaDaVisita(p)).toBe("?cupom=DEZ&utm_source=ads");
    expect(consultaDaVisita({ funil: null, cupom: null, afiliado: null, utm: {} })).toBe("");
  });
  it("etapa a etapa e total", () => {
    const e = conversoes([
      { visitas: 200, leads: 50, cliques: 0, vendas: 0, receitaCentavos: 0 },
      { visitas: 40, leads: 0, cliques: 10, vendas: 3, receitaCentavos: 59100 },
      { visitas: 0, leads: 0, cliques: 0, vendas: 0, receitaCentavos: 0 },
    ]);
    expect(e.map((x) => [x.daAnterior, x.taxaLead, x.taxaClique, x.taxaVenda])).toEqual([
      [null, 25, 0, null],
      [20, 0, 25, 30],
      [0, null, null, null],
    ]);
    expect(conversaoTotal(e)).toBe(1.5);
  });
});
