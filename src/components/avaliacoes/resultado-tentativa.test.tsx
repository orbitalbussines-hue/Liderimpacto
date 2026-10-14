import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultadoTentativa, type ResultadoTentativaProps } from "./resultado-tentativa";

const base: ResultadoTentativaProps = {
  avaliacao: { notaMinima: 70, curso: { slug: "lider" } },
  tentativa: { numero: 1, nota: 50, aprovada: false, finalizadaPor: "ALUNO", duracaoSeg: 300, acertos: 1, total: 2 },
  melhorNota: 50,
  revelaGabarito: false,
  liberouModulo: false,
  contaParaCertificado: false,
  questoes: [
    {
      id: "q1",
      numero: 1,
      tipo: "UNICA",
      enunciado: "Quem define a cultura?",
      peso: 1,
      correta: false,
      opcoes: [
        { id: "a", texto: "O líder", marcada: false, correta: null },
        { id: "b", texto: "O RH", marcada: true, correta: null },
      ],
      explicacao: null,
    },
  ],
};

const revelado: ResultadoTentativaProps = {
  ...base,
  tentativa: { ...base.tentativa, nota: 100, aprovada: true, acertos: 2 },
  melhorNota: 100,
  revelaGabarito: true,
  liberouModulo: true,
  contaParaCertificado: true,
  questoes: [
    {
      ...base.questoes[0],
      correta: true,
      opcoes: [
        { id: "a", texto: "O líder", marcada: true, correta: true },
        { id: "b", texto: "O RH", marcada: false, correta: false },
      ],
      explicacao: "A cultura nasce do que o líder tolera.",
    },
  ],
};

describe("ResultadoTentativa", () => {
  it("reprovado sem gabarito: só certa/errada e a resposta dada", () => {
    render(<ResultadoTentativa {...base} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Reprovado")).toBeInTheDocument();
    expect(screen.getByText("Errada")).toBeInTheDocument();
    expect(screen.getByText("Sua resposta")).toBeInTheDocument();
    expect(screen.queryByText("Resposta correta")).toBeNull();
    expect(screen.queryByText(/Explicação/)).toBeNull();
    expect(screen.getByText(/gabarito desta prova aparece/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver certificado" })).toBeNull();
  });

  it("com gabarito: correta, explicação e o que a aprovação liberou", () => {
    render(<ResultadoTentativa {...revelado} />);
    expect(screen.getByText("Aprovado")).toBeInTheDocument();
    expect(screen.getByText("Sua resposta · correta")).toBeInTheDocument();
    expect(screen.getByText(/A cultura nasce/)).toBeInTheDocument();
    expect(screen.getByText(/liberou o próximo módulo/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver certificado" })).toHaveAttribute("href", "/certificados");
    expect(screen.getByRole("link", { name: "Voltar ao curso" })).toHaveAttribute("href", "/cursos/lider");
    expect(screen.queryByText(/gabarito desta prova aparece/)).toBeNull();
  });

  it("não presume gabarito com o servidor mandando null", () => {
    render(<ResultadoTentativa {...base} revelaGabarito={true} />);
    expect(screen.queryByText(/correta/)).toBeNull();
    expect(screen.getByText("Sua resposta")).toBeInTheDocument();
  });

  it("errou com gabarito: aponta a correta e a marcada como incorreta", () => {
    const q = { ...base.questoes[0], opcoes: [{ id: "a", texto: "O líder", marcada: false, correta: true }, { id: "b", texto: "O RH", marcada: true, correta: false }] };
    render(<ResultadoTentativa {...base} revelaGabarito={true} questoes={[q]} />);
    expect(screen.getByText("Resposta correta")).toBeInTheDocument();
    expect(screen.getByText("Sua resposta · incorreta")).toBeInTheDocument();
  });
});
