/**
 * Worker de transcodificação — PROCESSO SEPARADO do site (container próprio em produção, com
 * limite de CPU). Consome a fila `video-transcodificar` com concorrência 1.
 *
 *   npm run worker:video        (= tsx --conditions=react-server scripts/worker-video.ts)
 *
 * Precisa de DATABASE_URL, S3_*, REDIS_URL, VIDEO_CHAVE_MESTRA (docs/back.md) e ffmpeg/ffprobe
 * no PATH. Cada job: baixa o original, gera HLS AES-128, sobe no bucket hls e marca PRONTO
 * (src/lib/video/worker.ts). Falha: tentativa registrada; na última, FALHOU + cópia na DLQ.
 */
import { type Job, Queue, Worker } from "bullmq";
import { lerChaveMestra } from "../src/lib/video/chaves";
import {
  CONCORRENCIA_WORKER,
  conexaoRedis,
  DURACAO_TRAVA_MS,
  ehFalhaDefinitiva,
  esquemaJobVideo,
  type JobVideo,
  NOME_FILA_VIDEO,
  NOME_FILA_VIDEO_DLQ,
  OPCOES_JOB_VIDEO,
  prefixoFila,
} from "../src/lib/video/fila";
import { processarJob } from "../src/lib/video/worker";
import { aguardarEsquema } from "../src/lib/db/migracoes";

async function processar(job: Job<JobVideo>): Promise<string> {
  const { videoId } = esquemaJobVideo.parse(job.data);
  const tentativa = job.attemptsMade + 1;
  const tentativas = job.opts.attempts ?? OPCOES_JOB_VIDEO.attempts;
  console.log(`[video] ${videoId}: tentativa ${tentativa}/${tentativas}`);
  const inicio = Date.now();
  const r = await processarJob(videoId, tentativa, tentativas);
  console.log(`[video] ${videoId}: ${r} em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
  return r;
}

async function principal() {
  lerChaveMestra(); // falha cedo: sem a mestra nenhum vídeo é decifrado
  await aguardarEsquema("video"); // ADR-0016: deploy sem job prévio, a migração pode estar rodando
  const conexao = conexaoRedis();
  const prefix = prefixoFila();
  const dlq = new Queue(NOME_FILA_VIDEO_DLQ, { connection: conexao, prefix });
  const worker = new Worker<JobVideo>(NOME_FILA_VIDEO, processar, {
    connection: conexao,
    prefix,
    concurrency: CONCORRENCIA_WORKER,
    lockDuration: DURACAO_TRAVA_MS,
  });

  worker.on("failed", (job, erro) => {
    if (!job) return;
    console.error(`[video] ${job.data.videoId}: falhou (${job.attemptsMade}/${job.opts.attempts}): ${erro.message}`);
    // A situação FALHOU já foi gravada pelo processarJob na última tentativa; a DLQ guarda o job.
    if (ehFalhaDefinitiva(job.attemptsMade, job.opts.attempts)) {
      void dlq.add("falhou", { ...job.data, erro: erro.message, falhouEm: new Date().toISOString() });
    }
  });
  worker.on("error", (e) => console.error("[video] erro do worker:", e.message));

  const desligar = async () => {
    console.log("[video] desligando: termina o job atual e para.");
    await worker.close();
    await dlq.close();
    process.exit(0);
  };
  process.on("SIGTERM", desligar);
  process.on("SIGINT", desligar);
  console.log(`[video] worker ouvindo ${prefix}:${NOME_FILA_VIDEO} (concorrência ${CONCORRENCIA_WORKER}).`);
}

principal().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
