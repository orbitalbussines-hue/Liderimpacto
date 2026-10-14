import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorQuestao, trocarTipo, type QuestaoEntrada } from "./editor-questao";

const abrir = (inicial?: QuestaoEntrada) => {
  const onSalvar = vi.fn();
  render(<EditorQuestao aberto onFechar={vi.fn()} titulo="Nova questão" carregando={false} erro={null} onSalvar={onSalvar} inicial={inicial} />);
  return onSalvar;
};
const preencher = () => {
  fireEvent.change(screen.getByLabelText("Enunciado"), { target: { value: "Qual é a cor do céu?" } });
  fireEvent.change(screen.getByLabelText("Texto da opção A"), { target: { value: "Azul" } });
  fireEvent.change(screen.getByLabelText("Texto da opção B"), { target: { value: "Verde" } });
};
const salvar = () => fireEvent.click(screen.getByRole("button", { name: "Salvar questão" }));

describe("EditorQuestao (validação com o questaoSchema)", () => {
  it("válida: manda no formato da action", () => {
    const onSalvar = abrir();
    preencher();
    salvar();
    expect(onSalvar).toHaveBeenCalledWith({
      tipo: "UNICA",
      enunciado: "Qual é a cor do céu?",
      opcoes: [
        { texto: "Azul", correta: true },
        { texto: "Verde", correta: false },
      ],
      peso: 1,
      explicacao: null,
    });
  });

  it("recusa sem nenhuma correta", () => {
    const onSalvar = abrir();
    preencher();
    fireEvent.click(screen.getByRole("radio", { name: "Múltipla escolha" }));
    fireEvent.click(screen.getByLabelText("Opção A correta"));
    salvar();
    expect(screen.getByRole("alert")).toHaveTextContent("Marque a opção correta.");
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it("ÚNICA fica com exatamente 1 correta (vindo da múltipla com 2)", () => {
    const onSalvar = abrir();
    preencher();
    fireEvent.click(screen.getByRole("radio", { name: "Múltipla escolha" }));
    fireEvent.click(screen.getByLabelText("Opção B correta"));
    expect(screen.getByLabelText("Opção A correta")).toBeChecked();
    expect(screen.getByLabelText("Opção B correta")).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Única escolha" }));
    expect(screen.getByLabelText("Opção A correta")).toBeChecked();
    expect(screen.getByLabelText("Opção B correta")).not.toBeChecked();
    salvar();
    expect(onSalvar.mock.calls[0][0].opcoes.filter((o: { correta: boolean }) => o.correta)).toHaveLength(1);
  });

  it("verdadeiro ou falso: 2 opções fixas, sem adicionar", () => {
    const onSalvar = abrir();
    fireEvent.change(screen.getByLabelText("Enunciado"), { target: { value: "O céu é azul." } });
    fireEvent.click(screen.getByRole("radio", { name: "Verdadeiro ou falso" }));
    expect(screen.getByLabelText("Texto da opção A")).toHaveValue("Verdadeiro");
    expect(screen.getByLabelText("Texto da opção B")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Adicionar opção" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Opção B correta"));
    salvar();
    expect(onSalvar.mock.calls[0][0].opcoes).toEqual([
      { texto: "Verdadeiro", correta: false },
      { texto: "Falso", correta: true },
    ]);
  });

  it("recusa opções repetidas e respeita 2..8", () => {
    const onSalvar = abrir();
    preencher();
    fireEvent.change(screen.getByLabelText("Texto da opção B"), { target: { value: "azul" } });
    salvar();
    expect(screen.getByRole("alert")).toHaveTextContent("Duas opções com o mesmo texto.");
    expect(screen.getByRole("button", { name: "Remover opção A" })).toBeDisabled();
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole("button", { name: "Adicionar opção" }));
    expect(screen.getByLabelText("Texto da opção H")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar opção" })).toBeNull();
    expect(onSalvar).not.toHaveBeenCalled();
  });
});

describe("trocarTipo", () => {
  const base: QuestaoEntrada = { tipo: "MULTIPLA", enunciado: "x", opcoes: [{ texto: "a", correta: false }, { texto: "b", correta: true }, { texto: "c", correta: true }], peso: 1, explicacao: null };
  it("múltipla → única mantém a primeira correta", () => {
    expect(trocarTipo(base, "UNICA").opcoes.map((o) => o.correta)).toEqual([false, true, false]);
  });
  it("V/F → múltipla volta a 2 opções editáveis", () => {
    const vf = trocarTipo(base, "VERDADEIRO_FALSO");
    expect(vf.opcoes.map((o) => o.texto)).toEqual(["Verdadeiro", "Falso"]);
    expect(trocarTipo(vf, "MULTIPLA").opcoes.map((o) => o.texto)).toEqual(["", ""]);
  });
});
