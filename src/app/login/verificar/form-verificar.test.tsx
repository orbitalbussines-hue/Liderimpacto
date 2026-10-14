import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const verificarCodigo = vi.fn<(estado: unknown, dados: FormData) => Promise<{ erro: string }>>(async () => ({
  erro: "Código incorreto ou expirado.",
}));
vi.mock("@/lib/actions/auth", () => ({ verificarCodigo: (e: unknown, d: FormData) => verificarCodigo(e, d) }));

const { FormVerificar } = await import("./form-verificar");

describe("FormVerificar", () => {
  it("envia sozinho no 6o digito, mostra a recusa e limpa as caixas", async () => {
    render(<FormVerificar destino="/curso/x" />);
    await userEvent.keyboard("424242");
    await waitFor(() => expect(verificarCodigo).toHaveBeenCalledTimes(1));
    const dados = verificarCodigo.mock.calls[0][1];
    expect(dados.get("codigo")).toBe("424242");
    expect(dados.get("de")).toBe("/curso/x");
    expect(await screen.findByRole("alert")).toHaveTextContent("Código incorreto ou expirado.");
    await waitFor(() => expect(screen.getByLabelText("Dígito 1 de 6")).toHaveValue(""));
  });

  it("alterna para o codigo de recuperacao", async () => {
    render(<FormVerificar />);
    await userEvent.click(screen.getByRole("button", { name: "Usar um código de recuperação" }));
    expect(screen.getByLabelText("Código de recuperação")).toHaveAttribute("name", "codigo");
  });
});
