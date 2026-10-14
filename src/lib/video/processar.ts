/**
 * Execução do pipeline (ffprobe -> FFmpeg HLS AES-128 -> thumbnail) sobre DISCO LOCAL.
 *
 * Roda SÓ no worker (`scripts/worker-video.ts`), processo separado do site: usa
 * `child_process` e CPU pesada. Nunca importar de página, action ou route handler.
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants as osConst, setPriority, tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  type Degrau,
  degrausAplicaveis,
  interpretarBenchmark,
  interpretarFfprobe,
  montarArgumentosFfprobe,
  montarArgumentosHls,
  montarArgumentosThumbnail,
  NOME_MASTER,
  NOME_THUMB,
  type SondaVideo,
} from "./ffmpeg";
import { decifrarSegmento, ivDaPlaylist, pareceMpegTs } from "./segmento";

/** Marcador gravado no `#EXT-X-KEY` do arquivo; a reescrita troca pela rota da API. */
export const URI_CHAVE_ARQUIVO = "chave";
const LIMITE_LOG = 64 * 1024;

export class ErroProcessamento extends Error {
  constructor(
    mensagem: string,
    readonly log: string,
  ) {
    super(mensagem);
    this.name = "ErroProcessamento";
  }
}

type Execucao = { stdout: string; stderr: string };

/** Roda um binário SEM shell, com prioridade baixa e prazo. stderr guardado (cauda) para o log. */
export function executar(binario: string, args: string[], prazoMs: number): Promise<Execucao> {
  return new Promise((resolver, rejeitar) => {
    const filho = spawn(binario, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    try {
      // `nice` portátil: 19 no Linux, BELOW_NORMAL/IDLE no Windows. O site nunca disputa CPU.
      if (filho.pid) setPriority(filho.pid, osConst.priority.PRIORITY_LOW);
    } catch {
      // sem permissão para mudar prioridade: segue (limite de CPU do container ainda vale)
    }
    let stdout = "";
    let stderr = "";
    filho.stdout.on("data", (b: Buffer) => (stdout += b.toString()));
    filho.stderr.on("data", (b: Buffer) => {
      stderr = (stderr + b.toString()).slice(-LIMITE_LOG);
    });
    const prazo = setTimeout(() => filho.kill("SIGKILL"), prazoMs);
    filho.on("error", (e) => {
      clearTimeout(prazo);
      rejeitar(new ErroProcessamento(`Falha ao iniciar ${binario}: ${e.message}`, stderr));
    });
    filho.on("close", (codigo, sinal) => {
      clearTimeout(prazo);
      if (codigo === 0) return resolver({ stdout, stderr });
      const motivo = sinal ? `interrompido (${sinal}; prazo de ${Math.round(prazoMs / 1000)} s?)` : `código ${codigo}`;
      rejeitar(new ErroProcessamento(`${binario} terminou com ${motivo}.`, stderr));
    });
  });
}

export async function sondarVideo(origem: string, binario = "ffprobe"): Promise<SondaVideo> {
  const { stdout } = await executar(binario, montarArgumentosFfprobe(origem), 60_000);
  return interpretarFfprobe(JSON.parse(stdout));
}

export type EntradaProcessamento = {
  origem: string;
  destinoDir: string;
  /** 16 bytes em claro (decifrados no worker só para esta execução). */
  chave: Buffer;
  escada?: readonly Degrau[];
  threads?: number;
  /** Prazo do FFmpeg; padrão: 30 min + 4x a duração. */
  prazoMs?: number;
  binarios?: { ffmpeg?: string; ffprobe?: string };
};

export type ResultadoProcessamento = {
  duracaoSeg: number;
  sonda: SondaVideo;
  resolucoes: string[];
  /** Caminhos relativos ao `destinoDir`, com `/` (viram chaves no storage). */
  arquivos: string[];
  master: string;
  thumb: string;
  /** Tempo de CPU e de parede do FFmpeg de HLS (do `-benchmark`), quando disponível. */
  cpuSeg: number | null;
  paredeSeg: number;
  log: string;
};

async function listar(dir: string): Promise<string[]> {
  const itens = await readdir(dir, { recursive: true, withFileTypes: true });
  return itens
    .filter((i) => i.isFile())
    .map((i) => relative(dir, join(i.parentPath, i.name)).replaceAll("\\", "/"))
    .sort();
}

/** Nunca subir segmento em claro: o 1º segmento de cada degrau tem de estar cifrado e decifrável. */
async function conferirCifra(pasta: string, chave: Buffer, log: string): Promise<void> {
  const playlist = await readFile(join(pasta, "index.m3u8"), "utf8");
  const bruto = await readFile(join(pasta, "seg_00000.ts"));
  let decifrado: Buffer | null = null;
  try {
    decifrado = decifrarSegmento(bruto, chave, ivDaPlaylist(playlist));
  } catch {
    // padding inválido = não foi cifrado com esta chave
  }
  if (pareceMpegTs(bruto) || !decifrado || !pareceMpegTs(decifrado)) {
    throw new ErroProcessamento(`Segmento de ${pasta} não está cifrado com a chave do vídeo.`, log);
  }
}

/**
 * Pipeline completo. `destinoDir` deve ser pasta NOVA por tentativa (o worker sobe o
 * conteúdo dela inteiro para `hls/<videoId>/`; reprocessar = sobrescrever no storage).
 * A chave vai para uma pasta temporária SEPARADA do destino (nunca sobe junto com o HLS).
 */
export async function processarVideo(entrada: EntradaProcessamento): Promise<ResultadoProcessamento> {
  const ffmpeg = entrada.binarios?.ffmpeg ?? "ffmpeg";
  const sonda = await sondarVideo(entrada.origem, entrada.binarios?.ffprobe);
  const degraus = degrausAplicaveis(sonda, entrada.escada);
  await mkdir(entrada.destinoDir, { recursive: true });
  for (const d of degraus) await mkdir(join(entrada.destinoDir, d.nome), { recursive: true });

  const pastaChave = await mkdtemp(join(tmpdir(), "video-chave-"));
  try {
    const arquivoChave = join(pastaChave, "chave.bin");
    const arquivoKeyInfo = join(pastaChave, "chave.info");
    await writeFile(arquivoChave, entrada.chave, { mode: 0o600 });
    // Linha 1: URI gravada na playlist; linha 2: onde o FFmpeg lê a chave. Sem linha 3, o
    // FFmpeg usa o MEDIA-SEQUENCE inicial como IV (0 em VOD) e o grava no `#EXT-X-KEY`.
    // ponytail: mesmo IV em todos os segmentos do vídeo (só revela que cabeçalhos TS iguais
    // são iguais; o conteúdo segue cifrado). IV por segmento exige `periodic_rekey`.
    await writeFile(arquivoKeyInfo, `${URI_CHAVE_ARQUIVO}\n${arquivoChave}\n`, { mode: 0o600 });

    const prazoMs = entrada.prazoMs ?? 30 * 60_000 + sonda.duracaoSeg * 4_000;
    const inicio = performance.now();
    const hls = await executar(
      ffmpeg,
      montarArgumentosHls({ origem: entrada.origem, destinoDir: entrada.destinoDir, arquivoKeyInfo, sonda, escada: degraus, threads: entrada.threads }),
      prazoMs,
    );
    const paredeSeg = (performance.now() - inicio) / 1000;
    for (const d of degraus) await conferirCifra(join(entrada.destinoDir, d.nome), entrada.chave, hls.stderr);

    const thumb = join(entrada.destinoDir, NOME_THUMB);
    await executar(ffmpeg, montarArgumentosThumbnail(entrada.origem, thumb, sonda), 120_000);

    return {
      duracaoSeg: sonda.duracaoSeg,
      sonda,
      resolucoes: degraus.map((d) => d.nome),
      arquivos: await listar(entrada.destinoDir),
      master: NOME_MASTER,
      thumb: NOME_THUMB,
      cpuSeg: interpretarBenchmark(hls.stderr)?.cpuSeg ?? null,
      paredeSeg,
      log: hls.stderr,
    };
  } finally {
    // Arquivo temporário do disco do worker (não é dado do banco): a chave em claro não fica.
    await rm(pastaChave, { recursive: true, force: true });
  }
}
