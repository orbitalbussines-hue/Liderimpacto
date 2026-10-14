/**
 * Montagem PURA dos comandos do FFmpeg/ffprobe (docs/ARQUITETURA_VPS.md §3).
 *
 * Tudo aqui devolve ARRAY de argumentos para `spawn(..., { shell: false })` — nunca string
 * de shell: nome de arquivo do admin nunca vira comando. Sem I/O: quem executa é
 * `processar.ts`, no worker (processo separado, nunca dentro do Next).
 */
import { z } from "zod";

export type Degrau = {
  /** Nome da variante na saída (`<destino>/<nome>/index.m3u8`). */
  nome: string;
  /** Altura alvo; em vídeo vertical vale para a largura (o lado menor). */
  altura: number;
  bitrateVideoK: number;
};

/** Escada inicial: 720p + 480p (CPU de VPS pequena). 1080p entra quando houver demanda. */
export const ESCADA_PADRAO: readonly Degrau[] = [
  { nome: "720p", altura: 720, bitrateVideoK: 2800 },
  { nome: "480p", altura: 480, bitrateVideoK: 1400 },
];

export const SEGMENTO_SEG = 6;
export const GOP_SEG = 2;
export const AUDIO_BITRATE_K = 128;
export const NOME_MASTER = "master.m3u8";
export const NOME_THUMB = "thumb.jpg";

/** O que o pipeline precisa saber do original (vem do ffprobe). */
export type SondaVideo = {
  duracaoSeg: number;
  largura: number;
  altura: number;
  fps: number;
  codecVideo: string;
  temAudio: boolean;
};

export type OpcoesHls = {
  origem: string;
  /** Pasta de saída; cada degrau vira `<destinoDir>/<nome>/`. */
  destinoDir: string;
  /** Arquivo key info do FFmpeg (URI, caminho da chave, IV opcional). FORA do destino. */
  arquivoKeyInfo: string;
  sonda: SondaVideo;
  escada?: readonly Degrau[];
  /** Limite de threads do x264 (0 = automático). Útil para simular VPS pequena. */
  threads?: number;
};

/**
 * Degraus que cabem no original — NUNCA faz upscale: degrau maior que o lado menor do vídeo
 * é pulado. Se nenhum cabe (original abaixo de 480p), sai um degrau único na resolução
 * original com o bitrate do menor degrau.
 */
export function degrausAplicaveis(sonda: SondaVideo, escada: readonly Degrau[] = ESCADA_PADRAO): Degrau[] {
  if (escada.length === 0) throw new Error("Escada de resoluções vazia.");
  const ladoMenor = Math.min(sonda.largura, sonda.altura);
  const cabem = escada.filter((d) => d.altura <= ladoMenor);
  if (cabem.length > 0) return cabem;
  const menor = [...escada].sort((a, b) => a.altura - b.altura)[0];
  const alturaPar = ladoMenor - (ladoMenor % 2);
  return [{ nome: `${alturaPar}p`, altura: alturaPar, bitrateVideoK: menor.bitrateVideoK }];
}

/** GOP em quadros = 2 s × fps (arredondado), para todo segmento começar em keyframe. */
export function gopEmQuadros(fps: number): number {
  return Math.max(1, Math.round(fps * GOP_SEG));
}

function filtroEscala(sonda: SondaVideo, d: Degrau): string {
  // Vertical (celular): o degrau limita a largura, que é o lado menor.
  return sonda.altura >= sonda.largura ? `scale=${d.altura}:-2` : `scale=-2:${d.altura}`;
}

/** Argumentos do FFmpeg para HLS AES-128 adaptativo (uma playlist por degrau + master). */
export function montarArgumentosHls(opcoes: OpcoesHls): string[] {
  const { sonda, destinoDir } = opcoes;
  const degraus = degrausAplicaveis(sonda, opcoes.escada);
  const n = degraus.length;
  const gop = gopEmQuadros(sonda.fps);

  const rotulos = degraus.map((_, i) => `[s${i}]`).join("");
  const escalas = degraus.map((d, i) => `[s${i}]${filtroEscala(sonda, d)},format=yuv420p[v${i}]`).join(";");
  const filtro = `[0:v]split=${n}${rotulos};${escalas}`;

  const args = ["-hide_banner", "-nostdin", "-y", "-benchmark", "-i", opcoes.origem, "-filter_complex", filtro];
  degraus.forEach((_, i) => {
    args.push("-map", `[v${i}]`);
    if (sonda.temAudio) args.push("-map", "0:a:0");
  });

  args.push(
    "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high",
    "-g", String(gop), "-keyint_min", String(gop), "-sc_threshold", "0",
    // Celular grava em fps variável: o -g sozinho não garante keyframe a cada 2 s.
    "-force_key_frames", `expr:gte(t,n_forced*${GOP_SEG})`,
  );
  if (opcoes.threads) args.push("-threads", String(opcoes.threads));
  degraus.forEach((d, i) => {
    args.push(
      `-b:v:${i}`, `${d.bitrateVideoK}k`,
      `-maxrate:v:${i}`, `${Math.round(d.bitrateVideoK * 1.07)}k`,
      `-bufsize:v:${i}`, `${Math.round(d.bitrateVideoK * 1.5)}k`,
    );
  });
  if (sonda.temAudio) args.push("-c:a", "aac", "-b:a", `${AUDIO_BITRATE_K}k`, "-ac", "2");

  const mapa = degraus.map((d, i) => (sonda.temAudio ? `v:${i},a:${i},name:${d.nome}` : `v:${i},name:${d.nome}`)).join(" ");
  args.push(
    "-var_stream_map", mapa,
    "-f", "hls",
    "-hls_time", String(SEGMENTO_SEG),
    "-hls_playlist_type", "vod",
    "-hls_flags", "independent_segments",
    "-hls_key_info_file", opcoes.arquivoKeyInfo,
    "-master_pl_name", NOME_MASTER,
    "-hls_segment_filename", `${destinoDir}/%v/seg_%05d.ts`,
    `${destinoDir}/%v/index.m3u8`,
  );
  return args;
}

/** Thumbnail: 1 quadro em ~10% da duração, no máximo 720 de altura (sem upscale). */
export function montarArgumentosThumbnail(origem: string, destino: string, sonda: SondaVideo): string[] {
  const instante = (sonda.duracaoSeg * 0.1).toFixed(3);
  const altura = Math.min(720, sonda.altura >= sonda.largura ? sonda.largura : sonda.altura);
  const escala = sonda.altura >= sonda.largura ? `scale=${altura}:-2` : `scale=-2:${altura}`;
  return ["-hide_banner", "-nostdin", "-y", "-ss", instante, "-i", origem, "-frames:v", "1", "-vf", escala, "-q:v", "3", destino];
}

export function montarArgumentosFfprobe(origem: string): string[] {
  return ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", origem];
}

// --- parse do ffprobe (saída de processo externo = fronteira: valida com Zod) ---

const esquemaStream = z.object({
  codec_type: z.string().optional(),
  codec_name: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  avg_frame_rate: z.string().optional(),
  r_frame_rate: z.string().optional(),
  duration: z.string().optional(),
  disposition: z.object({ attached_pic: z.number().optional() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  side_data_list: z.array(z.object({ rotation: z.number().optional() })).optional(),
});

const esquemaFfprobe = z.object({
  streams: z.array(esquemaStream).default([]),
  format: z.object({ duration: z.string().optional() }).optional(),
});

function fracao(texto: string | undefined): number {
  if (!texto) return 0;
  const [num, den] = texto.split("/").map(Number);
  const valor = den ? num / den : num;
  return Number.isFinite(valor) ? valor : 0;
}

/** Interpreta o JSON de `ffprobe -show_format -show_streams`. Lança se não houver vídeo utilizável. */
export function interpretarFfprobe(json: unknown): SondaVideo {
  const dados = esquemaFfprobe.parse(json);
  // Capa embutida (mp3/m4a com imagem) aparece como stream de vídeo: ignorar.
  const video = dados.streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  if (!video || !video.width || !video.height) throw new Error("Arquivo sem faixa de vídeo.");

  const duracaoSeg = Number(dados.format?.duration ?? video.duration ?? NaN);
  if (!Number.isFinite(duracaoSeg) || duracaoSeg <= 0) throw new Error("Duração do vídeo ilegível.");

  const fps = fracao(video.avg_frame_rate) || fracao(video.r_frame_rate);
  if (fps <= 0 || fps > 240) throw new Error("Taxa de quadros ilegível.");

  // Vídeo de celular gravado em pé chega como 1920x1080 + rotação 90; o FFmpeg gira sozinho.
  const rotacao = video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? Number(video.tags?.rotate ?? 0);
  const deitado = Math.abs(rotacao) % 180 === 90;

  return {
    duracaoSeg,
    largura: deitado ? video.height : video.width,
    altura: deitado ? video.width : video.height,
    fps: Math.round(fps * 1000) / 1000,
    codecVideo: video.codec_name ?? "desconhecido",
    temAudio: dados.streams.some((s) => s.codec_type === "audio"),
  };
}

/** Tempo de CPU do FFmpeg (`-benchmark`: "bench: utime=12.3s stime=0.4s rtime=5.1s"). */
export function interpretarBenchmark(stderr: string): { cpuSeg: number; paredeSeg: number } | null {
  const m = /bench:\s+utime=([\d.]+)s\s+stime=([\d.]+)s\s+rtime=([\d.]+)s/.exec(stderr);
  if (!m) return null;
  return { cpuSeg: Number(m[1]) + Number(m[2]), paredeSeg: Number(m[3]) };
}
