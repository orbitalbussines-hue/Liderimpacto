/**
 * Fila `webhooks` (ADR-0018 item 5), no padrão das filas `eventos` e `conhecimento`: mesma conexão e
 * prefixo (`li:webhooks:*`), DLQ `webhooks-dlq`, consumida por um 4º Worker de
 * `npm run worker:certificados`. Um job por ENTREGA (`jobId` = id da entrega: enfileirar de novo não
 * duplica). Retentativa exponencial (30 s dobrando, 8 tentativas ≈ 1 h). O app só enfileira DEPOIS
 * do commit; fila fora do ar = a entrega fica PENDENTE e o worker reenfileira ao subir.
 */
import { type ConnectionOptions, type JobsOptions, Queue } from "bullmq";
import { z } from "zod";
import { conexaoRedis, prefixoFila } from "@/lib/video/fila";
import { ATRASO_BASE_WEBHOOK_MS, TENTATIVAS_WEBHOOK } from "./regras";

export const NOME_FILA_WEBHOOKS = "webhooks";
export const NOME_FILA_WEBHOOKS_DLQ = "webhooks-dlq";
/** Cada job espera no máximo o timeout HTTP (5 s): alguns em paralelo não pesam. */
export const CONCORRENCIA_WORKER_WEBHOOKS = 5;

export const esquemaJobWebhook = z.strictObject({ entregaId: z.uuid() });
export type JobWebhook = z.infer<typeof esquemaJobWebhook>;

export const OPCOES_JOB_WEBHOOK = {
  attempts: TENTATIVAS_WEBHOOK,
  backoff: { type: "exponential", delay: ATRASO_BASE_WEBHOOK_MS },
  removeOnComplete: true,
  removeOnFail: true,
} satisfies JobsOptions;

export function criarFilaWebhooks(conexao: ConnectionOptions = conexaoRedis()): Queue<JobWebhook> {
  return new Queue<JobWebhook>(NOME_FILA_WEBHOOKS, { connection: conexao, prefix: prefixoFila() });
}

const global = globalThis as unknown as { __filaWebhooks?: Queue<JobWebhook> };

/** Fila do processo do APP (só enfileira). O worker cria a dele. */
export function filaWebhooks(): Queue<JobWebhook> {
  global.__filaWebhooks ??= criarFilaWebhooks({ ...(conexaoRedis() as object), maxRetriesPerRequest: 1, connectTimeout: 3000 });
  return global.__filaWebhooks;
}

export async function enfileirarEntrega(fila: Queue<JobWebhook>, dados: unknown): Promise<void> {
  const job = esquemaJobWebhook.parse(dados);
  await fila.add("entregar", job, { ...OPCOES_JOB_WEBHOOK, jobId: job.entregaId });
}

const PRAZO_ENFILEIRAR_MS = 3000;

/** Enfileira com prazo; nunca lança (a entrega PENDENTE é reenfileirada quando o worker sobe). */
export async function enfileirarEntregasComPrazo(entregaIds: readonly string[], fila: Queue<JobWebhook> = filaWebhooks()): Promise<boolean> {
  try {
    await Promise.race([
      Promise.all(entregaIds.map((entregaId) => enfileirarEntrega(fila, { entregaId }))),
      new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("fila não respondeu")), PRAZO_ENFILEIRAR_MS)),
    ]);
    return true;
  } catch (e) {
    console.error("CRITICAL [webhooks] entregas não enfileiradas (o worker reenfileira ao subir):", entregaIds.length, e instanceof Error ? e.message : e);
    return false;
  }
}
