/**
 * Fila FIFO de geração do PDF do certificado (BullMQ + Redis), no MESMO padrão da fila de vídeo
 * (src/lib/video/fila.ts): mesma conexão e prefixo (`VIDEO_FILA_PREFIXO`, padrão "li" -> chaves
 * `li:certificados:*`), payload só com o id da VERSÃO (`jobId` = versaoId: enfileirar de novo não
 * duplica), 3 tentativas com backoff e DLQ. O app só enfileira DEPOIS do commit; quem consome é o
 * worker (`npm run worker:certificados`, processo separado).
 */
import { type ConnectionOptions, type JobsOptions, Queue } from "bullmq";
import { z } from "zod";
import { conexaoRedis, prefixoFila } from "@/lib/video/fila";

export const NOME_FILA_CERTIFICADOS = "certificados";
export const NOME_FILA_CERTIFICADOS_DLQ = "certificados-dlq";
/** PDF leve (~50 ms): alguns em paralelo não pesam. */
export const CONCORRENCIA_WORKER_CERTIFICADOS = 2;

export const esquemaJobCertificado = z.strictObject({ versaoId: z.uuid() });
export type JobCertificado = z.infer<typeof esquemaJobCertificado>;

export const OPCOES_JOB_CERTIFICADO = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: true,
  // Falha de vez: cópia na DLQ e FALHOU no banco; "gerar nova versão" cria outra versão (outro jobId).
  removeOnFail: true,
} satisfies JobsOptions;

export const opcoesDoJobCertificado = (versaoId: string): JobsOptions => ({ ...OPCOES_JOB_CERTIFICADO, jobId: versaoId });

export function criarFilaCertificados(conexao: ConnectionOptions = conexaoRedis()): Queue<JobCertificado> {
  return new Queue<JobCertificado>(NOME_FILA_CERTIFICADOS, { connection: conexao, prefix: prefixoFila() });
}

const global = globalThis as unknown as { __filaCertificados?: Queue<JobCertificado> };

/** Fila do processo do APP (só enfileira). O worker cria a dele. */
export function filaCertificados(): Queue<JobCertificado> {
  global.__filaCertificados ??= criarFilaCertificados({ ...(conexaoRedis() as object), maxRetriesPerRequest: 1, connectTimeout: 3000 });
  return global.__filaCertificados;
}

export async function enfileirarCertificado(fila: Queue<JobCertificado>, dados: unknown): Promise<void> {
  const job = esquemaJobCertificado.parse(dados);
  await fila.add("gerar-pdf", job, opcoesDoJobCertificado(job.versaoId));
}

const PRAZO_ENFILEIRAR_MS = 5000;

/**
 * Enfileira com prazo: fila fora do ar devolve `false` e a versão fica PENDENTE (o worker,
 * ao subir, reenfileira as pendentes). Nunca segura a resposta de quem chamou.
 */
export async function enfileirarCertificadoComPrazo(versaoId: string): Promise<boolean> {
  try {
    await Promise.race([
      enfileirarCertificado(filaCertificados(), { versaoId }),
      new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("fila não respondeu")), PRAZO_ENFILEIRAR_MS)),
    ]);
    return true;
  } catch (e) {
    console.error("CRITICAL [certificados] não enfileirou:", versaoId, e);
    return false;
  }
}
