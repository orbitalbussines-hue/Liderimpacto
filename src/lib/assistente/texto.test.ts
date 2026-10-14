import { describe, expect, it } from "vitest";
import { blocosDoTexto, partesDaLinha } from "./texto";

describe("renderizador mínimo da resposta", () => {
  it("parágrafos por linha em branco; linhas do mesmo parágrafo se juntam", () => {
    expect(blocosDoTexto("Primeira linha\ncontinua.\n\nSegundo.")).toEqual([
      { tipo: "paragrafo", partes: [{ tipo: "texto", texto: "Primeira linha continua." }] },
      { tipo: "paragrafo", partes: [{ tipo: "texto", texto: "Segundo." }] },
    ]);
  });

  it("listas com marcador e numeradas; título de markdown vira texto", () => {
    const b = blocosDoTexto("## Passos\n1. Ouvir [1]\n2) Perguntar\n- solto\n* outro");
    expect(b[0]).toEqual({ tipo: "paragrafo", partes: [{ tipo: "texto", texto: "Passos" }] });
    expect(b[1]).toMatchObject({ tipo: "lista", ordenada: true, itens: [[{ tipo: "texto", texto: "Ouvir " }, { tipo: "citacao", n: 1 }], [{ tipo: "texto", texto: "Perguntar" }]] });
    expect(b[2]).toMatchObject({ tipo: "lista", ordenada: false });
    expect(b[2].tipo === "lista" && b[2].itens).toHaveLength(2);
  });

  it("negrito e citações viram partes; HTML fica como texto literal", () => {
    expect(partesDaLinha("**Atenção** <img src=x onerror=alert(1)> [2][3]")).toEqual([
      { tipo: "negrito", texto: "Atenção" },
      { tipo: "texto", texto: " <img src=x onerror=alert(1)> " },
      { tipo: "citacao", n: 2 },
      { tipo: "citacao", n: 3 },
    ]);
  });
});
