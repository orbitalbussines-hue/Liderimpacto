// @vitest-environment node
import { describe, expect, it } from "vitest";
import { motivoDoBloqueio } from "./acesso";
import { liberacaoEfetiva } from "./liberacao";

const dias = (n: number) => ({ liberaEm: null, liberaAposDias: n });

describe("liberacaoEfetiva (RN-274)", () => {
  it("N dias depois: meia-noite de Brasília do dia local da matrícula + N", () => {
    // 10/11 às 15h de Brasília (18h UTC), N=7 ⇒ 17/11 00:00 de Brasília (03h UTC).
    expect(liberacaoEfetiva(dias(7), new Date("2026-11-10T18:00:00Z"))).toEqual(new Date("2026-11-17T03:00:00Z"));
    expect(liberacaoEfetiva(dias(1), new Date("2026-11-10T18:00:00Z"))).toEqual(new Date("2026-11-11T03:00:00Z"));
    // Virada de mês e de ano.
    expect(liberacaoEfetiva(dias(3), new Date("2026-12-30T12:00:00Z"))).toEqual(new Date("2027-01-02T03:00:00Z"));
  });

  it("fuso: matrícula 23:30 de São Paulo conta o dia LOCAL (em UTC já é o dia seguinte)", () => {
    // 10/11 23:30 em São Paulo = 11/11 02:30 UTC.
    expect(liberacaoEfetiva(dias(1), new Date("2026-11-11T02:30:00Z"))).toEqual(new Date("2026-11-11T03:00:00Z"));
    // 00:10 de São Paulo do dia 11 (03:10 UTC) já é o dia 11.
    expect(liberacaoEfetiva(dias(1), new Date("2026-11-11T03:10:00Z"))).toEqual(new Date("2026-11-12T03:00:00Z"));
  });

  it("antigo horário de verão (Intl, não offset fixo): meia-noite com -02 e a que não existiu", () => {
    // 15/02/2019 12h (-02, verão) + 1 = 16/02 00:00 -02 = 02h UTC; + 2 = 17/02 00:00 -03 = 03h UTC.
    expect(liberacaoEfetiva(dias(1), new Date("2019-02-15T14:00:00Z"))).toEqual(new Date("2019-02-16T02:00:00Z"));
    expect(liberacaoEfetiva(dias(2), new Date("2019-02-15T14:00:00Z"))).toEqual(new Date("2019-02-17T03:00:00Z"));
    // 04/11/2018 o relógio pulou de 00:00 para 01:00: o primeiro instante do dia (03h UTC).
    expect(liberacaoEfetiva(dias(1), new Date("2018-11-03T15:00:00Z"))).toEqual(new Date("2018-11-04T03:00:00Z"));
  });

  it("data fixa + nada = a data; nada + nada = sem trava; dias sem matrícula = sem calendário", () => {
    const data = new Date("2026-12-01T11:00:00Z");
    expect(liberacaoEfetiva({ liberaEm: data, liberaAposDias: null }, new Date())).toBe(data);
    expect(liberacaoEfetiva({ liberaEm: data, liberaAposDias: null }, null)).toBe(data);
    expect(liberacaoEfetiva({ liberaEm: null, liberaAposDias: null }, new Date())).toBeNull();
    expect(liberacaoEfetiva(dias(7), null)).toBeNull();
  });

  it("motivoDoBloqueio usa o calendário da matrícula de quem pede", () => {
    const aula = { ...dias(7), statusProduto: "PUBLICADO", statusModulo: "PUBLICADO", preRequisitoCumprido: true, avaliacaoPendente: false } as const;
    const matricula = { iniciadaEm: new Date("2026-11-10T18:00:00Z") };
    expect(motivoDoBloqueio({ papel: "ALUNO", matricula }, aula, new Date("2026-11-17T02:59:59Z"))).toBe("LIBERACAO");
    expect(motivoDoBloqueio({ papel: "ALUNO", matricula }, aula, new Date("2026-11-17T03:00:00Z"))).toBeNull();
    // Outro aluno, matriculado dias depois: calendário próprio.
    expect(motivoDoBloqueio({ papel: "ALUNO", matricula: { iniciadaEm: new Date("2026-11-14T12:00:00Z") } }, aula, new Date("2026-11-17T03:00:00Z"))).toBe("LIBERACAO");
    // Sem matrícula: MATRICULA (antes da liberação); equipe: prévia, tudo liberado.
    expect(motivoDoBloqueio({ papel: "ALUNO", matricula: null }, aula, new Date("2026-11-17T03:00:00Z"))).toBe("MATRICULA");
    expect(motivoDoBloqueio({ papel: "ADMIN", matricula: null }, aula, new Date("2026-11-10T03:00:00Z"))).toBeNull();
  });
});
