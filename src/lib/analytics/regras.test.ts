import { describe, expect, it } from "vitest";
import { csvAvaliacoes, csvConteudo, csvRetencao } from "./csv";
import {
  abandono, consulta, faixaDeCalor, formatarDuracao, formatarHoras, gerarCsv, lerAba, lerCurso, lerOrdem, maiorQueda,
  montarCoortes, ordenarAulas, taxa, variacaoEmPontos, type AulaAnalytics,
} from "./regras";

const ID = "3f2b8c1e-1a2b-4c3d-8e9f-001122334455";

const aula = (o: Partial<AulaAnalytics>): AulaAnalytics => ({
  aulaId: "a", produtoId: "p", curso: "Curso", numero: "1.1", titulo: "Aula", posicao: 1, iniciaram: 0, concluiram: 0, pararam: 0, tempoMedioSeg: 0, ...o,
});

describe("leitura da URL", () => {
  it("aba, curso e ordem: lixo vira o padrão", () => {
    expect(lerAba("retencao")).toBe("retencao");
    expect(lerAba(["conteudo"])).toBe("visao-geral");
    expect(lerAba("x")).toBe("visao-geral");
    expect(lerCurso(ID.toUpperCase())).toBe(ID);
    expect(lerCurso("1 or 1=1")).toBeNull();
    expect(lerCurso([ID])).toBeNull();
    expect(lerOrdem("estrutura")).toBe("estrutura");
    expect(lerOrdem("qualquer")).toBe("abandono");
  });

  it("consulta omite os padrões e mantém período e curso", () => {
    expect(consulta({ aba: "visao-geral", periodo: { de: "2026-09-15", ate: "2026-10-14" }, curso: null })).toBe("de=2026-09-15&ate=2026-10-14");
    expect(consulta({ aba: "conteudo", periodo: { de: "2026-09-01", ate: "2026-09-30" }, curso: ID, ordem: "estrutura" })).toBe(`aba=conteudo&de=2026-09-01&ate=2026-09-30&curso=${ID}&ordem=estrutura`);
  });
});

describe("números", () => {
  it("taxa com base zero é nula", () => {
    expect(taxa(1, 4)).toBe(0.25);
    expect(taxa(0, 0)).toBeNull();
  });

  it("variação de taxa em pontos percentuais, com seta e por extenso", () => {
    expect(variacaoEmPontos(0.6, 0.55)).toEqual({ texto: "↗ +5,0 p.p.", leitor: "alta de 5,0 pontos percentuais", tom: "ok" });
    expect(variacaoEmPontos(0.5, 0.75).texto).toBe("↘ −25,0 p.p.");
    expect(variacaoEmPontos(0.5, 0.5).texto).toBe("→ 0 p.p.");
    expect(variacaoEmPontos(0.5, null).texto).toBe("—");
  });

  it("horas e duração", () => {
    expect(formatarHoras(0)).toBe("0 min");
    expect(formatarHoras(2700)).toBe("45 min");
    expect(formatarHoras(45_000)).toBe("12,5 h");
    expect(formatarHoras(3600 * 1234.4)).toBe("1.234 h");
    expect(formatarDuracao(38.4)).toBe("38 s");
    expect(formatarDuracao(245)).toBe("4 min 05 s");
  });
});

describe("abandono por aula", () => {
  const x = aula({ aulaId: "x", posicao: 1, iniciaram: 10, pararam: 2 });
  const y = aula({ aulaId: "y", posicao: 2, iniciaram: 4, pararam: 2 });
  const z = aula({ aulaId: "z", posicao: 3, iniciaram: 8, pararam: 4 });
  const w = aula({ aulaId: "w", posicao: 4 });

  it("abandono = pararam ÷ começaram; ninguém começou = nulo", () => {
    expect(abandono(x)).toBe(0.2);
    expect(abandono(w)).toBeNull();
  });

  it("maior queda: maior taxa, empate pela quantidade parada; ninguém parado = nula", () => {
    expect(maiorQueda([x, y, z, w])?.aulaId).toBe("z");
    expect(maiorQueda([x, aula({ iniciaram: 3 })])?.aulaId).toBe("x");
    expect(maiorQueda([w, aula({ iniciaram: 5, concluiram: 5 })])).toBeNull();
  });

  it("ordena pelo maior abandono (sem dado por último) ou pela ordem do curso", () => {
    expect(ordenarAulas([x, w, y, z], "abandono").map((a) => a.aulaId)).toEqual(["z", "y", "x", "w"]);
    expect(ordenarAulas([z, w, x, y], "estrutura").map((a) => a.aulaId)).toEqual(["x", "y", "z", "w"]);
  });
});

describe("coortes", () => {
  it("coorte i tem 8 − i semanas observáveis; amostra pequena abaixo de 5", () => {
    const linhas = Array.from({ length: 8 }, (_, i) => ({ semana: `2026-08-${10 + i}`, tamanho: i === 0 ? 10 : i === 6 ? 3 : 0, ativosPorSemana: (i === 0 ? { 0: 10, 1: 6, 7: 1 } : i === 6 ? { 0: 3 } : {}) as Record<number, number> }));
    const c = montarCoortes(linhas);
    expect(c[0].celulas).toHaveLength(8);
    expect(c[0].celulas.every((x) => x !== null)).toBe(true);
    expect(c[0].celulas[1]).toEqual({ ativos: 6, taxa: 0.6 });
    expect(c[0].celulas[2]).toEqual({ ativos: 0, taxa: 0 });
    expect(c[0].celulas[7]).toEqual({ ativos: 1, taxa: 0.1 });
    expect(c[0].pequena).toBe(false);
    expect(c[6].pequena).toBe(true);
    expect(c[6].celulas.filter((x) => x !== null)).toHaveLength(2);
    expect(c[7].celulas.filter((x) => x !== null)).toHaveLength(1);
    expect(c[7]).toMatchObject({ tamanho: 0, pequena: false });
    expect(c[7].celulas[0]).toEqual({ ativos: 0, taxa: null });
  });

  it("faixa de calor", () => {
    expect([null, 0, 0.1, 0.25, 0.5, 0.75, 1].map(faixaDeCalor)).toEqual([0, 0, 1, 2, 3, 4, 4]);
  });
});

describe("CSV", () => {
  it("; separa, vírgula decimal, BOM, CRLF, aspas quando preciso e nada de fórmula", () => {
    const t = gerarCsv(["a", "b", "c"], [["=HYPERLINK(1)", 0.25, null], ['diz "oi"; tchau', 3, "-1"]]);
    expect(t.startsWith("﻿")).toBe(true);
    expect(t.slice(1).split("\r\n")).toEqual(["a;b;c", "'=HYPERLINK(1);0,25;", '"diz ""oi""; tchau";3;\'-1', ""]);
  });

  it("tabelas das abas: só agregados, colunas estáveis", () => {
    const conteudo = csvConteudo(
      [{ produtoId: "p", curso: "Curso", iniciaram: 4, concluiram: 1, tempoMedioSeg: 99.6 }],
      [aula({ aulaId: "x", produtoId: "p", iniciaram: 4, concluiram: 3, pararam: 1, tempoMedioSeg: 50 })],
    ).slice(1).split("\r\n");
    expect(conteudo[0]).toBe("nivel;curso_id;curso;aula_id;aula_numero;aula;iniciaram;concluiram;taxa_conclusao;pararam_antes_de_90;taxa_abandono;tempo_medio_seg");
    expect(conteudo[1]).toBe("curso;p;Curso;;;;4;1;0,25;;;100");
    expect(conteudo[2]).toBe("aula;p;Curso;x;1.1;Aula;4;3;0,75;1;0,25;50");

    const ret = csvRetencao(montarCoortes([{ semana: "2026-10-05", tamanho: 2, ativosPorSemana: { 0: 1 } }, { semana: "2026-10-12", tamanho: 0, ativosPorSemana: {} }]));
    expect(ret.slice(1).split("\r\n").slice(0, 3)).toEqual(["semana_de_entrada;alunos;amostra_pequena;semana_0;semana_1", "2026-10-05;2;sim;0,5;0", "2026-10-12;0;nao;;"]);

    const av = csvAvaliacoes([
      { avaliacaoId: "v", titulo: "Prova", curso: "Curso", notaMinima: 70, tentativas: 3, alunos: 2, aprovados: 1, notaMedia: 62.5,
        questoes: [{ questaoId: "q", ordem: 2, enunciado: "Quanto?", erros: 2, respostas: 3 }, { questaoId: "r", ordem: null, enunciado: null, erros: 1, respostas: 3 }] },
    ]).slice(1).split("\r\n");
    expect(av[1]).toBe("v;Curso;Prova;70;3;2;1;0,5;62,5;2. Quanto?;2;3;(questão removida);1;3;;;");
  });
});
