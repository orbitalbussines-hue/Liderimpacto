import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DadosAula, type DadosAulaProps } from "./dados-aula";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const acoes = vi.hoisted(() => ({ acaoSalvarAula: vi.fn(async () => ({ ok: true as const, dados: {} })) }));
vi.mock("@/lib/actions/aulas", () => acoes);
vi.mock("@/lib/actions/paginas", () => ({ acaoPrepararImagemPagina: vi.fn() }));

const aula = (x: Partial<DadosAulaProps["aula"]> = {}): DadosAulaProps["aula"] => ({
  id: "a-1",
  titulo: "Aula 1",
  descricao: "Texto antigo",
  conteudo: null,
  imagens: {},
  liberaEm: null,
  liberaAposDias: null,
  preRequisitoAulaId: null,
  capitulos: [],
  duracaoSeg: null,
  versao: "2026-11-15T00:00:00.000Z",
  ...x,
});
const enviado = () => (acoes.acaoSalvarAula.mock.calls.at(-1) as unknown as [{ descricao: string; conteudo?: unknown }])[0];

describe("DadosAula: conteúdo (RN-275)", () => {
  it("aula antiga sem mexer nos blocos não grava conteúdo (não vira de leitura); mexendo, grava", async () => {
    const u = userEvent.setup();
    render(<DadosAula aula={aula()} aulasDoProduto={[]} />);
    await u.click(screen.getByRole("button", { name: "Salvar aula" }));
    expect(enviado()).toMatchObject({ descricao: "Texto antigo", conteudo: undefined });

    await u.type(screen.getByRole("textbox", { name: /^Texto/ }), " novo");
    await u.click(screen.getByRole("button", { name: "Salvar aula" }));
    expect(enviado()).toMatchObject({ descricao: "", conteudo: [{ tipo: "TEXTO", texto: "Texto antigo novo" }] });
  });

  it("blocos nomeados pelo número; mover pelo teclado mantém o foco e anuncia; erro leva o foco ao bloco", async () => {
    const u = userEvent.setup();
    const conteudo = [
      { tipo: "TEXTO" as const, texto: "A" },
      { tipo: "TEXTO" as const, texto: "B" },
    ];
    render(<DadosAula aula={aula({ conteudo })} aulasDoProduto={[]} />);
    expect(screen.getByRole("group", { name: "Bloco 2 · Texto" })).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Descer bloco 1" }));
    // No fim a seta "descer" desliga: o foco vai para a "subir" do mesmo bloco.
    expect(screen.getByRole("button", { name: "Subir bloco 2" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Bloco de texto movido para a posição 2 de 2.");

    await u.clear(screen.getAllByRole("textbox", { name: /^Texto/ })[1]);
    await u.click(screen.getByRole("button", { name: "Salvar aula" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Bloco 2: escreva o texto");
    expect(screen.getByRole("group", { name: "Bloco 2 · Texto" })).toHaveFocus();
  });
});
