import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarraProgresso } from "./barra-progresso";

describe("BarraProgresso", () => {
  it.each([
    [42, "42"],
    [-10, "0"],
    [180, "100"],
    [Number.NaN, "0"],
    [33.6, "34"],
  ])("valor %s vira aria-valuenow %s e largura igual", (valor, esperado) => {
    render(<BarraProgresso valor={valor} rotulo="Progresso" />);
    const barra = screen.getByRole("progressbar", { name: "Progresso" });
    expect(barra).toHaveAttribute("aria-valuenow", esperado);
    expect(barra).toHaveAttribute("aria-valuemin", "0");
    expect(barra).toHaveAttribute("aria-valuemax", "100");
    expect(barra.firstElementChild).toHaveStyle({ width: `${esperado}%` });
  });

  it("mostra o percentual quando pedido", () => {
    render(<BarraProgresso valor={120} mostrarPercentual />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
