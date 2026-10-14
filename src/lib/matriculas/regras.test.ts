// @vitest-environment node
import { describe, expect, it } from "vitest";
import { lerCsvDeMatriculas, resolverProdutos } from "./csv";
import { dataEmBrasilia, expiracaoValida, fimDoDiaEmBrasilia, matriculaVale, situacaoDaMatricula } from "./regras";

const agora = new Date("2026-10-14T12:00:00Z");

describe("situação da matrícula (RN-116)", () => {
  it("Expirada = ATIVA com data passada; só ATIVA não expirada vale", () => {
    const ontem = new Date(agora.getTime() - 86_400_000);
    const amanha = new Date(agora.getTime() + 86_400_000);
    expect(situacaoDaMatricula({ status: "ATIVA", expiraEm: null }, agora)).toBe("ATIVA");
    expect(situacaoDaMatricula({ status: "ATIVA", expiraEm: amanha }, agora)).toBe("ATIVA");
    expect(situacaoDaMatricula({ status: "ATIVA", expiraEm: ontem }, agora)).toBe("EXPIRADA");
    expect(situacaoDaMatricula({ status: "ATIVA", expiraEm: agora }, agora)).toBe("EXPIRADA");
    expect(situacaoDaMatricula({ status: "CANCELADA", expiraEm: ontem }, agora)).toBe("CANCELADA");
    expect(situacaoDaMatricula({ status: "PENDENTE", expiraEm: null }, agora)).toBe("PENDENTE");
    expect(matriculaVale({ status: "ATIVA", expiraEm: amanha }, agora)).toBe(true);
    expect(matriculaVale({ status: "PENDENTE", expiraEm: null }, agora)).toBe(false);
  });

  it("expiração vale o dia inteiro em Brasília; data inexistente é recusada", () => {
    expect(fimDoDiaEmBrasilia("2026-10-14")?.toISOString()).toBe("2026-10-15T02:59:59.999Z");
    expect(fimDoDiaEmBrasilia("14/10/2026")?.toISOString()).toBe("2026-10-15T02:59:59.999Z");
    expect(fimDoDiaEmBrasilia("31/02/2026")).toBeNull();
    expect(fimDoDiaEmBrasilia("2026-13-01")).toBeNull();
    expect(fimDoDiaEmBrasilia("14-10-2026")).toBeNull();
    expect(dataEmBrasilia(fimDoDiaEmBrasilia("2026-10-14")!)).toBe("2026-10-14");
    expect(expiracaoValida(null, agora)).toBe(true);
    expect(expiracaoValida(fimDoDiaEmBrasilia("2026-10-14"), agora)).toBe(true);
    expect(expiracaoValida(fimDoDiaEmBrasilia("2026-10-13"), agora)).toBe(false);
  });
});

describe("CSV de matrículas", () => {
  it("valida a linha: produto por código ou endereço, expiração opcional e futura, grupo opcional", () => {
    const r = lerCsvDeMatriculas(
      [
        "nome;email;produto;expira_em;grupo",
        "Ana Lima;ana@x.com;164;31/12/2026;Turma A",
        "Ana Lima;ana@x.com;lider-de-impacto;;",
        "Ana Lima;ANA@x.com;164;;",
        "Bia;bia@x.com;Curso Novo!;;",
        "Caio;caio@x.com;164;01/01/2020;",
        "Duda;duda@x.com;164;30/02/2027;",
        "Eva;eva@x.com;;;",
      ].join("\n"),
      agora,
    );
    if (!r.ok) throw new Error(r.erro);
    expect(r.validas.map((v) => v.numero)).toEqual([2, 3]);
    expect(r.validas[0].dados).toMatchObject({ produto: "164", grupo: "Turma A", expira_em: new Date("2027-01-01T02:59:59.999Z") });
    expect(r.validas[1].dados).toMatchObject({ produto: "lider-de-impacto", expira_em: null, grupo: "" });
    expect(Object.fromEntries(r.erros.map((e) => [e.numero, e.mensagem]))).toMatchObject({
      4: expect.stringMatching(/repetidos/),
      5: expect.stringMatching(/Produto inválido/),
      6: expect.stringMatching(/hoje ou depois/),
      7: expect.stringMatching(/Data de expiração inválida/),
      8: expect.stringMatching(/Informe o produto/),
    });
  });

  it("cabeçalho obrigatório e produto de fora vira linha inválida", () => {
    expect(lerCsvDeMatriculas("nome,email\nA,a@x.com", agora)).toMatchObject({ ok: false, erro: expect.stringMatching(/Cabeçalho/) });
    const r = lerCsvDeMatriculas("nome,email,produto\nAna,ana@x.com,1\nBia,bia@x.com,de-outro\nCaio,caio@x.com,meu-curso", agora);
    if (!r.ok) throw new Error(r.erro);
    const ligadas = resolverProdutos(r.validas, [{ id: "p1", titulo: "Curso", codigo: 1, slug: "meu-curso" }]);
    expect(ligadas.ok.map((l) => [l.numero, l.produto.id])).toEqual([
      [2, "p1"],
      [4, "p1"],
    ]);
    expect(ligadas.erros).toEqual([{ numero: 3, mensagem: 'Produto "de-outro" não encontrado.' }]);
  });
});
