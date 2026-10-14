import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AjustarPontos } from "./ajustar-pontos";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
const acao = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/actions/gamificacao", () => ({ acaoAjustarPontos: acao }));

const UUID = "0b8f0d7e-6f5e-4c1a-9a51-0d6f7b6c3a10";

describe("AjustarPontos", () => {
  afterEach(() => {
    vi.useRealTimers();
    acao.mockReset();
  });

  it("valida na tela, mostra o resumo no modal block e só então lança o ajuste", async () => {
    vi.useFakeTimers();
    acao.mockResolvedValue({ ok: true, dados: { id: "x" } });
    render(<AjustarPontos membroId={UUID} nome="Ana Demo" saldo={300} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar pontos de Ana Demo" }));

    fireEvent.change(screen.getByLabelText("Pontos"), { target: { value: "-20" } });
    fireEvent.change(screen.getByLabelText("Justificativa"), { target: { value: "ok" } });
    fireEvent.click(screen.getByRole("button", { name: "Revisar ajuste" }));
    expect(screen.getByText("Explique o ajuste (5 a 500 caracteres).")).toBeInTheDocument();
    expect(acao).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Justificativa"), { target: { value: "Pontos lançados em dobro" } });
    fireEvent.click(screen.getByRole("button", { name: "Revisar ajuste" }));
    expect(screen.getByText(/-20 pontos para Ana Demo \(saldo 300 → 280\)/)).toBeInTheDocument();
    const confirmar = screen.getByRole("button", { name: "Lançar ajuste" });
    expect(confirmar).toBeDisabled(); // 3 s travado
    for (let i = 0; i < 3; i++) act(() => void vi.advanceTimersByTime(1000));
    expect(confirmar).toBeEnabled();
    await act(async () => fireEvent.click(confirmar));
    expect(acao).toHaveBeenCalledWith({ membroId: UUID, pontos: -20, justificativa: "Pontos lançados em dobro" });
  });
});
