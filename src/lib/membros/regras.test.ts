import { describe, expect, it } from "vitest";
import { papeisQuePodeCadastrar, podeGerir, podeMudarPapel, tiraUltimoDono } from "./regras";

describe("regras de gestao de membros", () => {
  it("DONO cadastra ALUNO e ADMIN; ADMIN so ALUNO; ALUNO nada; DONO nunca pelo cadastro", () => {
    expect(papeisQuePodeCadastrar("DONO")).toEqual(["ALUNO", "ADMIN"]);
    expect(papeisQuePodeCadastrar("ADMIN")).toEqual(["ALUNO"]);
    expect(papeisQuePodeCadastrar("ALUNO")).toEqual([]);
  });

  it("ADMIN so gerencia ALUNO; DONO gerencia todos; so DONO muda papel", () => {
    expect(podeGerir("ADMIN", "ALUNO")).toBe(true);
    expect(podeGerir("ADMIN", "ADMIN")).toBe(false);
    expect(podeGerir("ADMIN", "DONO")).toBe(false);
    expect(podeGerir("DONO", "DONO")).toBe(true);
    expect(podeGerir("ALUNO", "ALUNO")).toBe(false);
    expect(podeMudarPapel("DONO")).toBe(true);
    expect(podeMudarPapel("ADMIN")).toBe(false);
  });

  it("o ultimo DONO ativo nao sai", () => {
    expect(tiraUltimoDono(1, true, false)).toBe(true);
    expect(tiraUltimoDono(2, true, false)).toBe(false);
    expect(tiraUltimoDono(1, true, true)).toBe(false);
    expect(tiraUltimoDono(1, false, false)).toBe(false);
  });
});
