import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const acoes = vi.hoisted(() => ({ acaoFavoritar: vi.fn(), acaoDesfavoritar: vi.fn() }));
vi.mock("@/lib/actions/favoritos", () => acoes);

import { BotaoFavoritar } from "./botao-favoritar";

const ALVO = { produtoId: "00000000-0000-4000-8000-000000000001" };

/** Promessa que o teste resolve na hora que quiser (para ver o estado otimista antes). */
function adiada<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => (resolver = r));
  return { promessa, resolver };
}

describe("BotaoFavoritar", () => {
  beforeEach(() => vi.resetAllMocks());

  it("marca NA HORA (otimista) e mantém quando a action confirma", async () => {
    const r = adiada<{ ok: true; dados: { favorito: boolean } }>();
    acoes.acaoFavoritar.mockReturnValue(r.promessa);
    render(<BotaoFavoritar alvo={ALVO} favoritoInicial={false} />);
    const botao = screen.getByRole("button", { name: "Minha lista" });
    expect(botao).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(botao);
    expect(screen.getByRole("button", { name: "Na minha lista" })).toHaveAttribute("aria-pressed", "true");
    expect(acoes.acaoFavoritar).toHaveBeenCalledWith(ALVO);
    await act(async () => r.resolver({ ok: true, dados: { favorito: true } }));
    expect(screen.getByRole("button", { name: "Na minha lista" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("volta ao estado anterior e mostra o motivo quando a action recusa", async () => {
    acoes.acaoDesfavoritar.mockResolvedValue({ ok: false, erro: "Sessão expirada. Entre novamente." });
    render(<BotaoFavoritar alvo={ALVO} favoritoInicial />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Na minha lista" })));
    expect(acoes.acaoDesfavoritar).toHaveBeenCalledWith(ALVO);
    expect(screen.getByRole("button", { name: "Na minha lista" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Sessão expirada");
  });
});
