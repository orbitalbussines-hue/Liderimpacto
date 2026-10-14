// @vitest-environment node
/**
 * Integração LENTA e opcional: gera um vídeo de 5 s com o FFmpeg e roda o pipeline REAL.
 * Fora do `npm test` padrão; para rodar (precisa de ffmpeg/ffprobe no PATH):
 *
 *   VIDEO_TESTE_REAL=1 npx vitest run --config config/vitest.config.mts tests/video
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gerarVideoTeste } from "../../scripts/video-gerar-teste";
import { gerarChaveVideo } from "@/lib/video/chaves";
import { reescreverPlaylist } from "@/lib/video/playlist";
import { processarVideo, type ResultadoProcessamento } from "@/lib/video/processar";
import { decifrarSegmento, ivDaPlaylist, pareceMpegTs } from "@/lib/video/segmento";

describe.skipIf(!process.env.VIDEO_TESTE_REAL)("pipeline real (FFmpeg)", () => {
  let pasta = "";
  const chave = gerarChaveVideo();
  let resultado: ResultadoProcessamento;

  beforeAll(async () => {
    pasta = await mkdtemp(join(tmpdir(), "video-integracao-"));
    const origem = await gerarVideoTeste({ duracaoSeg: 5, altura: 720, saida: join(pasta, "origem.mp4") });
    resultado = await processarVideo({ origem, destinoDir: join(pasta, "hls"), chave });
  }, 120_000);

  afterAll(async () => {
    if (pasta) await rm(pasta, { recursive: true, force: true });
  });

  it("gera master, variantes 720p+480p, segmentos e thumbnail", () => {
    expect(resultado.duracaoSeg).toBeCloseTo(5, 0);
    expect(resultado.resolucoes).toEqual(["720p", "480p"]);
    expect(resultado.arquivos).toEqual(
      expect.arrayContaining(["master.m3u8", "thumb.jpg", "720p/index.m3u8", "720p/seg_00000.ts", "480p/index.m3u8"]),
    );
    expect(resultado.cpuSeg).toBeGreaterThan(0);
  });

  it("segmento cifrado não é TS; com a chave e o IV da playlist volta a ser", async () => {
    const playlist = await readFile(join(pasta, "hls", "720p", "index.m3u8"), "utf8");
    const bruto = await readFile(join(pasta, "hls", "720p", "seg_00000.ts"));
    expect(pareceMpegTs(bruto)).toBe(false);
    expect(pareceMpegTs(decifrarSegmento(bruto, chave, ivDaPlaylist(playlist)))).toBe(true);
  });

  it("a playlist real é reescrita com token e rota da chave", async () => {
    const playlist = await readFile(join(pasta, "hls", "720p", "index.m3u8"), "utf8");
    const saida = reescreverPlaylist(playlist, { token: "T", uriChave: "/api/video/x/chave" });
    expect(saida).toContain('URI="/api/video/x/chave?t=T"');
    expect(saida).toMatch(/seg_00000\.ts\?t=T/);
  });
});
