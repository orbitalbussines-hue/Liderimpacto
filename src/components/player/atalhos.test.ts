import { describe, expect, it } from "vitest";
import { acaoDoAtalho, atalhoValeNoAlvo } from "./atalhos";

describe("acaoDoAtalho", () => {
  it.each([
    [" ", { tipo: "alternar" }],
    ["k", { tipo: "alternar" }],
    ["K", { tipo: "alternar" }],
    ["j", { tipo: "pular", seg: -10 }],
    ["l", { tipo: "pular", seg: 10 }],
    ["ArrowLeft", { tipo: "pular", seg: -5 }],
    ["ArrowRight", { tipo: "pular", seg: 5 }],
    ["ArrowUp", { tipo: "volume", delta: 0.1 }],
    ["ArrowDown", { tipo: "volume", delta: -0.1 }],
    ["f", { tipo: "telaCheia" }],
    ["m", { tipo: "mudo" }],
    ["0", { tipo: "porcentagem", valor: 0 }],
    ["5", { tipo: "porcentagem", valor: 50 }],
    ["9", { tipo: "porcentagem", valor: 90 }],
  ])("tecla %j", (key, esperado) => {
    expect(acaoDoAtalho({ key })).toEqual(esperado);
  });

  it("ignora teclas sem atalho e combinações com Ctrl/Alt/Meta", () => {
    expect(acaoDoAtalho({ key: "x" })).toBeNull();
    expect(acaoDoAtalho({ key: "f", ctrlKey: true })).toBeNull();
    expect(acaoDoAtalho({ key: "k", metaKey: true })).toBeNull();
    expect(acaoDoAtalho({ key: "5", altKey: true })).toBeNull();
  });
});

describe("atalhoValeNoAlvo", () => {
  it("campo de texto fica com a tecla", () => {
    expect(atalhoValeNoAlvo(document.createElement("textarea"), "k")).toBe(false);
    expect(atalhoValeNoAlvo(document.createElement("input"), "ArrowLeft")).toBe(false);
  });

  it("botão fica com espaço/Enter, o resto vai para o player", () => {
    const b = document.createElement("button");
    expect(atalhoValeNoAlvo(b, " ")).toBe(false);
    expect(atalhoValeNoAlvo(b, "Enter")).toBe(false);
    expect(atalhoValeNoAlvo(b, "j")).toBe(true);
  });

  it("dentro de menu aberto não vale", () => {
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    const item = document.createElement("button");
    menu.append(item);
    expect(atalhoValeNoAlvo(item, "j")).toBe(false);
  });

  it("no container do player vale", () => {
    expect(atalhoValeNoAlvo(document.createElement("div"), " ")).toBe(true);
  });
});
