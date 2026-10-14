import { describe, expect, it } from "vitest";
import { EQUIPE, papelAceito, papelEfetivo, TODOS_OS_MEMBROS } from "./permissoes";

const membro = (papel: "DONO" | "ADMIN" | "ALUNO") => ({ superAdmin: false, membro: { id: "m", papel } });

describe("permissoes por criador", () => {
  it("papel efetivo: vinculo; SUPER_ADMIN vale DONO; sem acesso, nenhum", () => {
    expect(papelEfetivo(membro("ADMIN"))).toBe("ADMIN");
    expect(papelEfetivo({ superAdmin: true, membro: null })).toBe("DONO");
    expect(papelEfetivo({ superAdmin: true, membro: { id: "m", papel: "ALUNO" } })).toBe("DONO");
    expect(papelEfetivo({ superAdmin: false, membro: null })).toBeNull();
    expect(papelEfetivo(null)).toBeNull();
  });

  it("ALUNO nao entra na equipe; todos entram na area do aluno", () => {
    expect(papelAceito(membro("ALUNO"), EQUIPE)).toBe(false);
    expect(papelAceito(membro("ADMIN"), EQUIPE)).toBe(true);
    expect(papelAceito(membro("ALUNO"), TODOS_OS_MEMBROS)).toBe(true);
    expect(papelAceito(null, TODOS_OS_MEMBROS)).toBe(false);
  });
});
