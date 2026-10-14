// @vitest-environment node
import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ehFalhaDefinitiva, esquemaJobVideo, opcoesDoJob } from "./fila";
import { esquemaConclusao, esquemaEventoVideo, esquemaPedidoEnvio, montarReproducao } from "./provedor-proprio";
import { decifrarSegmento, ivDaPlaylist, pareceMpegTs } from "./segmento";
import { verificarToken } from "./token";

const SEGREDO = "t".repeat(48);
const VIDEO = "6f1c9f8e-2a4b-4c1d-9e3f-0a1b2c3d4e5f";

describe("montarReproducao", () => {
  it("master assinada com token do usuário e rota da chave", () => {
    const agora = Date.UTC(2026, 9, 14);
    const r = montarReproducao({ videoId: VIDEO, criadorId: "c-1", usuarioId: "u-1", sessaoId: "s-1" }, agora, SEGREDO);
    expect(r.urlMaster).toBe(`/api/video/${VIDEO}/hls/master.m3u8?t=${encodeURIComponent(r.token)}`);
    expect(r.urlChave).toBe(`/api/video/${VIDEO}/chave`);
    expect(r.sessaoId).toBe("s-1");
    expect(new Date(r.expiraEm).getTime() - agora).toBe(600_000);
    expect(verificarToken(r.token, { videoId: VIDEO, criadorId: "c-1", usuarioId: "u-1" }, agora, SEGREDO).ok).toBe(true);
    expect(verificarToken(r.token, { videoId: VIDEO, criadorId: "c-2" }, agora, SEGREDO).ok).toBe(false);
  });
});

describe("validação na fronteira", () => {
  const pedido = { aulaId: VIDEO, nome: "Aula 01 - Liderança.mp4", mime: "video/mp4", tamanho: 1_000_000, substituir: false };

  it("pedido de envio: campos estritos (a allowlist fica em regras.test.ts)", () => {
    expect(esquemaPedidoEnvio.parse(pedido)).toEqual(pedido);
    expect(() => esquemaPedidoEnvio.parse({ ...pedido, extra: 1 })).toThrow();
    expect(() => esquemaPedidoEnvio.parse({ ...pedido, aulaId: "x" })).toThrow();
    expect(() => esquemaPedidoEnvio.parse({ ...pedido, substituir: "sim" })).toThrow();
  });

  it("conclusão do envio: partes numeradas com ETag", () => {
    expect(esquemaConclusao.parse({ partes: [{ numero: 1, etag: '"abc123"' }] }).partes).toHaveLength(1);
    expect(() => esquemaConclusao.parse({ partes: [] })).toThrow();
    expect(() => esquemaConclusao.parse({ partes: [{ numero: 0, etag: "a" }] })).toThrow();
    expect(() => esquemaConclusao.parse({ partes: [{ numero: 1, etag: "a<script>" }] })).toThrow();
  });

  it("evento do worker: só os tipos conhecidos, com campos estritos", () => {
    const pronto = {
      tipo: "video.pronto",
      videoId: VIDEO,
      tentativa: 1,
      duracaoSeg: 60,
      resolucoes: ["720p", "480p"],
      prefixoHls: `criadores/c/videos/${VIDEO}`,
      thumbChave: `criadores/c/videos/${VIDEO}/thumb.jpg`,
      cpuSeg: 12,
      log: "",
    };
    expect(esquemaEventoVideo.parse(pronto).tipo).toBe("video.pronto");
    expect(() => esquemaEventoVideo.parse({ tipo: "video.apagar", videoId: VIDEO })).toThrow();
    expect(() => esquemaEventoVideo.parse({ ...pronto, videoId: "x" })).toThrow();
    expect(() => esquemaEventoVideo.parse({ ...pronto, prefixoHls: "/etc" })).toThrow();
  });

  it("job da fila: só videoId uuid, jobId = videoId (idempotente), 3 tentativas", () => {
    expect(esquemaJobVideo.parse({ videoId: VIDEO })).toEqual({ videoId: VIDEO });
    expect(() => esquemaJobVideo.parse({ videoId: VIDEO, origem: "/etc" })).toThrow();
    expect(opcoesDoJob(VIDEO)).toMatchObject({ jobId: VIDEO, attempts: 3 });
    expect(ehFalhaDefinitiva(2, 3)).toBe(false);
    expect(ehFalhaDefinitiva(3, 3)).toBe(true);
  });
});

describe("segmento cifrado", () => {
  it("TS em claro é reconhecido; cifrado não; decifrado volta a ser TS", () => {
    const ts = Buffer.alloc(188 * 10);
    for (let i = 0; i < 10; i++) ts[i * 188] = 0x47;
    const chave = randomBytes(16);
    const iv = ivDaPlaylist('#EXT-X-KEY:METHOD=AES-128,URI="chave",IV=0x00000000000000000000000000000007');
    const c = createCipheriv("aes-128-cbc", chave, iv);
    const cifrado = Buffer.concat([c.update(ts), c.final()]);
    expect(pareceMpegTs(ts)).toBe(true);
    expect(pareceMpegTs(cifrado)).toBe(false);
    expect(pareceMpegTs(decifrarSegmento(cifrado, chave, iv))).toBe(true);
    expect(ivDaPlaylist("#EXTM3U", 7).equals(iv)).toBe(true);
  });
});
