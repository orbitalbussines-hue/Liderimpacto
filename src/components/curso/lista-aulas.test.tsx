import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListaAulas } from "./lista-aulas";

describe("ListaAulas", () => {
  it("marca aria-current só na aula atual e mostra o contador", () => {
    render(
      <ListaAulas
        tituloCurso="Líder de Impacto"
        aulasConcluidas={12}
        totalAulas={28}
        grupos={[
          {
            id: "m3",
            titulo: "Módulo 3 · Cultura",
            aulas: [
              { id: "a", titulo: "Aula feita", duracao: "18 min", estado: "concluida", href: "/aula/a" },
              { id: "b", titulo: "Aula atual", duracao: "22 min", estado: "atual", href: "/aula/b" },
              { id: "c", titulo: "Aula futura", duracao: "19 min", estado: "pendente", href: "/aula/c" },
            ],
          },
        ]}
      />
    );
    expect(screen.getByText("12/28")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Aula atual/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Aula feita/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /Aula futura/ })).not.toHaveAttribute("aria-current");
  });
});
