import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

import { ContagemEvento } from "./contagem-evento";

const MIN = 60_000;

describe("ContagemEvento", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("conta e pede a página ao servidor quando a janela do link abre (15 min antes) e no fim", () => {
    vi.useFakeTimers();
    const agora = new Date("2026-10-21T22:00:00.000Z");
    vi.setSystemTime(agora);
    const inicio = new Date(agora.getTime() + 16 * MIN);
    render(<ContagemEvento inicioEm={inicio.toISOString()} fimEm={new Date(inicio.getTime() + 30 * MIN).toISOString()} />);
    expect(screen.getByText("Começa em 16 min")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(45_000));
    expect(nav.refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(30_000)); // cruzou os 15 min antes
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(46 * MIN)); // passou do fim
    expect(nav.refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Encerrado")).toBeInTheDocument();
  });
});
