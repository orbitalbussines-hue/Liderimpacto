import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompositorPost, problemaDaEnquete } from "./compositor-post";

const imagem = (nome: string, tamanho = 1000) => new File([new Uint8Array(tamanho)], nome, { type: "image/png" });
const pdf = (nome: string) => new File([new Uint8Array(10)], nome, { type: "application/pdf" });

function escolher(rotulo: string, arquivos: File[]) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { files: arquivos } });
}

describe("CompositorPost", () => {
  it("sobe os anexos, mostra a prévia, permite remover e respeita 4 imagens + 2 PDFs", async () => {
    const enviarAnexo = vi.fn(async (f: File) => ({ ok: true as const, arquivoId: `id-${f.name}` }));
    const publicar = vi.fn(async () => null);
    render(<CompositorPost nomeUsuario="Ana Demo" enviarAnexo={enviarAnexo} publicar={publicar} />);

    escolher("Escolher imagens", [imagem("1.png"), imagem("2.png"), imagem("3.png"), imagem("4.png"), imagem("5.png")]);
    expect(screen.getByRole("alert")).toHaveTextContent("No máximo 4 imagens por publicação.");
    expect(enviarAnexo).toHaveBeenCalledTimes(4);
    expect(screen.getByRole("button", { name: "Imagem" })).toBeDisabled();

    escolher("Escolher PDF", [pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")]);
    expect(screen.getByRole("alert")).toHaveTextContent("No máximo 2 PDFs por publicação.");
    expect(screen.getByRole("button", { name: "Anexo" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Remover 2.png" }));
    expect(screen.queryByRole("button", { name: "Remover 2.png" })).toBeNull();
    expect(screen.getByRole("button", { name: "Imagem" })).toBeEnabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Nova publicação" }), { target: { value: "Fotos do encontro" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() => expect(publicar).toHaveBeenCalledOnce());
    expect(publicar.mock.calls[0]).toEqual([
      expect.objectContaining({ texto: "Fotos do encontro", anexoIds: ["id-1.png", "id-3.png", "id-4.png", "id-a.pdf", "id-b.pdf"], enquete: null }),
    ]);
  });

  it("recusa arquivo fora da allowlist sem enviar", () => {
    const enviarAnexo = vi.fn();
    render(<CompositorPost nomeUsuario="Ana Demo" enviarAnexo={enviarAnexo} />);
    escolher("Escolher imagens", [new File(["x"], "vetor.svg", { type: "image/svg+xml" })]);
    expect(screen.getByRole("alert")).toHaveTextContent("vetor.svg");
    expect(enviarAnexo).not.toHaveBeenCalled();
  });

  it("enquete vai de 2 a 6 opções e publica só as preenchidas", async () => {
    const publicar = vi.fn(async () => null);
    render(<CompositorPost nomeUsuario="Ana Demo" publicar={publicar} />);
    fireEvent.click(screen.getByRole("button", { name: "Enquete" }));
    expect(screen.queryByRole("button", { name: /Remover opção/ })).toBeNull();
    const adicionar = screen.getByRole("button", { name: "Adicionar opção" });
    for (let i = 0; i < 4; i++) fireEvent.click(adicionar);
    expect(screen.getAllByRole("textbox", { name: /^Opção/ })).toHaveLength(6);
    expect(adicionar).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remover opção 6" }));
    expect(adicionar).toBeEnabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Nova publicação" }), { target: { value: "Votem!" } });
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escreva a pergunta da enquete.");
    expect(publicar).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Pergunta" }), { target: { value: "Qual dia?" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Opção 1" }), { target: { value: "Terça" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Opção 2" }), { target: { value: "Quinta" } });
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() => expect(publicar).toHaveBeenCalledOnce());
    expect(publicar.mock.calls[0]).toEqual([expect.objectContaining({ enquete: { pergunta: "Qual dia?", opcoes: ["Terça", "Quinta"], encerraEm: null } })]);
  });

  it("problemaDaEnquete: repetidas, poucas opções e encerramento no passado", () => {
    expect(problemaDaEnquete({ pergunta: "P", opcoes: ["Sim", "sim"], encerraEm: "" })).toBe("Há opções repetidas na enquete.");
    expect(problemaDaEnquete({ pergunta: "P", opcoes: ["Sim", " "], encerraEm: "" })).toMatch(/ao menos 2/);
    expect(problemaDaEnquete({ pergunta: "P", opcoes: ["Sim", "Não"], encerraEm: "2020-01-01T10:00" })).toMatch(/futuro/);
    expect(problemaDaEnquete({ pergunta: "P", opcoes: ["Sim", "Não"], encerraEm: "" })).toBeNull();
  });

  it("silenciado: só o aviso, sem campo nem Publicar", () => {
    render(<CompositorPost nomeUsuario="Ana Demo" bloqueio="Você está silenciado na comunidade até 20/10 às 18:00." />);
    expect(screen.getByRole("status")).toHaveTextContent("silenciado");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Publicar" })).toBeNull();
  });
});
