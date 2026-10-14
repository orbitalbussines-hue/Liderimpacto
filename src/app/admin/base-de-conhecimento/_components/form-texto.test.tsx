import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormTexto } from "./form-texto";

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
const acoes = vi.hoisted(() => ({ acaoCriarTexto: vi.fn(), acaoSalvarTexto: vi.fn(), acaoExcluirTexto: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/actions/conhecimento", () => acoes);

const CURSOS = [{ id: "11111111-1111-4111-8111-111111111111", titulo: "Mentorias ao vivo" }];
const CONTEUDO = "Quanto tempo tenho de acesso? O acesso vale enquanto a matrícula estiver ativa.";

describe("FormTexto (Base de conhecimento)", () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.values(acoes).forEach((f) => f.mockReset());
    nav.push.mockReset();
  });

  it("valida na tela antes de chamar a action", async () => {
    render(<FormTexto cursos={CURSOS} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Criar texto" })));
    expect(screen.getByText("Informe o título (mínimo de 2 caracteres).")).toBeInTheDocument();
    expect(screen.getByText("Escreva o conteúdo (mínimo de 20 caracteres).")).toBeInTheDocument();
    expect(acoes.acaoCriarTexto).not.toHaveBeenCalled();
  });

  it("cria o texto só de um curso e abre o editor", async () => {
    acoes.acaoCriarTexto.mockResolvedValue({ ok: true, dados: { id: "d1", versao: "v1" } });
    render(<FormTexto cursos={CURSOS} />);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "FAQ" } });
    fireEvent.change(screen.getByLabelText("Vale para"), { target: { value: CURSOS[0].id } });
    fireEvent.change(screen.getByLabelText("Conteúdo"), { target: { value: CONTEUDO } });
    expect(screen.getByText(/vira 1 trecho/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Criar texto" })));
    expect(acoes.acaoCriarTexto).toHaveBeenCalledWith({ titulo: "FAQ", texto: CONTEUDO, produtoId: CURSOS[0].id });
    expect(nav.push).toHaveBeenCalledWith("/admin/base-de-conhecimento/textos/d1?criado=1");
  });

  it("excluir passa pelo modal block de 3 s com a versão aberta", async () => {
    vi.useFakeTimers();
    acoes.acaoExcluirTexto.mockResolvedValue({ ok: true, dados: null });
    render(<FormTexto cursos={CURSOS} texto={{ id: "d1", titulo: "FAQ", texto: CONTEUDO, produtoId: null, versao: "2026-10-14T10:00:00.000Z" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    const confirmar = screen.getAllByRole("button", { name: "Excluir" }).at(-1)!;
    expect(confirmar).toBeDisabled();
    for (let i = 0; i < 3; i++) act(() => void vi.advanceTimersByTime(1000));
    await act(async () => fireEvent.click(confirmar));
    expect(acoes.acaoExcluirTexto).toHaveBeenCalledWith({ documentoId: "d1", versao: "2026-10-14T10:00:00.000Z" });
    expect(nav.push).toHaveBeenCalledWith("/admin/base-de-conhecimento");
  });
});
