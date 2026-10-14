import { describe, expect, it } from "vitest";
import { ITENS_MENU, ITENS_TAB_BAR, itemAtivo } from "./navegacao";

describe("itemAtivo", () => {
  it("/ só ativa Início no caminho exato", () => {
    expect(itemAtivo("/", ITENS_MENU)).toBe("/");
    expect(itemAtivo("/qualquer", ITENS_MENU)).toBeNull();
  });

  it("rota de curso não ativa nada", () => {
    expect(itemAtivo("/cursos/lider-de-impacto", ITENS_MENU)).toBeNull();
  });

  it("filhos ativam o item pai", () => {
    expect(itemAtivo("/trilhas/abc", ITENS_MENU)).toBe("/trilhas");
    expect(itemAtivo("/trilhas", ITENS_MENU)).toBe("/trilhas");
  });

  it("não confunde prefixos parecidos", () => {
    expect(itemAtivo("/trilhasx", ITENS_MENU)).toBeNull();
  });

  it("tab bar: Aulas aponta para /continuar e Perfil existe só nela", () => {
    expect(itemAtivo("/continuar", ITENS_TAB_BAR)).toBe("/continuar");
    expect(itemAtivo("/perfil", ITENS_TAB_BAR)).toBe("/perfil");
    expect(itemAtivo("/perfil", ITENS_MENU)).toBeNull();
  });
});
