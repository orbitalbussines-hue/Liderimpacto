import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResponderTentativa, type ResponderTentativaProps } from "./responder-tentativa";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const acoes = vi.hoisted(() => ({ acaoResponder: vi.fn(), acaoFinalizarTentativa: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/actions/avaliacoes-aluno", () => acoes);

const base: ResponderTentativaProps = {
  avaliacao: { id: "av1", titulo: "Quiz · Cultura" },
  tentativa: { id: "t1", numero: 1, segundosRestantes: null },
  questoes: [
    { id: "q1", numero: 1, tipo: "UNICA", enunciado: "Quem define a cultura?", peso: 1, opcoes: [{ id: "a", texto: "O líder" }, { id: "b", texto: "O RH" }], resposta: [] },
    { id: "q2", numero: 2, tipo: "MULTIPLA", enunciado: "Quais sinais?", peso: 2, opcoes: [{ id: "a", texto: "Rituais" }, { id: "b", texto: "Símbolos" }], resposta: [] },
  ],
};

describe("ResponderTentativa", () => {
  beforeEach(() => {
    nav.push.mockReset();
    nav.refresh.mockReset();
    acoes.acaoResponder.mockReset();
    acoes.acaoFinalizarTentativa.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("marca na hora e grava a resposta da questão (otimista)", async () => {
    acoes.acaoResponder.mockResolvedValue({ ok: true, dados: { situacao: "salva" } });
    render(<ResponderTentativa {...base} />);
    fireEvent.click(screen.getByLabelText(/O líder/));
    expect(screen.getByLabelText(/O líder/)).toBeChecked();
    await waitFor(() => expect(acoes.acaoResponder).toHaveBeenCalledWith({ tentativaId: "t1", questaoId: "q1", opcoes: ["a"] }));
    await waitFor(() => expect(screen.getByText("Salvo")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Questão 1, respondida" })).toBeInTheDocument();
    expect(screen.getByText("1 de 2 respondidas", { exact: false })).toBeInTheDocument();
  });

  it("falhou: volta a marcação e mostra o erro", async () => {
    acoes.acaoResponder.mockResolvedValue({ ok: false, erro: "Tentativa encerrada." });
    render(<ResponderTentativa {...base} />);
    fireEvent.click(screen.getByLabelText(/O líder/));
    expect(screen.getByLabelText(/O líder/)).toBeChecked();
    expect(await screen.findByRole("alert")).toHaveTextContent("Tentativa encerrada.");
    expect(screen.getByLabelText(/O líder/)).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Questão 1, sem resposta" })).toBeInTheDocument();
  });

  it("múltipla soma as marcações e navega pelo mapa", async () => {
    acoes.acaoResponder.mockResolvedValue({ ok: true, dados: { situacao: "salva" } });
    render(<ResponderTentativa {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Questão 2, sem resposta" }));
    fireEvent.click(screen.getByLabelText(/Rituais/));
    fireEvent.click(screen.getByLabelText(/Símbolos/));
    await waitFor(() => expect(acoes.acaoResponder).toHaveBeenLastCalledWith({ tentativaId: "t1", questaoId: "q2", opcoes: ["a", "b"] }));
  });

  it("cronômetro do servidor chega a zero: trava e recarrega (o servidor fecha e redireciona)", () => {
    vi.useFakeTimers();
    render(<ResponderTentativa {...base} tentativa={{ ...base.tentativa, segundosRestantes: 3 }} />);
    expect(screen.getByRole("timer")).toHaveTextContent("0:03");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer")).toHaveTextContent("0:02");
    expect(nav.refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("timer")).toHaveTextContent("0:00");
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Tempo esgotado/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Finalizar" })[0]).toBeDisabled();
  });

  it("Finalizar mostra quantas faltam e leva ao resultado", async () => {
    acoes.acaoFinalizarTentativa.mockResolvedValue({ ok: true, dados: { tentativaId: "t1", nota: 0, aprovada: false, finalizadaPor: "ALUNO" } });
    render(<ResponderTentativa {...base} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Finalizar" })[0]);
    expect(screen.getByText(/2 questões sem resposta contam como erradas/)).toBeInTheDocument();
    // Modal block: 3 s travado antes de liberar.
    await new Promise((r) => setTimeout(r, 3100));
    fireEvent.click(screen.getByRole("button", { name: "Finalizar e corrigir" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/avaliacoes/av1/resultado/t1"));
    expect(acoes.acaoFinalizarTentativa).toHaveBeenCalledWith({ tentativaId: "t1" });
  }, 10_000);
});
