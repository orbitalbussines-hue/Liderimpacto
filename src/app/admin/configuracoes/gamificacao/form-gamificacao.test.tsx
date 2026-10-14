import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormGamificacao } from "./form-gamificacao";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
const acao = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/actions/gamificacao", () => ({ acaoSalvarConfigGamificacao: acao }));

const inicial = {
  ligada: false,
  pontos: { aulaConcluida: 10, cursoConcluido: 100, avaliacaoAprovada: 30, publicacaoComunidade: 2 },
  niveis: [
    { nome: "Iniciante", minimo: 0 },
    { nome: "Aprendiz", minimo: 100 },
  ],
  versao: null,
};

describe("FormGamificacao", () => {
  afterEach(() => {
    vi.useRealTimers();
    acao.mockReset();
  });

  it("níveis fora de ordem não saem da tela", () => {
    render(<FormGamificacao inicial={inicial} />);
    fireEvent.change(screen.getAllByLabelText("A partir de")[1], { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar configuração" }));
    expect(screen.getByText("Os pontos mínimos precisam crescer de um nível para o seguinte.")).toBeInTheDocument();
    expect(acao).not.toHaveBeenCalled();
  });

  it("ligar passa pelo modal block e mostra quantos lançamentos retroativos saíram", async () => {
    vi.useFakeTimers();
    acao.mockResolvedValue({ ok: true, dados: { versao: new Date().toISOString(), recalculo: { AULA_CONCLUIDA: 3, CURSO_CONCLUIDO: 1, AVALIACAO_APROVADA: 0, PUBLICACAO_COMUNIDADE: 0, DESAFIO_CONCLUIDO: 0, desafiosConcluidos: 0 } } });
    render(<FormGamificacao inicial={inicial} />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar configuração" }));
    const ligar = screen.getByRole("button", { name: "Ligar" });
    expect(ligar).toBeDisabled();
    for (let i = 0; i < 3; i++) act(() => void vi.advanceTimersByTime(1000));
    await act(async () => fireEvent.click(ligar));
    expect(acao).toHaveBeenCalledWith(expect.objectContaining({ ligada: true, versao: null }));
    expect(screen.getByText(/4 lançamentos retroativos/)).toBeInTheDocument();
  });
});
