/**
 * Fila FIFO de transcodificação (BullMQ + Redis). O app só ENFILEIRA (depois do commit da
 * transação); quem consome é o worker (`scripts/worker-video.ts`), processo separado.
 *
 * Payload mínimo: só o `videoId`. O worker lê o resto (origem, chave cifrada) do banco —
 * nada de segredo no Redis, e reenfileirar o mesmo vídeo não cria job duplicado (jobId = videoId).
 */
import { type ConnectionOptions, type JobsOptions, Queue } from "bullmq";
import { z } from "zod";

export const NOME_FILA_VIDEO = "video-transcodificar";
/** Dead letter: jobs que esgotaram as tentativas, para o admin ver e reprocessar. */
export const NOME_FILA_VIDEO_DLQ = "video-transcodificar-dlq";
/** Um vídeo por vez por worker (a VPS também serve o site). Suba para 2 só com CPU sobrando. */
export const CONCORRENCIA_WORKER = 1;
/** Trava do job no Redis; o BullMQ renova sozinho enquanto o FFmpeg roda (spawn não trava o loop). */
export const DURACAO_TRAVA_MS = 120_000;

export const esquemaJobVideo = z.strictObject({ videoId: z.uuid() });
export type JobVideo = z.infer<typeof esquemaJobVideo>;

export const OPCOES_JOB_VIDEO = {
  attempts: 3,
  // 1 min, 2 min, 4 min: dá tempo de o storage/disco voltar.
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: true,
  // Removido ao falhar de vez: a cópia fica na DLQ e o status FALHOU no banco. Assim o
  // reprocessamento pode reusar o jobId = videoId.
  removeOnFail: true,
} satisfies JobsOptions;

export function opcoesDoJob(videoId: string): JobsOptions {
  return { ...OPCOES_JOB_VIDEO, jobId: videoId };
}

/** Última tentativa falhou? (no evento `failed` do worker → manda para a DLQ). */
export function ehFalhaDefinitiva(tentativasFeitas: number, tentativas: number | undefined): boolean {
  return tentativasFeitas >= (tentativas ?? 1);
}

/** Conexão a partir de `REDIS_URL` (ex.: `redis://localhost:6382`). */
export function conexaoRedis(env: Record<string, string | undefined> = process.env): ConnectionOptions {
  const url = env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL ausente.");
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password ? decodeURIComponent(u.password) : undefined,
    // Exigência do BullMQ para WORKERS (comando bloqueante não desiste sozinho). O app, que só
    // enfileira, usa 1: Redis fora do ar vira erro rápido em vez de requisição pendurada.
    maxRetriesPerRequest: null,
  };
}

/**
 * Prefixo das chaves no Redis (`VIDEO_FILA_PREFIXO`, padrão "li"). O teste de integração usa
 * outro: um worker de dev ligado no mesmo Redis nunca pega o job do teste (nem o contrário).
 */
export const prefixoFila = (env: Record<string, string | undefined> = process.env) => env.VIDEO_FILA_PREFIXO || "li";

export function criarFilaVideo(conexao: ConnectionOptions = conexaoRedis()): Queue<JobVideo> {
  return new Queue<JobVideo>(NOME_FILA_VIDEO, { connection: conexao, prefix: prefixoFila() });
}

// Uma conexão por processo do app (no dev o HMR recarrega o módulo: guarda no globalThis).
const global = globalThis as unknown as { __filaVideo?: Queue<JobVideo> };

/** Fila do processo do APP (só enfileira). O worker cria a dele. */
export function filaVideo(): Queue<JobVideo> {
  global.__filaVideo ??= criarFilaVideo({ ...(conexaoRedis() as object), maxRetriesPerRequest: 1, connectTimeout: 3000 });
  return global.__filaVideo;
}

const PRAZO_ENFILEIRAR_MS = 5000;

/**
 * Enfileira pelo app com prazo: fila fora do ar devolve `false` (o vídeo fica PROCESSANDO e o
 * admin usa "Reprocessar"), nunca segura a resposta da action.
 */
export async function enfileirarComPrazo(videoId: string): Promise<boolean> {
  try {
    await Promise.race([
      enfileirarVideo(filaVideo(), { videoId }),
      new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("fila não respondeu")), PRAZO_ENFILEIRAR_MS)),
    ]);
    return true;
  } catch (e) {
    console.error("CRITICAL [video] não enfileirou:", videoId, e);
    return false;
  }
}

/** Enfileira (idempotente por vídeo). Chamar SÓ depois do commit que gravou o vídeo. */
export async function enfileirarVideo(fila: Queue<JobVideo>, dados: unknown): Promise<void> {
  const job = esquemaJobVideo.parse(dados);
  await fila.add("transcodificar", job, opcoesDoJob(job.videoId));
}
