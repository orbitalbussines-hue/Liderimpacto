import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FimDaAula } from "./fim-da-aula";

/** Um segundo por `act` (cada tique agenda o próximo no efeito, que roda ao fim do act). */
const passar = (seg: number) => {
  for (let i = 0; i < seg; i++) act(() => vi.advanceTimersByTime(1000));
};

const proxima = { numero: "3.3", titulo: "Cultura forte × cultura tóxica" };

describe("FimDaAula (reprodução automática)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("conta 5 s, foca o Cancelar e vai para a próxima aula uma vez só", () => {
    const onIr = vi.fn();
    render(<FimDaAula proxima={proxima} contagem={5} onIr={onIr} onRever={() => {}} />);
    expect(screen.getByText("5s")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    passar(3);
    expect(screen.getByText("2s")).toBeInTheDocument();
    expect(onIr).not.toHaveBeenCalled();
    passar(2);
    expect(onIr).toHaveBeenCalledTimes(1);
    passar(10);
    expect(onIr).toHaveBeenCalledTimes(1);
  });

  it("Cancelar para a contagem e troca por Rever a aula", () => {
    const onIr = vi.fn();
    const onRever = vi.fn();
    render(<FimDaAula proxima={proxima} contagem={5} onIr={onIr} onRever={onRever} />);
    passar(2);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    passar(10);
    expect(onIr).not.toHaveBeenCalled();
    expect(screen.getByText("Próxima aula")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Rever a aula/ }));
    expect(onRever).toHaveBeenCalled();
  });

  it("sem reprodução automática não conta; Assistir agora vai na hora", () => {
    const onIr = vi.fn();
    render(<FimDaAula proxima={proxima} contagem={null} onIr={onIr} onRever={() => {}} />);
    passar(10);
    expect(onIr).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Assistir agora/ }));
    expect(onIr).toHaveBeenCalledTimes(1);
  });
});
