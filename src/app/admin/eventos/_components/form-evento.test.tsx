import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
const acoes = vi.hoisted(() => ({ acaoCriarEvento: vi.fn(), acaoSalvarEvento: vi.fn() }));
vi.mock("@/lib/actions/eventos", () => acoes);

import { FormEvento } from "./form-evento";

const C1 = "00000000-0000-4000-8000-0000000000c1";
const G1 = "00000000-0000-4000-8000-0000000000a1";
const G2 = "00000000-0000-4000-8000-0000000000a2";
const OPCOES = { cursos: [{ id: C1, titulo: "Liderança 360" }], grupos: [{ id: G1, nome: "Turma A" }, { id: G2, nome: "Mentoria" }], aulas: [] };

function preencher() {
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Mentoria em grupo" } });
  fireEvent.change(screen.getByLabelText("Início"), { target: { value: "2026-10-21T19:30" } });
  fireEvent.change(screen.getByLabelText("Link da sala"), { target: { value: "https://meet.google.com/abc" } });
}

describe("FormEvento", () => {
  beforeEach(() => vi.resetAllMocks());

  it("o público decide os campos: curso só em 'Alunos de um curso', grupos só em 'Grupos'", () => {
    render(<FormEvento opcoes={OPCOES} />);
    expect(screen.queryByLabelText("Curso")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Alunos de um curso" }));
    expect(screen.getByLabelText("Curso")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Grupos" }));
    expect(screen.queryByLabelText("Curso")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Turma A" })).toBeInTheDocument();
  });

  it("criar manda os campos lidos do form (grupos marcados) e vai para o editor", async () => {
    acoes.acaoCriarEvento.mockResolvedValue({ ok: true, dados: { id: "novo-id", versao: "v" } });
    render(<FormEvento opcoes={OPCOES} />);
    preencher();
    fireEvent.click(screen.getByRole("radio", { name: "Grupos" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Mentoria" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Criar rascunho" })));
    expect(acoes.acaoCriarEvento).toHaveBeenCalledWith({
      titulo: "Mentoria em grupo",
      descricao: "",
      inicio: "2026-10-21T19:30",
      duracaoMin: 60,
      link: "https://meet.google.com/abc",
      publico: "GRUPOS",
      produtoId: null,
      grupoIds: [G2],
      gravacaoAulaId: null,
    });
    expect(nav.push).toHaveBeenCalledWith("/admin/eventos/novo-id");
  });

  it("recusa da action aparece na tela; cancelado é só leitura", async () => {
    acoes.acaoSalvarEvento.mockResolvedValue({ ok: false, erro: "Registro alterado por outro usuario. Recarregue e tente novamente." });
    const evento = { id: "e1", versao: "v1", campos: { titulo: "Live", descricao: "", inicio: "2026-10-21T19:30", duracaoMin: 60, link: "", publico: "TODOS" as const, produtoId: null, grupoIds: [], gravacaoAulaId: null } };
    const { rerender } = render(<FormEvento evento={evento} opcoes={OPCOES} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Salvar dados" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Registro alterado");
    rerender(<FormEvento evento={evento} opcoes={OPCOES} somenteLeitura />);
    expect(screen.queryByRole("button", { name: "Salvar dados" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toBeDisabled();
  });
});
