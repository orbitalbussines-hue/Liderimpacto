import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Fileira } from "./fileira";
import type { ItemFileira } from "./tipos";

const item: ItemFileira = { id: "a", titulo: "Aula A", subtitulo: "Módulo 1", href: "/aula/a" };

describe("Fileira", () => {
  it("sem itens não renderiza nada", () => {
    const { container } = render(<Fileira titulo="Vazia" itens={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("com itens: título, tag, lista focável e cartões como link", () => {
    render(<Fileira titulo="Top 10 aulas" tag="TOP 10" itens={[item]} />);
    expect(screen.getByRole("heading", { name: "Top 10 aulas" })).toBeInTheDocument();
    expect(screen.getByText("TOP 10")).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("link", { name: /Aula A/ })).toHaveAttribute("href", "/aula/a");
  });
});
