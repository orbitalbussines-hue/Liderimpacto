import { describe, expect, it } from "vitest";
import { MIN_SENHA, problemaNaSenha } from "./senha";

/** Politica de senha: tamanho manda, contexto reprova (portada do Espaco 7). */
describe("politica de senha", () => {
  const pessoa = { email: "ana.souza@exemplo.com", nome: "Ana Souza" };

  it("aceita frase longa sem termo do contexto", () => {
    expect(problemaNaSenha("cadeira azul no mezanino", pessoa)).toBeNull();
    expect(problemaNaSenha("tres gatos pretos na sala", {})).toBeNull();
  });

  it("recusa curta demais e longa demais", () => {
    expect(MIN_SENHA).toBe(8); // decisao do Paulo (handoff), ADR-0003
    expect(problemaNaSenha("gato7az", pessoa)).toMatch(/8 caracteres/);
    expect(problemaNaSenha("gato7azul", pessoa)).toBeNull();
    expect(problemaNaSenha("a".repeat(129), pessoa)).toMatch(/no máximo/);
  });

  it("recusa nome, e-mail e marca dentro da senha, com ou sem acento", () => {
    expect(problemaNaSenha("ana.souza@exemplo.com", pessoa)).toMatch(/e-mail|empresa/);
    expect(problemaNaSenha("anasouza-mezanino-azul", pessoa)).toMatch(/nome/);
    expect(problemaNaSenha("Líder de Impacto é demais", pessoa)).toMatch(/empresa/);
  });

  it("recusa as mais tentadas e as sequencias puras", () => {
    for (const ruim of ["abcdefghijklmnop", "aaaaaaaaaaaaaaaa", "ponmlkjihgfedcba", "12345678", "senha123", "password"]) {
      expect(problemaNaSenha(ruim, pessoa), ruim).not.toBeNull();
    }
  });
});
