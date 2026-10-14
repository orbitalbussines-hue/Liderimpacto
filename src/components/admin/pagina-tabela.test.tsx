import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaginaTabela } from "./pagina-tabela";
import { MoreVertical } from "lucide-react";
import type { Coluna, Linha } from "./tabela-tipos";

const colunas: Coluna[] = [
  { titulo: "Membro" },
  { titulo: "Situação", largura: 120 },
  { titulo: "Progresso", largura: 120 },
  { titulo: "Último acesso", largura: 120 },
  { titulo: "Ações", largura: 56 },
];

const linhas: Linha[] = [
  [
    { tipo: "membro", nome: "Valéria Laranjeiras", email: "valeria@exemplo.com" },
    { tipo: "selo", texto: "Publicado", tom: "ok" },
    { tipo: "barra", valor: 66 },
    { tipo: "data", texto: "Nunca" },
    { tipo: "acoes", rotulo: "Ações de Valéria Laranjeiras" },
  ],
  [
    { tipo: "texto", texto: "Líder de Impacto", sub: "Cód. 164", caixaAlta: true },
    { tipo: "etiqueta", texto: "Autores · Signature" },
    { tipo: "numeroDestaque", texto: "28" },
    { tipo: "data", texto: "21/09/26" },
    { tipo: "acoes", rotulo: "Ações de Líder de Impacto" },
  ],
];

const base = { titulo: "Membros", abas: ["Membros", "Tags"], colunas };

describe("PaginaTabela", () => {
  it("renderiza uma tabela semântica com cabeçalhos de coluna", () => {
    render(<PaginaTabela {...base} linhas={linhas} />);
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("columnheader")).toHaveLength(colunas.length);
    expect(within(tabela).getAllByRole("row")).toHaveLength(1 + linhas.length);
  });

  it("renderiza as células tipadas", () => {
    render(<PaginaTabela {...base} linhas={linhas} />);
    expect(screen.getByText("Publicado")).toBeInTheDocument();
    expect(screen.getByText("valeria@exemplo.com")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "66");
    expect(screen.getByText("Autores · Signature")).toBeInTheDocument();
    expect(screen.getByText("Cód. 164")).toBeInTheDocument();
  });

  it('mostra "Nunca" em warn e data comum em muted', () => {
    render(<PaginaTabela {...base} linhas={linhas} />);
    expect(screen.getByText("Nunca")).toHaveClass("text-warn");
    expect(screen.getByText("21/09/26")).toHaveClass("text-muted");
  });

  it("ações têm botão com aria-label", () => {
    render(<PaginaTabela {...base} linhas={linhas} />);
    expect(screen.getByRole("button", { name: "Ações de Valéria Laranjeiras" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Ações de/ })).toHaveLength(2);
  });

  it("sem linhas mostra o EstadoVazio dentro do cartão e mantém os cabeçalhos", () => {
    render(<PaginaTabela {...base} linhas={[]} vazio={{ titulo: "Nada por aqui ainda" }} />);
    expect(screen.getByText("Nada por aqui ainda")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(colunas.length);
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
  });

  it("mostra o rodapé de paginação e o filtro ativo removível", () => {
    render(
      <PaginaTabela
        {...base}
        linhas={linhas}
        filtros={["Grupos"]}
        filtrosAtivos={[{ rotulo: "Status · Ativo", hrefRemover: "/x" }]}
        paginacao={{ pagina: 1, porPagina: 10, total: 137 }}
        acaoPrincipal={{ rotulo: "Cadastrar", icone: MoreVertical }}
      />
    );
    expect(screen.getByText("Mostrando 1–10 de 137")).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 14/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Remover filtro" })).toHaveAttribute("href", "/x");
    expect(screen.getByRole("button", { name: "Cadastrar" })).toBeInTheDocument();
  });
});
