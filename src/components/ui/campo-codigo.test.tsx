import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CampoCodigo } from "./campo-codigo";

const caixas = () => screen.getAllByRole("textbox") as HTMLInputElement[];
const oculto = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[type="hidden"]')!;

describe("CampoCodigo", () => {
  it("digitar avanca a caixa e chama onCompleto no 6o digito", async () => {
    const onCompleto = vi.fn();
    const { container } = render(<CampoCodigo name="codigo" rotulo="Código" onCompleto={onCompleto} autoFocus />);
    await userEvent.keyboard("12345");
    expect(onCompleto).not.toHaveBeenCalled();
    expect(caixas()[5]).toHaveFocus();
    await userEvent.keyboard("6");
    expect(onCompleto).toHaveBeenCalledExactlyOnceWith("123456");
    expect(oculto(container).value).toBe("123456");
  });

  it("colar o codigo inteiro preenche todas as caixas (ignora o que nao e digito)", async () => {
    const onCompleto = vi.fn();
    const { container } = render(<CampoCodigo name="codigo" rotulo="Código" onCompleto={onCompleto} />);
    await userEvent.click(caixas()[0]);
    await userEvent.paste("987 654");
    expect(caixas().map((c) => c.value)).toEqual(["9", "8", "7", "6", "5", "4"]);
    expect(oculto(container).value).toBe("987654");
    expect(onCompleto).toHaveBeenCalledWith("987654");
  });

  it("backspace na caixa vazia volta e apaga a anterior; setas navegam", async () => {
    render(<CampoCodigo name="codigo" rotulo="Código" autoFocus />);
    await userEvent.keyboard("12");
    expect(caixas()[2]).toHaveFocus();
    await userEvent.keyboard("{Backspace}");
    expect(caixas()[1]).toHaveFocus();
    expect(caixas()[1].value).toBe("");
    await userEvent.keyboard("{ArrowLeft}");
    expect(caixas()[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(caixas()[1]).toHaveFocus();
  });

  it("letras sao recusadas e cada caixa tem teclado numerico e nome acessivel", async () => {
    render(<CampoCodigo name="codigo" rotulo="Código" autoFocus />);
    await userEvent.keyboard("a");
    expect(caixas()[0].value).toBe("");
    expect(caixas()[0]).toHaveAttribute("inputmode", "numeric");
    expect(caixas()[0]).toHaveAttribute("autocomplete", "one-time-code");
    expect(screen.getByLabelText("Dígito 1 de 6")).toBe(caixas()[0]);
    expect(screen.getByRole("group", { name: "Código" })).toBeInTheDocument();
  });
});
