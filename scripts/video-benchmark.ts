/**
 * Benchmark do pipeline de vídeo sobre vídeos gerados por `scripts/video-gerar-teste.ts`.
 * Mede tempo, CPU e tamanho por degrau, e CONFERE a saída (master legível, segmentos cifrados,
 * segmento decifrado = MPEG-TS). Tudo fora do repositório.
 *
 *   npx tsx scripts/video-benchmark.ts <pasta-dos-videos> [rotulo] [video.mp4 ...]
 *
 * Simular VPS de 4 vCPU no Windows (o FFmpeg herda a afinidade do processo):
 *   cmd /c "start /affinity F /wait /b node --import tsx scripts/video-benchmark.ts <pasta> 4vcpu 10min-1080p.mp4"
 * Escada com 1080p: BENCH_COM_1080P=1 npx tsx scripts/video-benchmark.ts <pasta> com-1080p
 */
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { availableParallelism, cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { gerarChaveVideo } from "../src/lib/video/chaves";
import { ESCADA_PADRAO } from "../src/lib/video/ffmpeg";
import { executar, processarVideo, URI_CHAVE_ARQUIVO } from "../src/lib/video/processar";
import { decifrarSegmento, ivDaPlaylist, pareceMpegTs } from "../src/lib/video/segmento";

const PADRAO = ["1min-720p.mp4", "1min-1080p.mp4", "10min-1080p.mp4"];
// BENCH_COM_1080P=1 mede a escada completa (1080p 5000k + padrão), para decidir quando ligar o 1080p.
const ESCADA = process.env.BENCH_COM_1080P ? [{ nome: "1080p", altura: 1080, bitrateVideoK: 5000 }, ...ESCADA_PADRAO] : undefined;

function cpuOcupada(): { ocupado: number; total: number } {
  let ocupado = 0;
  let total = 0;
  for (const c of cpus()) {
    const t = c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle;
    total += t;
    ocupado += t - c.times.idle;
  }
  return { ocupado, total };
}

async function bytesDaPasta(dir: string): Promise<number> {
  let soma = 0;
  for (const nome of await readdir(dir)) soma += (await stat(join(dir, nome))).size;
  return soma;
}

/** Confere a saída. Devolve as observações (lança se algo essencial falhar). */
async function conferir(destino: string, chave: Buffer, resolucoes: string[]): Promise<string[]> {
  const notas: string[] = [];
  // Sem a chave: o segmento não é MPEG-TS e o ffprobe não abre.
  const seg = join(destino, resolucoes[0], "seg_00003.ts");
  const bruto = await readFile(seg);
  if (pareceMpegTs(bruto)) throw new Error("Segmento em claro!");
  const semChave = await executar("ffprobe", ["-v", "error", "-show_streams", seg], 30_000).then(() => "abriu", () => "não abre");
  notas.push(`ffprobe no .ts cifrado: ${semChave}`);
  if (semChave === "abriu") throw new Error("ffprobe abriu segmento cifrado sem a chave.");

  // Com a chave (IV da playlist): volta a ser MPEG-TS e o ffprobe lê.
  const playlist = await readFile(join(destino, resolucoes[0], "index.m3u8"), "utf8");
  const claro = decifrarSegmento(bruto, chave, ivDaPlaylist(playlist));
  if (!pareceMpegTs(claro)) throw new Error("Segmento decifrado não é MPEG-TS.");
  const tmp = await mkdtemp(join(tmpdir(), "video-conf-"));
  try {
    await writeFile(join(tmp, "seg.ts"), claro);
    const { stdout } = await executar("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", join(tmp, "seg.ts")], 30_000);
    notas.push(`segmento decifrado: MPEG-TS com ${[...new Set(stdout.split(/\r?\n/).filter(Boolean))].join("+")}`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  // Master inteiro pelo demuxer HLS do próprio FFmpeg: põe a chave onde o `URI="chave"` aponta.
  for (const r of resolucoes) await writeFile(join(destino, r, URI_CHAVE_ARQUIVO), chave);
  try {
    const { stdout } = await executar(
      "ffprobe",
      ["-v", "error", "-allowed_extensions", "ALL", "-show_entries", "stream=codec_name,width,height:format=duration", "-of", "json", join(destino, "master.m3u8")],
      120_000,
    );
    const j = JSON.parse(stdout) as { streams: { codec_name: string; width?: number; height?: number }[]; format: { duration: string } };
    notas.push(`ffprobe master: ${j.streams.map((s) => (s.width ? `${s.codec_name} ${s.width}x${s.height}` : s.codec_name)).join(", ")}; ${Number(j.format.duration).toFixed(1)} s`);
  } finally {
    for (const r of resolucoes) await rm(join(destino, r, URI_CHAVE_ARQUIVO), { force: true });
  }
  return notas;
}

async function medir(origem: string) {
  const destino = await mkdtemp(join(tmpdir(), "video-bench-"));
  const chave = gerarChaveVideo();
  const cpu0 = cpuOcupada();
  const t0 = performance.now();
  const r = await processarVideo({ origem, destinoDir: destino, chave, escada: ESCADA });
  const paredeTotal = (performance.now() - t0) / 1000;
  const cpu1 = cpuOcupada();
  try {
    const porDegrau = Object.fromEntries(
      await Promise.all(r.resolucoes.map(async (d) => [d, await bytesDaPasta(join(destino, d))] as const)),
    );
    const notas = await conferir(destino, chave, r.resolucoes);
    return {
      video: origem.split(/[\\/]/).pop(),
      duracaoSeg: r.duracaoSeg,
      origem: `${r.sonda.largura}x${r.sonda.altura} ${r.sonda.fps}fps ${r.sonda.codecVideo}${r.sonda.temAudio ? "+audio" : ""}`,
      resolucoes: r.resolucoes,
      paredeTotalSeg: +paredeTotal.toFixed(1),
      paredeHlsSeg: +r.paredeSeg.toFixed(1),
      cpuHlsSeg: r.cpuSeg,
      razaoParede: +(paredeTotal / r.duracaoSeg).toFixed(3),
      razaoCpu: r.cpuSeg ? +(r.cpuSeg / r.duracaoSeg).toFixed(3) : null,
      nucleosOcupados: r.cpuSeg ? +(r.cpuSeg / r.paredeSeg).toFixed(1) : null,
      cpuMediaMaquinaPct: +((100 * (cpu1.ocupado - cpu0.ocupado)) / (cpu1.total - cpu0.total)).toFixed(1),
      gbPorHora: Object.fromEntries(Object.entries(porDegrau).map(([d, b]) => [d, +((b / r.duracaoSeg) * 3600 / 1e9).toFixed(3)])),
      arquivos: r.arquivos.length,
      notas,
    };
  } finally {
    await rm(destino, { recursive: true, force: true });
  }
}

async function principal() {
  const [pasta, rotulo = "padrao", ...lista] = process.argv.slice(2);
  if (!pasta) throw new Error("Uso: npx tsx scripts/video-benchmark.ts <pasta-dos-videos> [rotulo] [video.mp4 ...]");
  const maquina = { cpu: cpus()[0]?.model.trim(), nucleosLogicos: cpus().length, paralelismo: availableParallelism(), rotulo, node: process.version };
  console.log(JSON.stringify({ maquina }));
  for (const nome of lista.length ? lista : PADRAO) {
    console.log(JSON.stringify(await medir(join(pasta, nome))));
  }
}

principal().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
