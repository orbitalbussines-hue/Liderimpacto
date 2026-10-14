import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Abas } from "./abas";

const itens = [
  { valor: "descricao", rotulo: "Descrição" },
  { valor: "materiais", rotulo: "Materiais" },
  { valor: "comentarios", rotulo: "Comentários" },
];

describe("Abas", () => {
  it("modo link: so a ativa tem aria-current=page", () => {
    render(
      <Abas
        aria-label="Membros"
        ativo="grupos"
        itens={[
          { valor: "membros", rotulo: "Membros", href: "/admin/membros" },
          { valor: "grupos", rotulo: "Grupos", href: "/admin/membros/grupos" },
        ]}
      />
    );
    expect(screen.getByRole("link", { name: "Grupos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Membros" })).not.toHaveAttribute("aria-current");
  });

  it("modo botao: aria-selected na ativa, clique e setas trocam", () => {
    const onSelecionar = vi.fn();
    render(<Abas aria-label="Aula" itens={itens} onSelecionar={onSelecionar} />);
    const [a, b, c] = screen.getAllByRole("tab");
    expect(a).toHaveAttribute("aria-selected", "true");
    expect(b).toHaveAttribute("aria-selected", "false");
    expect(b).toHaveAttribute("tabindex", "-1");

    fireEvent.click(b);
    expect(b).toHaveAttribute("aria-selected", "true");
    expect(onSelecionar).toHaveBeenLastCalledWith("materiais");

    fireEvent.keyDown(b, { key: "ArrowRight" });
    expect(c).toHaveAttribute("aria-selected", "true");
    expect(c).toHaveFocus();

    fireEvent.keyDown(c, { key: "ArrowRight" });
    expect(a).toHaveAttribute("aria-selected", "true");
  });
});
