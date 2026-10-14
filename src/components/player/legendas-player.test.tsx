import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ControlesPlayer, type ControlesPlayerProps } from "./controles-player";
import { PlayerAula } from "./player-aula";
import { idDaFaixa, useLegenda } from "./use-legenda";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/actions/videos", () => ({ acaoIniciarReproducao: vi.fn(), acaoRenovarReproducao: vi.fn() }));
vi.mock("@/lib/actions/progresso", () => ({ acaoRegistrarProgresso: vi.fn() }));

const controles = (extra: Partial<ControlesPlayerProps>): ControlesPlayerProps => ({
  tocando: false,
  tempo: 0,
  duracao: 60,
  carregado: 0,
  capitulos: [],
  volume: 1,
  mudo: false,
  velocidade: null,
  niveis: [],
  nivel: -1,
  telaCheia: false,
  pip: false,
  anterior: null,
  proxima: null,
  menu: null,
  onMenu: vi.fn(),
  legendas: [],
  legendaAtiva: null,
  onLegenda: vi.fn(),
  onAlternar: vi.fn(),
  onBuscar: vi.fn(),
  onVolume: vi.fn(),
  onMudo: vi.fn(),
  onVelocidade: vi.fn(),
  onNivel: vi.fn(),
  onTelaCheia: vi.fn(),
  onPip: vi.fn(),
  onAnterior: vi.fn(),
  onProxima: vi.fn(),
  ...extra,
});

describe("botão CC", () => {
  it("sem legenda: desabilitado (não promete o que não há)", () => {
    render(<ControlesPlayer {...controles({})} />);
    expect(screen.getByRole("button", { name: "Legendas indisponíveis nesta aula" })).toBeDisabled();
  });

  it("uma legenda: liga e desliga com aria-pressed", () => {
    const onLegenda = vi.fn();
    const { rerender } = render(<ControlesPlayer {...controles({ legendas: [{ id: "l1", rotulo: "Português" }], onLegenda })} />);
    const cc = screen.getByRole("button", { name: "Legendas (C)" });
    expect(cc).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(cc);
    expect(onLegenda).toHaveBeenLastCalledWith("l1");
    rerender(<ControlesPlayer {...controles({ legendas: [{ id: "l1", rotulo: "Português" }], legendaAtiva: "l1", onLegenda })} />);
    expect(cc).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(cc);
    expect(onLegenda).toHaveBeenLastCalledWith(null);
  });

  it("mais de uma: menu com Desligadas + idiomas", () => {
    const onLegenda = vi.fn();
    const legendas = [
      { id: "l1", rotulo: "Português" },
      { id: "l2", rotulo: "English" },
    ];
    render(<ControlesPlayer {...controles({ legendas, legendaAtiva: "l1", menu: "legendas", onLegenda })} />);
    expect(screen.getByRole("button", { name: "Legendas: Português" })).toBeInTheDocument();
    expect(screen.getAllByRole("menuitemradio").map((b) => b.textContent)).toEqual(["Desligadas", "Português", "English"]);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "English" }));
    expect(onLegenda).toHaveBeenLastCalledWith("l2");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Desligadas" }));
    expect(onLegenda).toHaveBeenLastCalledWith(null);
  });
});

/** TextTrack mínimo (o jsdom não tem). */
function faixaFalsa(id: string) {
  const alvo = new EventTarget() as EventTarget & { id: string; mode: string; activeCues: { text: string }[] };
  return Object.assign(alvo, { id, mode: "disabled", activeCues: [] as { text: string }[] });
}

describe("useLegenda", () => {
  it("liga só a escolhida em hidden, devolve o texto do trecho (sanitizado) e desliga ao trocar", () => {
    const a = faixaFalsa(idDaFaixa("a"));
    const b = faixaFalsa(idDaFaixa("b"));
    const video = { current: Object.assign(new EventTarget(), { textTracks: [a, b] }) as unknown as HTMLVideoElement };
    const { result, rerender } = renderHook(({ ativa }) => useLegenda(video, ativa), { initialProps: { ativa: "a" as string | null } });
    expect([a.mode, b.mode]).toEqual(["hidden", "disabled"]);
    act(() => {
      a.activeCues = [{ text: "<b>Olá</b> &amp; bem-vindo" }];
      a.dispatchEvent(new Event("cuechange"));
    });
    expect(result.current).toBe("Olá & bem-vindo");
    // iPhone em tela cheia nativa: o sistema desenha.
    act(() => void video.current!.dispatchEvent(new Event("webkitbeginfullscreen")));
    expect(a.mode).toBe("showing");
    act(() => void video.current!.dispatchEvent(new Event("webkitendfullscreen")));
    expect(a.mode).toBe("hidden");
    rerender({ ativa: null });
    expect(result.current).toBe("");
    expect([a.mode, b.mode]).toEqual(["disabled", "disabled"]);
  });
});

describe("PlayerAula com legenda", () => {
  beforeEach(() => localStorage.clear());
  const props = {
    aulaId: "a1",
    titulo: "Aula",
    duracaoSeg: 60,
    poster: null,
    marcaDagua: "Ana · ana@x.com",
    retomarEm: 0,
    capitulos: [],
    velocidade: true,
    autoplay: false,
    contagemSeg: 5,
    anterior: null,
    proxima: null,
    legendas: [{ id: "l1", idioma: "pt-BR", rotulo: "Português", url: "/api/legendas/l1" }],
    chaveLegenda: "li:legenda:u1",
  };

  it("<track> da rota do app e a escolha lembrada por pessoa no navegador", () => {
    const { container, unmount } = render(<PlayerAula {...props} />);
    const track = container.querySelector("track")!;
    expect(track).toHaveAttribute("src", "/api/legendas/l1");
    expect(track).toHaveAttribute("kind", "subtitles");
    expect(track).toHaveAttribute("srclang", "pt-BR");
    expect(track).not.toHaveAttribute("default");
    const cc = screen.getByRole("button", { name: "Legendas (C)" });
    expect(cc).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(cc);
    expect(localStorage.getItem("li:legenda:u1")).toBe("pt-BR");
    unmount();
    render(<PlayerAula {...props} />);
    expect(screen.getByRole("button", { name: "Legendas (C)" })).toHaveAttribute("aria-pressed", "true");
    // Atalho C desliga (e lembra).
    fireEvent.keyDown(screen.getByRole("region", { name: "Player: Aula" }), { key: "c" });
    expect(localStorage.getItem("li:legenda:u1")).toBe("");
    // Outra pessoa no mesmo navegador não herda a escolha.
    expect(localStorage.getItem("li:legenda:u2")).toBeNull();
  });
});
