import { describe, expect, it } from "vitest";
import { mensagemDePendencias, pendenciasParaPublicar, resumoDoProduto } from "./regras";

describe("publicar produto", () => {
  it("lista o que falta na ordem titulo, modulo com aula, capa 16:9", () => {
    expect(pendenciasParaPublicar({ titulo: " ", temCapa16x9: false, modulosComAula: 0 })).toEqual(["título", "ao menos 1 módulo publicado com 1 aula", "capa 16:9"]);
    expect(pendenciasParaPublicar({ titulo: "Curso", temCapa16x9: true, modulosComAula: 1 })).toEqual([]);
    expect(mensagemDePendencias(["capa 16:9"])).toBe("Para publicar, falta: capa 16:9.");
  });

  it("resume a linha da tabela no singular e no plural", () => {
    expect(resumoDoProduto({ codigo: 164, aulas: 28, alunos: 0 })).toBe("Cód. 164 · 28 aulas · 0 alunos");
    expect(resumoDoProduto({ codigo: 1, aulas: 1, alunos: 1 })).toBe("Cód. 1 · 1 aula · 1 aluno");
  });
});
