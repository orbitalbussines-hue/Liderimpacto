import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CampoSenha } from "./campo-senha";

describe("CampoSenha", () => {
  it("mostrar/ocultar troca o tipo do campo e o aria-pressed do botao", async () => {
    render(<CampoSenha rotulo="Senha" autoComplete="current-password" />);
    const campo = screen.getByLabelText("Senha");
    const botao = screen.getByRole("button", { name: "Mostrar senha" });
    expect(campo).toHaveAttribute("type", "password");
    expect(botao).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(botao);
    expect(campo).toHaveAttribute("type", "text");
    expect(botao).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(botao);
    expect(campo).toHaveAttribute("type", "password");
  });

  it("o botao nao envia o formulario", async () => {
    let enviado = false;
    render(
      <form onSubmit={(e) => (e.preventDefault(), (enviado = true))}>
        <CampoSenha rotulo="Senha" />
      </form>
    );
    await userEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(enviado).toBe(false);
  });

  it("avisa quando o Caps Lock esta ligado", async () => {
    render(<CampoSenha rotulo="Senha" />);
    await userEvent.click(screen.getByLabelText("Senha"));
    await userEvent.keyboard("{CapsLock}A");
    expect(screen.getByLabelText("Senha")).toHaveAccessibleDescription("Caps Lock está ativado.");
  });
});
