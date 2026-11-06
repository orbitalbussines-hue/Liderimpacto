import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CartaoFileira } from "./cartao-fileira";
import { varianteDoTipo, type ItemFileira } from "./tipos";

const item: ItemFileira = { id: "a", titulo: "Aula A", href: "/aula/a", progresso: 42 };

describe("CartaoFileira", () => {
  it("top10 mostra o numeral", () => {
    render(<CartaoFileira item={item} variante="top10" posicao={7} />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("progresso mostra a barra com aria-valuenow", () => {
    render(<CartaoFileira item={item} variante="progresso" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
  });

  it("novo mostra o selo Novo; null suprime", () => {
    const { rerender } = render(<CartaoFileira item={item} variante="novo" />);
    expect(screen.getByText("Novo")).toBeInTheDocument();
    rerender(<CartaoFileira item={{ ...item, selo: null }} variante="novo" />);
    expect(screen.queryByText("Novo")).not.toBeInTheDocument();
  });

  it("tipo da fileira escolhe a variante", () => {
    expect(varianteDoTipo("CONTINUAR")).toBe("progresso");
    expect(varianteDoTipo("TOP10")).toBe("top10");
    expect(varianteDoTipo("NOVIDADES")).toBe("novo");
    expect(varianteDoTipo("MENTORIAS")).toBe("padrao");
    expect(varianteDoTipo("MODULOS")).toBe("modulo");
  });

  it("modulo: capa 3:4 com selo MÓDULO N, nome único do link, progresso e link para o módulo", () => {
    const m: ItemFileira = { id: "m2", titulo: "Delegar sem largar", subtitulo: "4 aulas", href: "/cursos/lider#modulo-m2", imagemUrl: "/capa-m2.png", selo: "MÓDULO 2", progresso: 50 };
    render(<CartaoFileira item={m} variante="modulo" />);
    expect(screen.getByRole("link", { name: "Módulo 2: Delegar sem largar, 4 aulas, 50% concluído" })).toHaveAttribute("href", "/cursos/lider#modulo-m2");
    expect(screen.getByText("MÓDULO 2")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument(); // alt="": o nome vem do link
    expect(screen.getByRole("progressbar", { name: "Progresso em Delegar sem largar" })).toHaveAttribute("aria-valuenow", "50");
  });

  it("modulo sem imagem: título grande no lugar da capa; sem matrícula, sem barra", () => {
    render(<CartaoFileira item={{ id: "m1", titulo: "Fundamentos", href: "/cursos/lider#modulo-m1", selo: "MÓDULO 1" }} variante="modulo" />);
    expect(screen.getAllByText("Fundamentos")).toHaveLength(2);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
