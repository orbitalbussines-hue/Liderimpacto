// @vitest-environment node
import { describe, expect, it } from "vitest";
import { chavesDoHls, classificar, type Conferencia } from "./reconferir";

const PRONTO_OK: Conferencia = { situacao: "PRONTO", original: true, hls: [true, true, true], naFila: false };
const classe = (c: Partial<Conferencia>) => classificar({ ...PRONTO_OK, ...c }).classe;

describe("reconferência do storage (incidente 23/10)", () => {
  it("monta master + index e 1º segmento de cada resolução", () => {
    expect(chavesDoHls("criadores/c/videos/v", ["720p", "360p"])).toEqual([
      "criadores/c/videos/v/master.m3u8",
      "criadores/c/videos/v/720p/index.m3u8",
      "criadores/c/videos/v/720p/seg_00000.ts",
      "criadores/c/videos/v/360p/index.m3u8",
      "criadores/c/videos/v/360p/seg_00000.ts",
    ]);
  });

  it("PRONTO com HLS inteiro é OK, mesmo sem o original (só avisa)", () => {
    expect(classificar(PRONTO_OK)).toEqual({ classe: "OK", motivo: "" });
    expect(classificar({ ...PRONTO_OK, original: false }).classe).toBe("OK");
  });

  it("PRONTO com HLS faltando: REPROCESSAR com original, SEM_ORIGINAL sem ele", () => {
    expect(classe({ hls: [true, false, true] })).toBe("REPROCESSAR");
    expect(classe({ hls: [] })).toBe("REPROCESSAR");
    expect(classe({ hls: [true] })).toBe("REPROCESSAR");
    expect(classe({ hls: [false, false, false], original: false })).toBe("SEM_ORIGINAL");
  });

  it("FALHOU reprocessa só com o original; sem ele, reenviar", () => {
    expect(classe({ situacao: "FALHOU", hls: [] })).toBe("REPROCESSAR");
    expect(classe({ situacao: "FALHOU", hls: [], original: false })).toBe("SEM_ORIGINAL");
  });

  it("PROCESSANDO: na fila é OK; parado sem job é REPROCESSAR; sem original, reenviar", () => {
    expect(classe({ situacao: "PROCESSANDO", hls: [], naFila: true })).toBe("OK");
    expect(classe({ situacao: "PROCESSANDO", hls: [] })).toBe("REPROCESSAR");
    expect(classe({ situacao: "PROCESSANDO", hls: [], naFila: true, original: false })).toBe("SEM_ORIGINAL");
  });
});
