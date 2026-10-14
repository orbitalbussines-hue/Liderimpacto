import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MIN_SENHA } from "@/lib/validators/senha";
import { nivelDaSenha, RequisitosSenha } from "./requisitos-senha";

const frase = (n: number) => "rio azul de manhã ".repeat(n).slice(0, n);

describe("RequisitosSenha", () => {
  it("o nivel segue a politica real (MIN_SENHA e problemaNaSenha)", () => {
    expect(nivelDaSenha("")).toBe("vazia");
    expect(nivelDaSenha(frase(MIN_SENHA - 1))).toBe("curta");
    expect(nivelDaSenha("1".repeat(MIN_SENHA))).toBe("recusada");
    expect(nivelDaSenha(frase(MIN_SENHA))).toBe("aceita");
    expect(nivelDaSenha(frase(MIN_SENHA * 2))).toBe("longa");
  });

  it("o texto do requisito usa a constante, nao um numero fixo", () => {
    render(<RequisitosSenha senha="" />);
    expect(screen.getByText(`Pelo menos ${MIN_SENHA} caracteres`)).toBeInTheDocument();
  });
});
