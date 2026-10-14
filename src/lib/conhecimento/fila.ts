/**
 * Fila `conhecimento` da REINDEXAÇÃO (ADR-0014 item 2), no padrão das filas `certificados` e
 * `eventos`: mesma conexão e prefixo (`li:conhecimento:*`), 3 tentativas com backoff e DLQ
 * `conhecimento-dlq`; consumida por um 3º Worker de `npm run worker:certificados` (jobs leves).
 * Sem `jobId` fixo: o job relê o estado ATUAL da fonte e é idempotente (assinatura), então dois jobs
 * da mesma aula só gastam uma leitura a mais. O app enfileira DEPOIS do commit; fila fora do ar =
 * indexa na hora no próprio processo (custa milissegundos: um `.vtt` de KB e alguns INSERTs).
 */
import { type ConnectionOptions, type JobsOptions, Queue } from "bullmq";
import { z } from "zod";
import { conexaoRedis, prefixoFila } from "@/lib/video/fila";

export const NOME_FILA_CONHECIMENTO = "conhecimento";
export const NOME_FILA_CONHECIMENTO_DLQ = "conhecimento-dlq";
export const CONCORRENCIA_WORKER_CONHECIMENTO = 2;

export const esquemaJobConhecimento = z.strictObject({
  criadorId: z.uuid(),
  autorId: z.uuid(),
  alvo: z.discriminatedUnion("tipo", [
    z.strictObject({ tipo: z.literal("AULA"), aulaId: z.uuid() }),
    z.strictObject({ tipo: z.literal("PRODUTO"), produtoId: z.uuid() }),
    z.strictObject({ tipo: z.literal("TEXTO"), documentoId: z.uuid() }),
  ]),
});
export type JobConhecimento = z.infer<typeof esquemaJobConhecimento>;

export const OPCOES_JOB_CONHECIMENTO = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: true,
  removeOnFail: true,
} satisfies JobsOptions;

export function criarFilaConhecimento(conexao: ConnectionOptions = conexaoRedis()): Queue<JobConhecimento> {
  return new Queue<JobConhecimento>(NOME_FILA_CONHECIMENTO, { connection: conexao, prefix: prefixoFila() });
}

const global = globalThis as unknown as { __filaConhecimento?: Queue<JobConhecimento> };

/** Fila do processo do APP (só enfileira). O worker cria a dele. */
export function filaConhecimento(): Queue<JobConhecimento> {
  global.__filaConhecimento ??= criarFilaConhecimento({ ...(conexaoRedis() as object), maxRetriesPerRequest: 1, connectTimeout: 3000 });
  return global.__filaConhecimento;
}

export async function enfileirarReindexacao(fila: Queue<JobConhecimento>, dados: unknown): Promise<void> {
  const job = esquemaJobConhecimento.parse(dados);
  await fila.add("reindexar", job, OPCOES_JOB_CONHECIMENTO);
}
