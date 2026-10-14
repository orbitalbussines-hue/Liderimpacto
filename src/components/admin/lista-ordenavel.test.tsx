import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListaOrdenavel, useOrdemPersistida } from "./lista-ordenavel";

const itens = [
  { id: "a", versao: "v1", titulo: "Abertura" },
  { id: "b", versao: "v1", titulo: "Bases" },
  { id: "c", versao: "v1", titulo: "Conclusão" },
];

function montar(onReordenar = vi.fn()) {
  render(
    <ListaOrdenavel
      itens={itens}
      rotulo={(i) => i.titulo}
      onReordenar={onReordenar}
      renderItem={(i, c) => (
        <div>
          {c.alca}
          {i.titulo}
          {c.subirDescer}
        </div>
      )}
    />,
  );
  return onReordenar;
}

describe("ListaOrdenavel", () => {
  it("subir/descer devolve a nova ordem; nas pontas o botão fica desabilitado", () => {
    const onReordenar = montar();
    expect(screen.getByRole("button", { name: "Subir Abertura" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descer Conclusão" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Descer Abertura" }));
    expect(onReordenar).toHaveBeenLastCalledWith([itens[1], itens[0], itens[2]]);
    fireEvent.click(screen.getByRole("button", { name: "Subir Conclusão" }));
    expect(onReordenar).toHaveBeenLastCalledWith([itens[0], itens[2], itens[1]]);
  });

  it("a alça é um botão nomeado para teclado e leitor de tela", () => {
    montar();
    expect(screen.getByRole("button", { name: "Arrastar Bases" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("useOrdemPersistida", () => {
  it("aplica a versão nova em todos quando grava; volta a ordem e mostra o erro quando colide", async () => {
    const salvar = vi.fn().mockResolvedValueOnce({ ok: true, dados: { versao: "v2" } }).mockResolvedValueOnce({ ok: false, erro: "Registro alterado por outro usuario." });
    const { result } = renderHook(() => useOrdemPersistida(itens, salvar));
    await act(async () => result.current.reordenar([itens[2], itens[0], itens[1]]));
    expect(salvar).toHaveBeenLastCalledWith([
      { id: "c", versao: "v1" },
      { id: "a", versao: "v1" },
      { id: "b", versao: "v1" },
    ]);
    expect(result.current.itens.map((i) => `${i.id}:${i.versao}`)).toEqual(["c:v2", "a:v2", "b:v2"]);
    await act(async () => result.current.reordenar([...result.current.itens].reverse()));
    expect(result.current.itens.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(result.current.erro).toMatch(/alterado por outro/);
  });
});
