import { describe, expect, it } from "vitest";
import { textoDoBloqueio } from "./formatos";

describe("textoDoBloqueio", () => {
  const base = { liberaEm: null, preRequisito: null };
  it("AVALIACAO: cita a avaliação quando a consulta a traz", () => {
    expect(textoDoBloqueio({ ...base, motivoBloqueio: "AVALIACAO", avaliacaoPendente: { titulo: "Quiz do Módulo 1" } })).toBe("Seja aprovado em Quiz do Módulo 1");
    expect(textoDoBloqueio({ ...base, motivoBloqueio: "AVALIACAO" })).toBe("Aprovação na avaliação pendente");
  });
  it("demais motivos e liberada", () => {
    expect(textoDoBloqueio({ ...base, motivoBloqueio: null })).toBeNull();
    expect(textoDoBloqueio({ ...base, motivoBloqueio: "MATRICULA" })).toBe("Matricule-se");
    expect(textoDoBloqueio({ ...base, motivoBloqueio: "PRE_REQUISITO", preRequisito: { numero: "1.2" } })).toBe("Conclua a aula 1.2");
  });
});
