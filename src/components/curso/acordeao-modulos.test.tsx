import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AcordeaoModulos } from "./acordeao-modulos";
import type { ModuloCurso } from "./tipos";

const modulos: ModuloCurso[] = [
  { id: "1", numero: "01", titulo: "Fundamentos", totalAulas: 5, duracao: "1h 40", estado: "concluido", aulas: [] },
  {
    id: "3",
    numero: "03",
    titulo: "Cultura",
    totalAulas: 2,
    duracao: "40 min",
    estado: "andamento",
    aulas: [
      { id: "a", titulo: "Aula feita", duracao: "18 min", estado: "concluida", href: "/aula/a" },
      { id: "b", titulo: "Aula atual", duracao: "22 min", estado: "atual", href: "/aula/b" },
    ],
  },
  {
    id: "4",
    numero: "04",
    titulo: "Pessoas",
    totalAulas: 1,
    duracao: "20 min",
    estado: "bloqueado",
    aulas: [{ id: "c", titulo: "Aula trancada", duracao: "20 min", estado: "pendente", href: "/aula/c" }],
  },
];

describe("AcordeaoModulos", () => {
  it("módulo em andamento nasce aberto e marca a aula atual", () => {
    render(<AcordeaoModulos modulos={modulos} />);
    expect(screen.getByRole("button", { name: /Cultura/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /Aula atual/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("link", { name: /Aula feita/ })).not.toHaveAttribute("aria-current");
  });

  it("abre e fecha pelo botão", () => {
    render(<AcordeaoModulos modulos={modulos} />);
    const bloqueado = screen.getByRole("button", { name: /Pessoas/ });
    expect(bloqueado).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /Aula trancada/ })).not.toBeInTheDocument();
    fireEvent.click(bloqueado);
    expect(bloqueado).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /Aula trancada/ })).toBeInTheDocument();
    fireEvent.click(bloqueado);
    expect(bloqueado).toHaveAttribute("aria-expanded", "false");
  });

  it("módulo sem aulas não é botão", () => {
    render(<AcordeaoModulos modulos={modulos} />);
    expect(screen.queryByRole("button", { name: /Fundamentos/ })).not.toBeInTheDocument();
    expect(screen.getByText("Concluído")).toBeInTheDocument();
  });
});

describe("AcordeaoModulos: aulas travadas", () => {
  const travado: ModuloCurso[] = [
    {
      id: "5",
      numero: "05",
      titulo: "Legado",
      totalAulas: 3,
      duracao: "1h",
      estado: "bloqueado",
      aulas: [
        { id: "x", titulo: "Delegação", duracao: "21 min", estado: "pendente", href: "/aula/x", bloqueio: "Libera em 26/10" },
        { id: "y", titulo: "Resultados", duracao: "26 min", estado: "pendente", href: "/aula/y", bloqueio: "Conclua a aula 3.5" },
        { id: "z", titulo: "Encontro", duracao: "1h", estado: "pendente", href: "/aula/z", bloqueio: "Matricule-se" },
      ],
    },
  ];

  it("mostra o motivo de cada bloqueio e a aula travada não é link", () => {
    render(<AcordeaoModulos modulos={travado} />);
    fireEvent.click(screen.getByRole("button", { name: /Legado/ }));
    expect(screen.getByText("Libera em 26/10")).toBeInTheDocument();
    expect(screen.getByText("Conclua a aula 3.5")).toBeInTheDocument();
    expect(screen.getByText("Matricule-se")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("módulo de 1 aula no singular", () => {
    render(<AcordeaoModulos modulos={[{ ...travado[0], totalAulas: 1, aulas: [] }]} />);
    expect(screen.getByText(/1 aula ·/)).toBeInTheDocument();
  });
});
