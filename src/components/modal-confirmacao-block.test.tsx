import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalConfirmacaoBlock } from "./modal-confirmacao-block";

/** Avanca um segundo por vez: cada tick agenda o proximo depois de renderizar. */
function passarSegundos(n: number) {
  for (let i = 0; i < n; i++) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
}

describe("ModalConfirmacaoBlock", () => {
  afterEach(() => vi.useRealTimers());

  it("trava os dois botoes nos 3 s iniciais e depois libera", () => {
    vi.useFakeTimers();
    const onConfirmar = vi.fn();
    render(
      <ModalConfirmacaoBlock
        aberto
        titulo="Remover fileira?"
        mensagem="Sai da vitrine de todos."
        textoConfirmar="Remover"
        onConfirmar={onConfirmar}
        onCancelar={() => {}}
      />
    );
    const confirmar = screen.getByRole("button", { name: "Remover" });
    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    expect(confirmar).toBeDisabled();
    expect(cancelar).toBeDisabled();

    passarSegundos(2);
    expect(confirmar).toBeDisabled();

    passarSegundos(1);
    expect(confirmar).toBeEnabled();
    expect(cancelar).toBeEnabled();
    fireEvent.click(confirmar);
    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });

  it("ESC nao fecha nem cancela", () => {
    const onCancelar = vi.fn();
    render(
      <ModalConfirmacaoBlock aberto titulo="Excluir?" mensagem="Resumo." onConfirmar={() => {}} onCancelar={onCancelar} />
    );
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onCancelar).not.toHaveBeenCalled();
  });
});
