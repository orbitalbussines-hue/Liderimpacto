import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const acoes = vi.hoisted(() => ({ acaoMarcarNotificacoesLidas: vi.fn(), acaoMaisNotificacoes: vi.fn() }));
vi.mock("@/lib/actions/notificacoes", () => acoes);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { INTERVALO_POLLING_MS } from "@/lib/notificacoes/regras";
import { SinoNotificacoes } from "./sino-notificacoes";

const visibilidade = (v: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
  document.dispatchEvent(new Event("visibilitychange"));
};
const resposta = (status: number, naoLidas = 0) => Promise.resolve(new Response(JSON.stringify({ naoLidas }), { status }));
const ITENS = [
  { id: "a", tipo: "AVISO", texto: "Ana publicou um aviso.", href: "/comunidade?post=1", lida: false, em: new Date() },
  { id: "b", tipo: "AULA_NOVA", texto: "<b>Nova aula</b>", href: "/aula/2", lida: true, em: new Date() },
];

describe("SinoNotificacoes", () => {
  let busca: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    visibilidade("visible");
    busca = vi.fn(() => resposta(200, 5));
    vi.stubGlobal("fetch", busca);
    acoes.acaoMarcarNotificacoesLidas.mockResolvedValue({ ok: true, dados: { marcadas: 1 } });
    acoes.acaoMaisNotificacoes.mockResolvedValue({ ok: true, dados: { itens: ITENS, proximoCursor: null } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("rótulo com a contagem, '99+' no teto e nada em 0", () => {
    render(<SinoNotificacoes inicial={3} />);
    expect(screen.getByRole("button", { name: "Notificações, 3 não lidas" })).toBeInTheDocument();
    cleanup();
    const { unmount } = render(<SinoNotificacoes inicial={150} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
    unmount();
    render(<SinoNotificacoes inicial={0} />);
    expect(screen.getAllByRole("button", { name: "Notificações" }).length).toBeGreaterThan(0);
  });

  it("faz polling só com a aba visível e atualiza o contador", async () => {
    render(<SinoNotificacoes inicial={0} />);
    await act(async () => vi.advanceTimersByTimeAsync(INTERVALO_POLLING_MS));
    expect(busca).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Notificações, 5 não lidas" })).toBeInTheDocument();

    act(() => visibilidade("hidden"));
    await act(async () => vi.advanceTimersByTimeAsync(INTERVALO_POLLING_MS * 3));
    expect(busca).toHaveBeenCalledTimes(1);

    await act(async () => visibilidade("visible"));
    expect(busca).toHaveBeenCalledTimes(2);
  });

  it("para de vez no 401 (sem loop)", async () => {
    busca.mockImplementation(() => resposta(401));
    render(<SinoNotificacoes inicial={2} />);
    await act(async () => vi.advanceTimersByTimeAsync(INTERVALO_POLLING_MS));
    expect(busca).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(INTERVALO_POLLING_MS * 5));
    await act(async () => visibilidade("visible"));
    expect(busca).toHaveBeenCalledTimes(1);
  });

  it("anuncia (aria-live) quando o contador sobe", async () => {
    render(<SinoNotificacoes inicial={1} />);
    await act(async () => vi.advanceTimersByTimeAsync(INTERVALO_POLLING_MS));
    expect(screen.getByRole("status")).toHaveTextContent("Você tem 5 notificações não lidas.");
  });

  it("painel: texto como texto, marcar uma lida baixa o contador e marcar todas zera", async () => {
    render(<SinoNotificacoes inicial={2} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Notificações, 2 não lidas" })));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("<b>Nova aula</b>")).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole("link", { name: /Ana publicou um aviso/ })));
    expect(acoes.acaoMarcarNotificacoesLidas).toHaveBeenCalledWith({ ids: ["a"] });
    expect(screen.getByRole("button", { name: "Notificações, 1 não lida" })).toBeInTheDocument();
  });

  it("marcar todas como lidas chama a action e zera o sino", async () => {
    render(<SinoNotificacoes inicial={2} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Notificações, 2 não lidas" })));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Marcar todas como lidas" })));
    expect(acoes.acaoMarcarNotificacoesLidas).toHaveBeenCalledWith({ todas: true });
    expect(screen.getByRole("button", { name: "Notificações" })).toBeInTheDocument();
  });
});
