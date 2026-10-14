import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Interruptor } from "./interruptor";

describe("Interruptor", () => {
  it("alterna e reflete em aria-checked", () => {
    const onAlternar = vi.fn();
    render(<Interruptor aria-label="Lembretes" onAlternar={onAlternar} />);
    const chave = screen.getByRole("switch", { name: "Lembretes" });
    expect(chave).toHaveAttribute("aria-checked", "false");

    fireEvent.click(chave);
    expect(chave).toHaveAttribute("aria-checked", "true");
    expect(onAlternar).toHaveBeenLastCalledWith(true);

    fireEvent.click(chave);
    expect(chave).toHaveAttribute("aria-checked", "false");
    expect(onAlternar).toHaveBeenLastCalledWith(false);
  });

  it("controlado: obedece ao pai e so avisa a mudanca", () => {
    const onAlternar = vi.fn();
    render(<Interruptor aria-label="Visivel" ligado onAlternar={onAlternar} />);
    const chave = screen.getByRole("switch");
    fireEvent.click(chave);
    expect(onAlternar).toHaveBeenCalledWith(false);
    expect(chave).toHaveAttribute("aria-checked", "true");
  });
});
