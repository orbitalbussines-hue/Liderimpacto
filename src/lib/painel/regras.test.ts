import { describe, expect, it } from "vitest";
import { diaMes, formatarTaxa, fraseDoEvento, lerPeriodo, tempoRelativo, textoDaVariacao, variacao } from "./regras";

describe("lerPeriodo", () => {
  it("aceita 7, 30 e 90; o resto vira 30", () => {
    expect([lerPeriodo("7"), lerPeriodo("30"), lerPeriodo("90")]).toEqual([7, 30, 90]);
    for (const v of [undefined, "", "15", "7d", "-7", "07a", ["7", "90"], "999"]) expect(lerPeriodo(v)).toBe(30);
  });
});

describe("variacao", () => {
  it("alta, queda e igual em % do anterior", () => {
    expect(variacao(15, 10)).toEqual({ tipo: "alta", percentual: 50 });
    expect(variacao(13, 27)).toMatchObject({ tipo: "queda" });
    expect((variacao(13, 27) as { percentual: number }).percentual).toBeCloseTo(51.85, 2);
    expect(variacao(0, 4)).toEqual({ tipo: "queda", percentual: 100 });
    expect(variacao(4, 4)).toEqual({ tipo: "igual" });
  });

  it("base zero: 'novo' em vez de infinito; os dois zerados = sem dados", () => {
    expect(variacao(3, 0)).toEqual({ tipo: "novo" });
    expect(variacao(0, 0)).toEqual({ tipo: "sem-dados" });
  });

  it("texto tem seta e sinal (não só cor) e versão por extenso", () => {
    expect(textoDaVariacao(variacao(13, 27))).toEqual({ texto: "↘ −51,9%", leitor: "queda de 51,9%", tom: "warn" });
    expect(textoDaVariacao(variacao(15, 10))).toMatchObject({ texto: "↗ +50,0%", tom: "ok" });
    expect(textoDaVariacao(variacao(2, 0)).texto).toBe("novo");
    expect(textoDaVariacao(variacao(0, 0)).texto).toBe("—");
    expect(textoDaVariacao(variacao(5, 5)).texto).toBe("→ 0%");
  });

  it("taxa com uma casa", () => {
    expect(formatarTaxa(0.391)).toBe("39,1%");
    expect(formatarTaxa(1)).toBe("100,0%");
  });
});

describe("tempoRelativo e eixo", () => {
  const agora = new Date("2026-10-14T15:00:00-03:00");
  it("minutos, horas e data/hora de Brasília depois de um dia", () => {
    expect(tempoRelativo(new Date(agora.getTime() - 20_000), agora)).toBe("agora");
    expect(tempoRelativo(new Date(agora.getTime() - 5 * 60_000), agora)).toBe("há 5 min");
    expect(tempoRelativo(new Date(agora.getTime() - 3 * 3_600_000), agora)).toBe("há 3 h");
    // 23:30 em Brasília é 02:30 UTC do dia seguinte: o texto fica no dia de Brasília.
    expect(tempoRelativo(new Date("2026-09-21T23:30:00-03:00"), agora)).toBe("21/09 · 23:30");
  });
  it("diaMes", () => expect(diaMes("2026-09-03")).toBe("03/09"));
});

describe("fraseDoEvento", () => {
  const quando = new Date();
  it("frases humanas, com e sem número da aula, e sem pessoa no evento do worker", () => {
    expect(fraseDoEvento({ tipo: "conclusao", quando, pessoa: "Ana Demo", aula: "Cultura organizacional do líder", numero: "3.2" })).toEqual({
      pessoa: "Ana Demo",
      destaque: "Ana Demo",
      texto: "concluiu a aula 3.2 · Cultura organizacional do líder",
    });
    expect(fraseDoEvento({ tipo: "conclusao", quando, pessoa: "Ana", aula: "Intro", numero: null }).texto).toBe("concluiu a aula Intro");
    expect(fraseDoEvento({ tipo: "matricula", quando, pessoa: "Ana", produto: "Líder de Impacto" }).texto).toBe("recebeu matrícula em Líder de Impacto");
    expect(fraseDoEvento({ tipo: "reativacao", quando, pessoa: "Ana", produto: "X" }).texto).toBe("teve a matrícula reativada em X");
    expect(fraseDoEvento({ tipo: "membro", quando, pessoa: "Ana", papel: "ALUNO" }).texto).toBe("entrou na área de membros");
    expect(fraseDoEvento({ tipo: "membro", quando, pessoa: "Bia", papel: "ADMIN" }).texto).toBe("entrou na equipe como Admin");
    expect(fraseDoEvento({ tipo: "publicacao", quando, pessoa: "Valmer", produto: "X" }).texto).toBe("publicou X");
    expect(fraseDoEvento({ tipo: "publicacao", quando, pessoa: null, produto: "X" })).toEqual({ pessoa: null, destaque: "X", texto: "foi publicado" });
    expect(fraseDoEvento({ tipo: "video", quando, aula: "Intro" })).toEqual({ pessoa: null, destaque: "Vídeo pronto", texto: "na aula Intro" });
  });
});
