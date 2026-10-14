/**
 * TEMPLATE-OURO: teste de componente (Vitest + Testing Library).
 * Copie para o lado do componente: lancamentos-lista.test.tsx.
 * Cobre: estado vazio, render, RBAC na tela e o caminho critico (block de 3 s).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LancamentosLista } from "./lancamentos-lista";

// O teste de componente nao toca no banco: a action e mockada.
vi.mock("@/lib/actions/contratos-lancamentos", () => ({
  excluir: vi.fn().mockResolvedValue({ ok: true, dados: { id: "1" } }),
}));
import { excluir } from "@/lib/actions/contratos-lancamentos";

const item = {
  id: "1",
  contrato_id: "c1",
  descricao: "Aluguel",
  valor: "1500.00",
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-02T00:00:00Z"),
  deleted_at: null,
  is_deleted: false,
  modified_by: "u1",
};

/** Avanca um segundo por vez: cada tick agenda o proximo depois de renderizar. */
function passarSegundos(n: number) {
  for (let i = 0; i < n; i++) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
}

describe("LancamentosLista", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("mostra estado vazio", () => {
    render(<LancamentosLista itens={[]} podeExcluir />);
    expect(screen.getByText(/nenhum lancamento/i)).toBeInTheDocument();
  });

  it("renderiza os itens", () => {
    render(<LancamentosLista itens={[item]} podeExcluir />);
    expect(screen.getByText("Aluguel")).toBeInTheDocument();
  });

  it("esconde o botao sem permissao", () => {
    render(<LancamentosLista itens={[item]} podeExcluir={false} />);
    expect(screen.queryByRole("button", { name: /excluir/i })).toBeNull();
  });

  it("so confirma a exclusao depois do block de 3 s", () => {
    vi.useFakeTimers();
    render(<LancamentosLista itens={[item]} podeExcluir />);

    fireEvent.click(screen.getByRole("button", { name: /excluir/i }));
    const dialogo = screen.getByRole("alertdialog");
    const confirmar = screen.getAllByRole("button", { name: /excluir/i }).at(-1)!;
    expect(dialogo).toContainElement(confirmar);
    expect(confirmar).toBeDisabled();

    passarSegundos(2);
    expect(confirmar).toBeDisabled();

    passarSegundos(1);
    expect(confirmar).toBeEnabled();

    fireEvent.click(confirmar);
    expect(excluir).toHaveBeenCalledWith("1", item.updated_at);
  });
});
