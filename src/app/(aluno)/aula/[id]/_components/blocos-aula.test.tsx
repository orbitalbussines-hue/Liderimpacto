import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlocoConteudo } from "@/lib/catalogo/conteudo-aula";
import { BlocosAula } from "./blocos-aula";

const IMG = "11111111-1111-4111-8111-111111111111";
const SUMIU = "22222222-2222-4222-8222-222222222222";
const URL_IMG = "https://storage.exemplo.com/arquivos/criadores/x/imagem.png?assinatura=1";

describe("BlocosAula", () => {
  it("texto com <script> sai como texto; parágrafos por linha em branco; https vira link em nova aba", () => {
    const blocos: BlocoConteudo[] = [{ tipo: "TEXTO", texto: '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)"> veja https://exemplo.com/guia' }];
    const { container } = render(<BlocosAula blocos={blocos} imagens={{}} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelectorAll("p")).toHaveLength(2);
    const link = screen.getByRole("link", { name: "https://exemplo.com/guia" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("vídeo vira iframe só do domínio do provedor, preguiçoso e com título", () => {
    const blocos: BlocoConteudo[] = [
      { tipo: "VIDEO", provedor: "YOUTUBE", id: "dQw4w9WgXcQ" },
      { tipo: "VIDEO", provedor: "VIMEO", id: "76979871" },
    ];
    const { container } = render(<BlocosAula blocos={blocos} imagens={{}} />);
    const [yt, vimeo] = container.querySelectorAll("iframe");
    expect(yt.getAttribute("src")).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
    expect(yt).toHaveAttribute("loading", "lazy");
    expect(yt).toHaveAttribute("title", "Vídeo 1 da aula");
    expect(yt.getAttribute("src")).not.toMatch(/autoplay=1/);
    expect(vimeo.getAttribute("src")).toMatch(/^https:\/\/player\.vimeo\.com\/video\/76979871/);
    expect(vimeo).toHaveAttribute("title", "Vídeo 2 da aula");
  });

  it("imagem com URL abre em tamanho cheio; sem URL no mapa (sumiu/outro criador) não aparece", () => {
    const blocos: BlocoConteudo[] = [
      { tipo: "IMAGEM", arquivoId: IMG, alt: "Mapa da jornada", legenda: "Figura 1" },
      { tipo: "IMAGEM", arquivoId: SUMIU, alt: "Não deve aparecer" },
    ];
    render(<BlocosAula blocos={blocos} imagens={{ [IMG]: URL_IMG }} />);
    expect(screen.getByAltText("Mapa da jornada")).toBeInTheDocument();
    expect(screen.queryByAltText("Não deve aparecer")).toBeNull();
    expect(screen.getByText("Figura 1")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /tamanho cheio/ });
    expect(link).toHaveAttribute("href", URL_IMG);
    expect(link).toHaveAttribute("target", "_blank");
  });
});
