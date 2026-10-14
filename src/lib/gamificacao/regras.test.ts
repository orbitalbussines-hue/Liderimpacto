import { describe, expect, it } from "vitest";
import { esquemaNiveis, lerPeriodoRanking, NIVEIS_PADRAO, nivelDoMembro } from "./regras";

describe("nivelDoMembro (padrão: Iniciante 0, Aprendiz 100, Praticante 300, Líder 700, Referência 1500)", () => {
  it("acha o nível, o próximo e quanto falta", () => {
    expect(nivelDoMembro(0)).toMatchObject({ atual: { nome: "Iniciante" }, proximo: { nome: "Aprendiz" }, faltam: 100, progresso: 0 });
    expect(nivelDoMembro(99).atual.nome).toBe("Iniciante");
    expect(nivelDoMembro(100)).toMatchObject({ atual: { nome: "Aprendiz" }, faltam: 200, progresso: 0 });
    expect(nivelDoMembro(500)).toMatchObject({ atual: { nome: "Praticante" }, faltam: 200, progresso: 0.5 });
    expect(nivelDoMembro(9999)).toMatchObject({ atual: { nome: "Referência" }, proximo: null, faltam: 0, progresso: 1 });
  });

  it("saldo negativo (ajuste) fica no primeiro nível; lista vazia usa o padrão", () => {
    expect(nivelDoMembro(-30)).toMatchObject({ atual: { nome: "Iniciante" }, faltam: 100, progresso: 0 });
    expect(nivelDoMembro(150, []).atual.nome).toBe("Aprendiz");
  });
});

describe("esquemaNiveis", () => {
  it("aceita o padrão", () => expect(esquemaNiveis.safeParse(NIVEIS_PADRAO).success).toBe(true));
  it.each([
    [[], "Pelo menos um nível."],
    [[{ nome: "A1", minimo: 10 }], "O primeiro nível começa em 0 ponto."],
    [[{ nome: "A1", minimo: 0 }, { nome: "B1", minimo: 0 }], "Os pontos mínimos precisam crescer de um nível para o seguinte."],
    [[{ nome: "A", minimo: 0 }], "Nome do nível com 2 a 30 caracteres."],
  ])("recusa %j", (niveis, msg) => {
    const r = esquemaNiveis.safeParse(niveis);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(msg);
  });
});

it("período do ranking: semana por padrão", () => {
  expect(lerPeriodoRanking("mes")).toBe("mes");
  expect(lerPeriodoRanking("ano")).toBe("semana");
});
