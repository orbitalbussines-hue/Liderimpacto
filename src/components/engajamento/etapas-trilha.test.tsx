import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EtapasTrilha } from "./etapas-trilha";

describe("EtapasTrilha", () => {
  it("sem estados: as primeiras `concluidas` são as concluídas", () => {
    render(<EtapasTrilha total={3} concluidas={1} />);
    expect(screen.getByRole("list", { name: "1 de 3 etapas concluídas" })).toBeInTheDocument();
    expect(screen.getByLabelText("Etapa 1: concluída")).toHaveClass("bg-accent");
    expect(screen.getByLabelText("Etapa 2: disponível")).not.toHaveClass("bg-accent");
  });

  it("com estados reais: o dourado segue a etapa concluída, não a posição", () => {
    render(<EtapasTrilha total={4} concluidas={0} estados={["concluido", "bloqueado", "concluido", "andamento"]} />);
    expect(screen.getByRole("list", { name: "2 de 4 etapas concluídas" })).toBeInTheDocument();
    expect(screen.getByLabelText("Etapa 1: concluída")).toHaveClass("bg-accent");
    expect(screen.getByLabelText("Etapa 2: bloqueada")).toHaveClass("text-muted");
    expect(screen.getByLabelText("Etapa 3: concluída")).toHaveClass("bg-accent");
    expect(screen.getByLabelText("Etapa 4: em andamento")).toHaveClass("border-accent", "text-accent");
  });
});
