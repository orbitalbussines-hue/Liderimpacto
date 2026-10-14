import { describe, expect, it } from "vitest";
import * as regras from "@/lib/progresso/regras";
import { acumuladorDeIntervalos, corpoDaBatida, LIMITES_BATIDA } from "./acumulador";

/** Simula `timeupdate` a cada 250 ms de `de` até `ate` (velocidade 1). */
function tocar(a: ReturnType<typeof acumuladorDeIntervalos>, de: number, ate: number, passo = 0.25) {
  for (let t = de; t <= ate + 1e-9; t += passo) a.tocou(Math.round(t * 1000) / 1000);
}

describe("acumuladorDeIntervalos", () => {
  it("usa os mesmos limites do servidor (regras.ts)", () => {
    expect(LIMITES_BATIDA.trechoMaxSeg).toBe(regras.LIMITE_INTERVALO_SEG);
    expect(LIMITES_BATIDA.maxTrechos).toBe(regras.MAX_INTERVALOS_POR_BATIDA);
    expect(LIMITES_BATIDA.bytesMax).toBe(regras.TAMANHO_MAXIMO_CORPO);
    expect(LIMITES_BATIDA.intervaloMinimoMs).toBe(regras.INTERVALO_MINIMO_BATIDA_MS);
    expect(LIMITES_BATIDA.percentualConclusao).toBe(regras.PERCENTUAL_CONCLUSAO);
  });

  it("junta o que tocou em sequência e zera depois de retirar", () => {
    const a = acumuladorDeIntervalos(600);
    tocar(a, 10, 18);
    expect(a.retirar()).toEqual([[10, 18]]);
    expect(a.retirar()).toEqual([]);
  });

  it("seek não conta: pular de 20 para 300 fecha o trecho e abre outro no destino", () => {
    const a = acumuladorDeIntervalos(600);
    tocar(a, 0, 20);
    a.interromper(); // seeking
    tocar(a, 300, 305);
    expect(a.retirar()).toEqual([
      [0, 20],
      [300, 305],
    ]);
  });

  it("salto sem evento de seek (timeupdate de 20 para 200) também não conta", () => {
    const a = acumuladorDeIntervalos(600);
    tocar(a, 0, 20);
    a.tocou(200);
    a.tocou(200.25);
    expect(a.retirar()).toEqual([
      [0, 20],
      [200, 200.25],
    ]);
  });

  it("trecho maior que 30 s sai fatiado", () => {
    const a = acumuladorDeIntervalos(600);
    tocar(a, 0, 75);
    expect(a.retirar()).toEqual([
      [0, 30],
      [30, 60],
      [60, 75],
    ]);
  });

  it("no máximo 20 trechos por batida; o resto fica para a próxima", () => {
    const a = acumuladorDeIntervalos(3600);
    for (let i = 0; i < 25; i++) {
      tocar(a, i * 100, i * 100 + 2);
      a.interromper();
    }
    expect(a.retirar()).toHaveLength(20);
    expect(a.retirar()).toHaveLength(5);
    expect(a.vazio()).toBe(true);
  });

  it("batidas seguidas durante a reprodução não deixam buraco entre si", () => {
    const a = acumuladorDeIntervalos(600);
    tocar(a, 0, 10);
    const primeira = a.retirar();
    tocar(a, 10.25, 20);
    expect(primeira).toEqual([[0, 10]]);
    expect(a.retirar()).toEqual([[10, 20]]);
  });

  it("devolver (envio falhou) mescla com o que tocou depois", () => {
    const a = acumuladorDeIntervalos(600);
    tocar(a, 0, 10);
    const falhou = a.retirar();
    tocar(a, 10.25, 15);
    a.devolver(falhou);
    expect(a.retirar()).toEqual([[0, 15]]);
  });

  it("nunca passa de duracaoSeg + 1", () => {
    const a = acumuladorDeIntervalos(60);
    tocar(a, 55, 64);
    expect(a.retirar()).toEqual([[55, 61]]);
  });

  it("o corpo passa no esquemaBatida do servidor e cabe em 4 KB no pior caso", () => {
    const a = acumuladorDeIntervalos(43_000);
    for (let i = 0; i < 40; i++) {
      tocar(a, i * 1000 + 0.123, i * 1000 + 29.987, 0.333);
      a.interromper();
    }
    const corpo = corpoDaBatida("5f0c2a7e-2f7b-4f32-9b1e-0a5e2b1c9d10", a.retirar(), 39_999.123456, 43_000);
    expect(corpo.intervalos).toHaveLength(20);
    expect(regras.esquemaBatida.safeParse(corpo).success).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(corpo)).length).toBeLessThanOrEqual(LIMITES_BATIDA.bytesMax);
  });

  it("posição fora do vídeo é limitada", () => {
    expect(corpoDaBatida("x", [], 999, 60).posicao).toBe(61);
    expect(corpoDaBatida("x", [], Number.NaN, 60).posicao).toBe(0);
  });
});
