import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConfigPagina } from "@/lib/paginas/config";
import { paginaDoModelo } from "@/lib/paginas/modelos";
import type { ContextoRender, DadosRender } from "@/lib/paginas/render-tipos";
import { BlocosDaPagina, hrefDoBotao, linkDoCheckout } from "./blocos";

// O formulário chama uma server action (banco): no teste de render ela não roda.
vi.mock("@/app/p/[slug]/acoes", () => ({ enviarCaptura: vi.fn() }));

const OFERTA = "11111111-1111-4111-8111-111111111111";
const CURSO = "22222222-2222-4222-8222-222222222222";
const dados: DadosRender = {
  imagens: {},
  cursos: { [CURSO]: { titulo: "Curso X", modulos: [{ id: "m1", titulo: "Fundamentos", aulas: ["Aula 1", "Aula 2"] }] } },
  ofertas: { [OFERTA]: { id: OFERTA, nome: "Oferta X", precoCentavos: 19700, tipo: "AVULSO", intervalo: null } },
};
const ctx: ContextoRender = { paginaId: "33333333-3333-4333-8333-333333333333", funilId: null, cupom: "DEZ", afiliado: "ANA2026", utm: {}, previa: false };
const venda = (): ConfigPagina => paginaDoModelo("VENDA", { produtoId: CURSO, ofertaId: OFERTA });

describe("render dos blocos", () => {
  it("texto do criador sai escapado (nenhum elemento novo nasce do texto)", () => {
    const c = venda();
    c.blocos[0] = { ...(c.blocos[0] as Extract<ConfigPagina["blocos"][number], { tipo: "CAPA" }>), titulo: '<img src=x onerror="alert(1)">Oi', subtitulo: "<script>alert(1)</script>" };
    const { container } = render(<BlocosDaPagina config={c} dados={dados} ctx={ctx} slug="vendas" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe('<img src=x onerror="alert(1)">Oi');
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img[onerror]")).toBeNull();
  });

  it("preço: link de compra da oferta com página, cupom e afiliado; âncora #preco; módulos do curso", () => {
    const { container } = render(<BlocosDaPagina config={venda()} dados={dados} ctx={ctx} slug="vendas" />);
    const comprar = screen.getByRole("link", { name: "Comprar agora" });
    expect(comprar.getAttribute("href")).toBe(`/api/stripe/checkout?oferta=${OFERTA}&pagina=${ctx.paginaId}&cupom=DEZ&afiliado=ANA2026`);
    expect(container.querySelector("#preco")).not.toBeNull();
    expect(screen.getByText("R$ 197,00")).toBeTruthy();
    expect(screen.getByText("Fundamentos")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Quero começar" }).getAttribute("href")).toBe("#preco");
  });

  it("prévia não abre o checkout; bloco oculto não aparece; oferta pausada/ausente esconde o Preço", () => {
    const c = venda();
    c.blocos = c.blocos.map((b) => (b.tipo === "FAQ" ? { ...b, visivel: false } : b));
    const { unmount } = render(<BlocosDaPagina config={c} dados={dados} ctx={{ ...ctx, previa: true }} slug="vendas" />);
    expect(screen.queryByRole("link", { name: "Comprar agora" })).toBeNull();
    expect(screen.queryByText("Perguntas frequentes")).toBeNull();
    unmount();
    render(<BlocosDaPagina config={venda()} dados={{ ...dados, ofertas: {} }} ctx={ctx} slug="vendas" />);
    expect(screen.queryByText("Comprar agora")).toBeNull();
  });

  it("vídeo: só o player de domínio fixo; link externo abre fora com noopener", () => {
    const c = venda();
    const capa = c.blocos[0] as Extract<ConfigPagina["blocos"][number], { tipo: "CAPA" }>;
    c.blocos[0] = { ...capa, midia: { tipo: "VIDEO", provedor: "VIMEO", id: "76979871" }, botao: { texto: "Saiba mais", acao: "LINK", url: "https://exemplo.com.br" } };
    const { container } = render(<BlocosDaPagina config={c} dados={dados} ctx={ctx} slug="vendas" />);
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe("https://player.vimeo.com/video/76979871?dnt=1");
    const link = screen.getByRole("link", { name: "Saiba mais" });
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(hrefDoBotao({ texto: "x", acao: "FORMULARIO", url: null })).toBe("#formulario");
    expect(linkDoCheckout(OFERTA, { ...ctx, cupom: null, afiliado: null, funilId: "f" })).toBe(`/api/stripe/checkout?oferta=${OFERTA}&pagina=${ctx.paginaId}&funil=f`);
  });

  it("captura: formulário com consentimento obrigatório e armadilha escondida", () => {
    const { container } = render(<BlocosDaPagina config={paginaDoModelo("CAPTURA", { produtoId: null, ofertaId: null })} dados={dados} ctx={ctx} slug="isca" />);
    expect(container.querySelector("#formulario")).not.toBeNull();
    expect((container.querySelector('input[name="consentimento"]') as HTMLInputElement).required).toBe(true);
    const armadilha = container.querySelector('input[name="site"]') as HTMLInputElement;
    expect(armadilha.tabIndex).toBe(-1);
    expect(armadilha.closest("[aria-hidden]")).not.toBeNull();
  });
});
