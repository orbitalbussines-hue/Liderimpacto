import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EtapaTrilha, type EtapaTrilhaProps } from "./etapa-trilha";

const curso: EtapaTrilhaProps = {
  numero: 2,
  tipo: "PRODUTO",
  titulo: "Comunicação",
  subtitulo: "Curso",
  href: "/cursos/comunicacao",
  estado: "disponivel",
  motivo: null,
  textoMotivo: null,
  percentual: 0,
  duracaoSeg: 5400,
};
const em = (p: Partial<EtapaTrilhaProps>) =>
  render(
    <ol>
      <EtapaTrilha {...curso} {...p} />
    </ol>,
  );

describe("EtapaTrilha (estados e motivos)", () => {
  it("disponível: Começar leva ao curso; duração no detalhe", () => {
    em({});
    expect(screen.getByRole("link", { name: "Começar: Comunicação" })).toHaveAttribute("href", "/cursos/comunicacao");
    expect(screen.getByText("Curso · 1h 30")).toBeInTheDocument();
    expect(screen.getByText("Disponível")).toBeInTheDocument();
  });
  it("em andamento: Continuar + barra de progresso", () => {
    em({ estado: "andamento", percentual: 40 });
    expect(screen.getByRole("link", { name: "Continuar: Comunicação" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
  });
  it("concluída: Rever", () => {
    em({ estado: "concluido" });
    expect(screen.getByRole("link", { name: "Rever: Comunicação" })).toBeInTheDocument();
    expect(screen.getByText("Concluída")).toBeInTheDocument();
  });
  it("bloqueada pela anterior: motivo sem link", () => {
    em({ estado: "bloqueado", motivo: "ANTERIOR", textoMotivo: "Conclua a etapa anterior" });
    expect(screen.getByText("Conclua a etapa anterior")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("bloqueada por matrícula: Matricule-se leva à página do curso", () => {
    em({ estado: "bloqueado", motivo: "MATRICULA", textoMotivo: "Matricule-se" });
    expect(screen.getByRole("link", { name: "Matricule-se" })).toHaveAttribute("href", "/cursos/comunicacao");
  });
  it("avaliação: tipo, curso e melhor nota", () => {
    em({
      tipo: "AVALIACAO",
      titulo: "Prova final",
      subtitulo: "Prova · Líder de Impacto",
      href: "/avaliacoes/a1",
      estado: "bloqueado",
      motivo: "AULAS_PENDENTES",
      textoMotivo: "Conclua as aulas antes",
      percentual: 60,
      duracaoSeg: 0,
    });
    expect(screen.getByText("Prova · Líder de Impacto · melhor nota 60%")).toBeInTheDocument();
    expect(screen.getByText("Conclua as aulas antes")).toBeInTheDocument();
  });
});
