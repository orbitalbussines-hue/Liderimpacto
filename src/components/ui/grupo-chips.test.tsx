import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ControleSegmentado } from "./controle-segmentado";
import { GrupoChips } from "./grupo-chips";

const opcoes = ["3", "5", "7", "10"].map((v) => ({ valor: v, rotulo: v }));

describe.each([
  ["GrupoChips", GrupoChips],
  ["ControleSegmentado", ControleSegmentado],
])("%s", (_nome, Componente) => {
  it("seleciona por clique e marca aria-checked", () => {
    const onMudar = vi.fn();
    render(<Componente aria-label="Quantidade" opcoes={opcoes} valorInicial="5" onMudar={onMudar} />);
    expect(screen.getByRole("radiogroup", { name: "Quantidade" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "5" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: "10" }));
    expect(screen.getByRole("radio", { name: "10" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "5" })).toHaveAttribute("aria-checked", "false");
    expect(onMudar).toHaveBeenCalledWith("10");
  });

  it("teclado: so o marcado entra no Tab; setas, Home e End movem", () => {
    render(<Componente aria-label="Quantidade" opcoes={opcoes} valorInicial="3" />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);

    fireEvent.keyDown(radios[0], { key: "ArrowLeft" });
    expect(radios[3]).toHaveAttribute("aria-checked", "true");
    expect(radios[3]).toHaveFocus();

    fireEvent.keyDown(radios[3], { key: "Home" });
    expect(radios[0]).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(radios[0], { key: "End" });
    expect(radios[3]).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(radios[3], { key: "ArrowDown" });
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
  });
});
