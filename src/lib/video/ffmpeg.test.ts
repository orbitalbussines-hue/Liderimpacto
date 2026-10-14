// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  degrausAplicaveis,
  gopEmQuadros,
  interpretarBenchmark,
  interpretarFfprobe,
  montarArgumentosHls,
  montarArgumentosThumbnail,
  type SondaVideo,
} from "./ffmpeg";

const SONDA_1080: SondaVideo = { duracaoSeg: 60, largura: 1920, altura: 1080, fps: 30, codecVideo: "h264", temAudio: true };

function hls(sonda: SondaVideo) {
  return montarArgumentosHls({ origem: "entrada.mp4", destinoDir: "saida", arquivoKeyInfo: "/tmp/k/chave.info", sonda });
}

function valorDe(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

describe("montarArgumentosHls", () => {
  it("escada padrão 720p 2800k + 480p 1400k, AAC 128k, HLS VOD cifrado", () => {
    const args = hls(SONDA_1080);
    expect(valorDe(args, "-filter_complex")).toBe("[0:v]split=2[s0][s1];[s0]scale=-2:720,format=yuv420p[v0];[s1]scale=-2:480,format=yuv420p[v1]");
    expect(valorDe(args, "-b:v:0")).toBe("2800k");
    expect(valorDe(args, "-b:v:1")).toBe("1400k");
    expect(valorDe(args, "-c:a")).toBe("aac");
    expect(valorDe(args, "-b:a")).toBe("128k");
    expect(valorDe(args, "-var_stream_map")).toBe("v:0,a:0,name:720p v:1,a:1,name:480p");
    expect(valorDe(args, "-hls_time")).toBe("6");
    expect(valorDe(args, "-hls_playlist_type")).toBe("vod");
    expect(valorDe(args, "-hls_flags")).toBe("independent_segments");
    expect(valorDe(args, "-hls_key_info_file")).toBe("/tmp/k/chave.info");
    expect(valorDe(args, "-master_pl_name")).toBe("master.m3u8");
    expect(valorDe(args, "-hls_segment_filename")).toBe("saida/%v/seg_%05d.ts");
    expect(args.at(-1)).toBe("saida/%v/index.m3u8");
    expect(args.filter((a) => a === "0:a:0")).toHaveLength(2);
  });

  it("GOP alinhado a 2 s, sem keyframe por troca de cena", () => {
    const args = hls({ ...SONDA_1080, fps: 29.97 });
    expect(valorDe(args, "-g")).toBe("60");
    expect(valorDe(args, "-keyint_min")).toBe("60");
    expect(valorDe(args, "-sc_threshold")).toBe("0");
    expect(gopEmQuadros(25)).toBe(50);
    expect(gopEmQuadros(60)).toBe(120);
  });

  it("vídeo sem áudio: nenhum map/codec de áudio e var_stream_map só com vídeo", () => {
    const args = hls({ ...SONDA_1080, temAudio: false });
    expect(args).not.toContain("0:a:0");
    expect(args).not.toContain("-c:a");
    expect(valorDe(args, "-var_stream_map")).toBe("v:0,name:720p v:1,name:480p");
  });

  it("nunca é string de shell: o nome do arquivo vai como argumento único", () => {
    const args = montarArgumentosHls({ origem: "a; rm -rf ~.mp4", destinoDir: "d", arquivoKeyInfo: "k", sonda: SONDA_1080 });
    expect(valorDe(args, "-i")).toBe("a; rm -rf ~.mp4");
  });

  it("limite de threads só quando pedido", () => {
    expect(hls(SONDA_1080)).not.toContain("-threads");
    const args = montarArgumentosHls({ origem: "e", destinoDir: "d", arquivoKeyInfo: "k", sonda: SONDA_1080, threads: 4 });
    expect(valorDe(args, "-threads")).toBe("4");
  });
});

describe("degrausAplicaveis (sem upscale)", () => {
  it("720p de origem mantém 720p e 480p", () => {
    expect(degrausAplicaveis({ ...SONDA_1080, largura: 1280, altura: 720 }).map((d) => d.nome)).toEqual(["720p", "480p"]);
  });

  it("origem de 600 linhas pula o 720p", () => {
    const args = hls({ ...SONDA_1080, largura: 1066, altura: 600 });
    expect(valorDe(args, "-filter_complex")).toBe("[0:v]split=1[s0];[s0]scale=-2:480,format=yuv420p[v0]");
    expect(valorDe(args, "-var_stream_map")).toBe("v:0,a:0,name:480p");
  });

  it("origem menor que todos os degraus sai na resolução original com o menor bitrate", () => {
    expect(degrausAplicaveis({ ...SONDA_1080, largura: 640, altura: 361 })).toEqual([{ nome: "360p", altura: 360, bitrateVideoK: 1400 }]);
  });

  it("vídeo vertical usa o lado menor (largura) e escala pela largura", () => {
    const vertical = { ...SONDA_1080, largura: 1080, altura: 1920 };
    expect(degrausAplicaveis(vertical).map((d) => d.nome)).toEqual(["720p", "480p"]);
    expect(valorDe(hls(vertical), "-filter_complex")).toContain("scale=720:-2");
  });
});

describe("montarArgumentosThumbnail", () => {
  it("quadro em 10% da duração, no máximo 720 de altura", () => {
    const args = montarArgumentosThumbnail("e.mp4", "thumb.jpg", { ...SONDA_1080, duracaoSeg: 600 });
    expect(valorDe(args, "-ss")).toBe("60.000");
    expect(valorDe(args, "-vf")).toBe("scale=-2:720");
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
  });
});

describe("interpretarFfprobe", () => {
  // Recorte real de `ffprobe -show_format -show_streams` (FFmpeg 9) do vídeo de teste.
  const real = {
    streams: [
      { codec_name: "h264", codec_type: "video", width: 1280, height: 720, r_frame_rate: "30/1", avg_frame_rate: "30/1", duration: "5.000000", disposition: { attached_pic: 0 } },
      { codec_name: "aac", codec_type: "audio", r_frame_rate: "0/0", avg_frame_rate: "0/0", duration: "5.000000", disposition: { attached_pic: 0 } },
    ],
    format: { duration: "5.000000" },
  };

  it("lê duração, resolução, fps, codec e áudio", () => {
    expect(interpretarFfprobe(real)).toEqual({ duracaoSeg: 5, largura: 1280, altura: 720, fps: 30, codecVideo: "h264", temAudio: true });
  });

  it("fps fracionário (NTSC) e sem áudio", () => {
    const sonda = interpretarFfprobe({ streams: [{ ...real.streams[0], avg_frame_rate: "30000/1001" }], format: real.format });
    expect(sonda.fps).toBe(29.97);
    expect(sonda.temAudio).toBe(false);
  });

  it("celular em pé (rotação 90) troca largura e altura", () => {
    const girado = { ...real, streams: [{ ...real.streams[0], width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }] };
    expect(interpretarFfprobe(girado)).toMatchObject({ largura: 1080, altura: 1920 });
  });

  it("ignora capa embutida e recusa arquivo sem vídeo", () => {
    const soCapa = { streams: [{ ...real.streams[0], disposition: { attached_pic: 1 } }, real.streams[1]], format: real.format };
    expect(() => interpretarFfprobe(soCapa)).toThrow("sem faixa de vídeo");
  });

  it("recusa duração ou fps ilegíveis", () => {
    expect(() => interpretarFfprobe({ streams: real.streams, format: { duration: "N/A" } })).toThrow("Duração");
    expect(() => interpretarFfprobe({ streams: [{ ...real.streams[0], avg_frame_rate: "0/0", r_frame_rate: "0/0" }], format: real.format })).toThrow("quadros");
  });
});

describe("interpretarBenchmark", () => {
  it("soma utime + stime e lê o tempo de parede", () => {
    expect(interpretarBenchmark("...\nbench: utime=12.500s stime=0.500s rtime=4.000s\nbench: maxrss=1kB")).toEqual({ cpuSeg: 13, paredeSeg: 4 });
    expect(interpretarBenchmark("sem bench")).toBeNull();
  });
});
