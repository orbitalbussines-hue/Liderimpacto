import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReenviarAcesso } from "./reenviar-acesso";

const acoes = vi.hoisted(() => ({ acaoContarReenvioPrimeiroAcesso: vi.fn(), acaoReenviarPrimeiroAcesso: vi.fn() }));
vi.mock("@/lib/actions/campanhas", () => acoes);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const GRUPOS = [{ id: "11111111-1111-4111-8111-111111111111", nome: "Turma Outubro" }];
const LIMITE = { hora: 100, dia: 1000 };

describe("ReenviarAcesso", () => {
  afterEach(() => vi.resetAllMocks());

  it("conta pelo filtro, confirma com bloqueio e mostra o resultado", async () => {
    acoes.acaoContarReenvioPrimeiroAcesso.mockResolvedValue({ ok: true, dados: { total: 140, receberao: 138, foraDaRegra: 2 } });
    acoes.acaoReenviarPrimeiroAcesso.mockResolvedValue({ ok: true, dados: { lote: "l", enfileirados: 138, foraDaRegra: 2, alemDoLimite: 0 } });
    render(<ReenviarAcesso grupos={GRUPOS} grupoInicial={GRUPOS[0].id} emailLigado limite={LIMITE} />);

    fireEvent.click(screen.getByRole("button", { name: "Reenviar acesso" }));
    expect(await screen.findByText("138 pessoas vão receber um link novo por e-mail")).toBeInTheDocument();
    const publico = { grupoIds: [GRUPOS[0].id], tagIds: [], produtoIds: [], nuncaAcessou: true };
    expect(acoes.acaoContarReenvioPrimeiroAcesso).toHaveBeenLastCalledWith({ publico });
    expect(screen.getByText(/cerca de 1h30/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reenviar para 138 pessoas" }));
    const confirmar = await screen.findByRole("button", { name: "Reenviar" });
    expect(confirmar).toBeDisabled();
    await waitFor(() => expect(confirmar).toBeEnabled(), { timeout: 4000 });
    fireEvent.click(confirmar);

    expect(await screen.findByText("Reenvio a caminho")).toBeInTheDocument();
    expect(acoes.acaoReenviarPrimeiroAcesso).toHaveBeenCalledExactlyOnceWith({ publico });
  });

  it("sem e-mail configurado, não deixa reenviar", async () => {
    acoes.acaoContarReenvioPrimeiroAcesso.mockResolvedValue({ ok: true, dados: { total: 5, receberao: 5, foraDaRegra: 0 } });
    render(<ReenviarAcesso grupos={GRUPOS} emailLigado={false} limite={LIMITE} />);
    fireEvent.click(screen.getByRole("button", { name: "Reenviar acesso" }));
    await screen.findByText("5 pessoas vão receber um link novo por e-mail");
    expect(screen.getByRole("button", { name: "Reenviar para 5 pessoas" })).toBeDisabled();
    expect(acoes.acaoReenviarPrimeiroAcesso).not.toHaveBeenCalled();
  });
});
