import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Campo } from "./campo";

describe("Campo", () => {
  it("rotulo associado ao input", () => {
    render(<Campo rotulo="E-mail" />);
    expect(screen.getByLabelText("E-mail")).toBeInstanceOf(HTMLInputElement);
  });

  it("sem erro nao marca aria-invalid", () => {
    render(<Campo rotulo="Nome" />);
    expect(screen.getByLabelText("Nome")).not.toHaveAttribute("aria-invalid");
  });

  it("erro -> aria-invalid e aria-describedby apontando para a mensagem", () => {
    render(<Campo rotulo="E-mail" ajuda="O da matrícula." erro="Informe um e-mail válido." />);
    const input = screen.getByLabelText("E-mail");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("O da matrícula. Informe um e-mail válido.");
  });
});
