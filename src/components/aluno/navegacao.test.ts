import { describe, expect, it } from "vitest";
import { ITENS_MENU, ITENS_TAB_BAR, itemAtivo, itensDoMenu } from "./navegacao";

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

  it("Eventos: no menu do desktop (e no detalhe), fora da tab bar de 5", () => {
    expect(itemAtivo("/eventos/abc", ITENS_MENU)).toBe("/eventos");
    expect(itemAtivo("/eventos", ITENS_TAB_BAR)).toBeNull();
    expect(ITENS_TAB_BAR).toHaveLength(5);
  });
});

it("Conquistas só no menu da área com gamificação ligada, antes de Certificados", () => {
  expect(itensDoMenu({ conquistas: false }).some((i) => i.href === "/conquistas")).toBe(false);
  const ligada = itensDoMenu({ conquistas: true }).map((i) => i.href);
  expect(ligada.indexOf("/conquistas")).toBe(ligada.indexOf("/certificados") - 1);
  expect(itemAtivo("/conquistas", itensDoMenu({ conquistas: true }))).toBe("/conquistas");
});
