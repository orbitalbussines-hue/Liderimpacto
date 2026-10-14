import { describe, expect, it } from "vitest";
import { motivoParaNaoGerarLink, type AlvoDoLink, type AtorDoLink } from "./link-de-senha-regra";

const A = "criador-a";
const B = "criador-b";
const ator = (papel: AtorDoLink["papel"], extra: Partial<AtorDoLink> = {}): AtorDoLink => ({ id: "ator", superAdmin: false, criadorId: A, papel, ...extra });
const alvo = (vinculos: AlvoDoLink["vinculos"], papelPlataforma: AlvoDoLink["papelPlataforma"] = "NENHUM"): AlvoDoLink => ({ id: "alvo", papelPlataforma, vinculos });

describe("quem gera link de senha para quem", () => {
  it("ninguem gera para si; SUPER_ADMIN gera para qualquer outro", () => {
    expect(motivoParaNaoGerarLink(ator("DONO", { id: "alvo" }), alvo([{ criadorId: A, papel: "ALUNO" }]))).toMatch(/Conta/);
    expect(motivoParaNaoGerarLink(ator(null, { superAdmin: true, criadorId: null }), alvo([], "SUPER_ADMIN"))).toBeNull();
  });

  it("hierarquia: DONO -> ADMIN/ALUNO; ADMIN -> so ALUNO; ALUNO nunca", () => {
    expect(motivoParaNaoGerarLink(ator("DONO"), alvo([{ criadorId: A, papel: "ADMIN" }]))).toBeNull();
    expect(motivoParaNaoGerarLink(ator("ADMIN"), alvo([{ criadorId: A, papel: "ALUNO" }]))).toBeNull();
    expect(motivoParaNaoGerarLink(ator("ADMIN"), alvo([{ criadorId: A, papel: "ADMIN" }]))).toMatch(/abaixo/);
    expect(motivoParaNaoGerarLink(ator("ADMIN"), alvo([{ criadorId: A, papel: "DONO" }]))).toMatch(/abaixo/);
    expect(motivoParaNaoGerarLink(ator("ALUNO"), alvo([{ criadorId: A, papel: "ALUNO" }]))).toBe("sem-permissao");
  });

  it("isolamento: equipe de A nao abre conta de quem e de B, nem de SUPER_ADMIN", () => {
    expect(motivoParaNaoGerarLink(ator("DONO"), alvo([{ criadorId: B, papel: "ALUNO" }]))).toMatch(/não é membro/);
    expect(motivoParaNaoGerarLink(ator("DONO"), alvo([{ criadorId: A, papel: "ALUNO" }, { criadorId: B, papel: "ALUNO" }]))).toMatch(/outra área/);
    expect(motivoParaNaoGerarLink(ator("DONO"), alvo([{ criadorId: A, papel: "ALUNO" }], "SUPER_ADMIN"))).toBe("sem-permissao");
    expect(motivoParaNaoGerarLink(ator("DONO", { criadorId: null }), alvo([{ criadorId: A, papel: "ALUNO" }]))).toBe("sem-permissao");
  });
});
