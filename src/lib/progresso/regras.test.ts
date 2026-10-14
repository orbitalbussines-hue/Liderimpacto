// @vitest-environment node
import { describe, expect, it } from "vitest";
import { esquemaBatida, mesclarIntervalos, prepararBatida, retomarEm } from "./regras";

describe("mesclarIntervalos", () => {
  it("vazio e um só", () => {
    expect(mesclarIntervalos([])).toEqual([]);
    expect(mesclarIntervalos([[3, 7]])).toEqual([[3, 7]]);
  });

  it("sobreposição, contido e fora de ordem", () => {
    expect(mesclarIntervalos([[10, 20], [0, 12]])).toEqual([[0, 20]]);
    expect(mesclarIntervalos([[0, 30], [5, 10]])).toEqual([[0, 30]]);
    expect(mesclarIntervalos([[50, 60], [0, 5], [55, 70], [4, 8]])).toEqual([[0, 8], [50, 70]]);
  });

  it("adjacência funde (o fim de um é o início do outro); vão de 1 s não funde", () => {
    expect(mesclarIntervalos([[0, 10], [10, 20]])).toEqual([[0, 20]]);
    expect(mesclarIntervalos([[0, 10], [11, 20]])).toEqual([[0, 10], [11, 20]]);
  });

  it("repetido e vazio/invertido", () => {
    expect(mesclarIntervalos([[5, 9], [5, 9], [5, 9]])).toEqual([[5, 9]]);
    expect(mesclarIntervalos([[4, 4], [9, 2], [1, 3]])).toEqual([[1, 3]]);
  });

  it("não altera a entrada", () => {
    const entrada: [number, number][] = [[10, 20], [0, 15]];
    mesclarIntervalos(entrada);
    expect(entrada).toEqual([[10, 20], [0, 15]]);
  });
});

describe("prepararBatida (bits por segundo)", () => {
  it("arredonda as pontas: batidas contíguas não deixam buraco nem contam duas vezes", () => {
    const a = prepararBatida({ intervalos: [[0, 12.3]], posicao: 12.3 });
    const b = prepararBatida({ intervalos: [[12.3, 22]], posicao: 22 });
    expect(a).toMatchObject({ inicio: 0, segundos: 12, maiorFim: 12, posicao: 12 });
    expect(b).toMatchObject({ inicio: 12, segundos: 10, maiorFim: 22 });
    expect(a.bits).toBe("1".repeat(12));
  });

  it("vãos viram zeros; sobreposição conta uma vez", () => {
    const p = prepararBatida({ intervalos: [[2, 4], [7, 9], [3, 5]], posicao: 9 });
    expect(p).toMatchObject({ inicio: 2, bits: "1110011", segundos: 5, maiorFim: 9 });
  });

  it("só posição (pause/seek sem tocar): nada assistido", () => {
    expect(prepararBatida({ intervalos: [], posicao: 431.9 })).toEqual({ inicio: 0, bits: "", segundos: 0, maiorFim: 0, posicao: 431 });
  });

  it("trecho menor que meio segundo não conta", () => {
    expect(prepararBatida({ intervalos: [[4.6, 4.9]], posicao: 5 }).segundos).toBe(0);
  });
});

describe("esquemaBatida (o que o servidor aceita)", () => {
  const base = { aulaId: "6f1c1d1e-1f2a-4b3c-8d4e-5f6a7b8c9d0e", posicao: 10, duracaoSeg: 600 };

  it("aceita a batida normal (até 30 s por trecho, até 20 trechos)", () => {
    expect(esquemaBatida.safeParse({ ...base, intervalos: [[0, 10]] }).success).toBe(true);
    expect(esquemaBatida.safeParse({ ...base, intervalos: [[571, 600.4]] }).success).toBe(true);
    expect(esquemaBatida.safeParse({ ...base, intervalos: Array.from({ length: 20 }, (_, i) => [i * 10, i * 10 + 5]) }).success).toBe(true);
  });

  it("recusa trecho > 30 s ('pulei e marquei tudo'), fora do vídeo, invertido, demais ou campo a mais", () => {
    expect(esquemaBatida.safeParse({ ...base, intervalos: [[0, 600]] }).success).toBe(false);
    expect(esquemaBatida.safeParse({ ...base, intervalos: [[0, 30.5]] }).success).toBe(false);
    expect(esquemaBatida.safeParse({ ...base, intervalos: [[590, 610]] }).success).toBe(false);
    expect(esquemaBatida.safeParse({ ...base, intervalos: [[-1, 5]] }).success).toBe(false);
    expect(esquemaBatida.safeParse({ ...base, intervalos: [[9, 5]] }).success).toBe(false);
    expect(esquemaBatida.safeParse({ ...base, intervalos: Array.from({ length: 21 }, () => [0, 1]) }).success).toBe(false);
    expect(esquemaBatida.safeParse({ ...base, posicao: 700, intervalos: [] }).success).toBe(false);
    expect(esquemaBatida.safeParse({ ...base, intervalos: [], criadorId: base.aulaId }).success).toBe(false);
    expect(esquemaBatida.safeParse({ ...base, intervalos: [[0, Number.POSITIVE_INFINITY]] }).success).toBe(false);
  });
});

describe("retomarEm", () => {
  it("volta à última posição; perto do fim (ou sem dado) recomeça do zero", () => {
    expect(retomarEm(125, 600)).toBe(125);
    expect(retomarEm(591, 600)).toBe(0);
    expect(retomarEm(0, 600)).toBe(0);
    expect(retomarEm(125, null)).toBe(0);
  });
});
