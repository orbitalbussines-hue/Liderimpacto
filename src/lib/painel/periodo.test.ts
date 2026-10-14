import { describe, expect, it } from "vitest";
import {
  agrupamentoDaSerie, atalhoDoIntervalo, dataPorExtenso, dataValida, deslocarMes, frasePeriodo, gradeDoMes, hojeEmBrasilia, intervalo,
  intervaloDoAtalho, lerIntervalo, lerIntervaloExplicito, periodoAnterior, rotuloDoPeriodo, somarMeses, textoDoIntervalo, tituloDoMes,
} from "./periodo";

const HOJE = "2026-10-14";

describe("lerIntervalo", () => {
  it("aceita ?de=&ate= válidos (inclusivos)", () => {
    expect(lerIntervalo({ de: "2026-10-01", ate: "2026-10-14" }, HOJE)).toEqual({ de: "2026-10-01", ate: "2026-10-14", dias: 14 });
    expect(lerIntervalo({ de: "2026-09-01", ate: "2026-09-01" }, HOJE)).toEqual({ de: "2026-09-01", ate: "2026-09-01", dias: 1 });
  });
  it("recusa formato, data inexistente, ordem trocada, futuro e mais de 366 dias", () => {
    const padrao = { de: "2026-09-15", ate: HOJE, dias: 30 };
    for (const p of [
      { de: "2026-10-1", ate: HOJE },
      { de: "2026-02-30", ate: "2026-03-01" },
      { de: "2026-10-10", ate: "2026-10-01" },
      { de: "2026-10-01", ate: "2026-10-15" },
      { de: "2025-10-12", ate: HOJE }, // 368 dias
      { de: ["2026-10-01"], ate: HOJE },
      { de: "0001-01-01", ate: "0001-01-02" },
      { de: "2026-10-01" },
      {},
    ]) expect(lerIntervalo(p, HOJE)).toEqual(padrao);
    expect(lerIntervaloExplicito({ de: "2025-10-14", ate: HOJE }, HOJE)?.dias).toBe(366);
    expect(lerIntervaloExplicito({ de: "2025-10-13", ate: HOJE }, HOJE)).toBeNull();
  });
  it("sem de/ate válidos cai no legado ?periodo=7|30|90; lixo vira 30", () => {
    expect(lerIntervalo({ periodo: "7" }, HOJE)).toEqual({ de: "2026-10-08", ate: HOJE, dias: 7 });
    expect(lerIntervalo({ periodo: "90" }, HOJE).dias).toBe(90);
    for (const periodo of ["15", "7d", ["7"], ""]) expect(lerIntervalo({ periodo }, HOJE).dias).toBe(30);
    // de/ate válidos ganham do legado
    expect(lerIntervalo({ de: "2026-10-01", ate: "2026-10-02", periodo: "90" }, HOJE).dias).toBe(2);
  });
  it("dataValida aceita 29/02 só em ano bissexto", () => {
    expect([dataValida("2024-02-29"), dataValida("2026-02-29"), dataValida("2026-13-01"), dataValida(20261014)]).toEqual([true, false, false, false]);
  });
});

describe("periodoAnterior", () => {
  it("mesmo número de dias imediatamente antes de `de`", () => {
    expect(periodoAnterior(intervalo("2026-10-01", "2026-10-14"))).toEqual({ de: "2026-09-17", ate: "2026-09-30", dias: 14 });
    expect(periodoAnterior(intervalo("2026-03-01", "2026-03-01"))).toEqual({ de: "2026-02-28", ate: "2026-02-28", dias: 1 });
    expect(periodoAnterior(intervalo("2024-03-01", "2024-03-31")).de).toBe("2024-01-30");
  });
});

describe("atalhos", () => {
  const de = (a: Parameters<typeof intervaloDoAtalho>[0], hoje = HOJE) => {
    const i = intervaloDoAtalho(a, hoje);
    return `${i.de}..${i.ate}`;
  };
  it("dias relativos a hoje", () => {
    expect(de("hoje")).toBe("2026-10-14..2026-10-14");
    expect(de("ontem")).toBe("2026-10-13..2026-10-13");
    expect(de("7d")).toBe("2026-10-08..2026-10-14");
    expect(de("30d")).toBe("2026-09-15..2026-10-14");
    expect(de("90d")).toBe("2026-07-17..2026-10-14");
  });
  it("este mês e mês passado, inclusive no dia 1 e em janeiro", () => {
    expect(de("este-mes")).toBe("2026-10-01..2026-10-14");
    expect(de("este-mes", "2026-10-01")).toBe("2026-10-01..2026-10-01");
    expect(de("mes-passado")).toBe("2026-09-01..2026-09-30");
    expect(de("mes-passado", "2027-01-10")).toBe("2026-12-01..2026-12-31");
    expect(de("mes-passado", "2024-03-05")).toBe("2024-02-01..2024-02-29");
    expect(de("ontem", "2027-01-01")).toBe("2026-12-31..2026-12-31");
  });
  it("últimos N meses = do dia seguinte ao mesmo dia N meses atrás até hoje", () => {
    expect(de("3m")).toBe("2026-07-15..2026-10-14");
    expect(de("6m")).toBe("2026-04-15..2026-10-14");
    expect(intervaloDoAtalho("12m", HOJE)).toEqual({ de: "2025-10-15", ate: HOJE, dias: 365 });
    expect(intervaloDoAtalho("12m", "2024-02-29")).toEqual({ de: "2023-03-01", ate: "2024-02-29", dias: 366 });
    expect(de("3m", "2026-05-31")).toBe("2026-03-01..2026-05-31");
    expect(somarMeses("2024-03-31", -1)).toBe("2024-02-29");
  });
  it("todo atalho cabe no máximo e é reconhecido de volta", () => {
    for (const hoje of [HOJE, "2024-02-29", "2027-01-01"]) {
      for (const a of ["hoje", "ontem", "7d", "30d", "90d", "mes-passado", "3m", "6m", "12m"] as const) {
        const i = intervaloDoAtalho(a, hoje);
        expect(lerIntervaloExplicito(i, hoje)).toEqual(i);
        expect(atalhoDoIntervalo(i.de, i.ate, hoje)).toBe(a);
      }
    }
    expect(atalhoDoIntervalo("2026-10-02", "2026-10-05", HOJE)).toBeNull();
  });
});

describe("calendário e texto", () => {
  it("grade começa na segunda", () => {
    const out = gradeDoMes(2026, 10); // 01/10/2026 é quinta
    expect(out.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(out.at(-1)).toBe("2026-10-31");
    expect(gradeDoMes(2026, 6)[0]).toBe("2026-06-01"); // segunda
    expect(gradeDoMes(2026, 2).filter(Boolean)).toHaveLength(28);
    expect(gradeDoMes(2026, 3).slice(0, 7)).toEqual([null, null, null, null, null, null, "2026-03-01"]); // domingo
  });
  it("mês, nomes e frases", () => {
    expect(deslocarMes({ ano: 2026, mes: 1 }, -1)).toEqual({ ano: 2025, mes: 12 });
    expect(deslocarMes({ ano: 2026, mes: 12 }, 1)).toEqual({ ano: 2027, mes: 1 });
    expect(tituloDoMes({ ano: 2026, mes: 3 })).toBe("Março 2026");
    expect(dataPorExtenso("2026-10-14")).toBe("14 de outubro de 2026");
    expect(textoDoIntervalo("2026-10-01", "2026-10-14")).toBe("01/10/2026 a 14/10/2026");
    expect(frasePeriodo(intervalo("2026-09-15", HOJE), HOJE)).toBe("nos últimos 30 dias");
    expect(frasePeriodo(intervalo("2026-09-01", "2026-09-30"), HOJE)).toBe("de 01/09/2026 a 30/09/2026");
    expect(rotuloDoPeriodo(intervalo(HOJE, HOJE), HOJE)).toBe("hoje");
    expect([agrupamentoDaSerie(92), agrupamentoDaSerie(93)]).toEqual(["dia", "semana"]);
    expect(hojeEmBrasilia(new Date("2026-10-15T02:00:00Z"))).toBe("2026-10-14");
  });
});
