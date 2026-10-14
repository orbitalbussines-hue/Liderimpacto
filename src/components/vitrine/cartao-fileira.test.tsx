import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CartaoFileira } from "./cartao-fileira";
import { varianteDoTipo, type ItemFileira } from "./tipos";

const item: ItemFileira = { id: "a", titulo: "Aula A", href: "/aula/a", progresso: 42 };

describe("CartaoFileira", () => {
  it("top10 mostra o numeral", () => {
    render(<CartaoFileira item={item} variante="top10" posicao={7} />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("progresso mostra a barra com aria-valuenow", () => {
    render(<CartaoFileira item={item} variante="progresso" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
  });

  it("novo mostra o selo Novo; null suprime", () => {
    const { rerender } = render(<CartaoFileira item={item} variante="novo" />);
    expect(screen.getByText("Novo")).toBeInTheDocument();
    rerender(<CartaoFileira item={{ ...item, selo: null }} variante="novo" />);
    expect(screen.queryByText("Novo")).not.toBeInTheDocument();
  });

  it("tipo da fileira escolhe a variante", () => {
    expect(varianteDoTipo("CONTINUAR")).toBe("progresso");
    expect(varianteDoTipo("TOP10")).toBe("top10");
    expect(varianteDoTipo("NOVIDADES")).toBe("novo");
    expect(varianteDoTipo("MENTORIAS")).toBe("padrao");
  });
});
