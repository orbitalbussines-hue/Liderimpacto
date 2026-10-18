/**
 * Fila `integracoes` (ADR-0021 item 4), no padrão da fila `pagamentos`: mesma conexão e prefixo
 * (`li:integracoes:*`), DLQ `integracoes-dlq`, consumida por um 8º Worker de `npm run worker:certificados`.
 * Um job por EVENTO processado (`jobId` = id da linha em `criadores_integracoes_eventos`). O job leva só o
 * id — o comprador fica no banco, nunca no Redis. Fila fora do ar = a linha fica PENDENTE e o worker
 * reenfileira ao subir.
 */
import { type ConnectionOptions, type JobsOptions, Queue } from "bullmq";
import { z } from "zod";
import { conexaoRedis, prefixoFila } from "@/lib/video/fila";

export const NOME_FILA_INTEGRACOES = "integracoes";
export const NOME_FILA_INTEGRACOES_DLQ = "integracoes-dlq";
// ponytail: um evento por vez (reembolso e aprovação da mesma compra não correm juntos); por criador se o volume crescer.
export const CONCORRENCIA_WORKER_INTEGRACOES = 1;

export const esquemaJobIntegracao = z.strictObject({ eventoId: z.uuid() });
export type JobIntegracao = z.infer<typeof esquemaJobIntegracao>;

export const OPCOES_JOB_INTEGRACAO = {
  // 6 tentativas, 15 s dobrando (≈ 15 min): banco ou Redis piscando. Depois disso o evento fica ERRO e o dono reprocessa.
  attempts: 6,
  backoff: { type: "exponential", delay: 15_000 },
  removeOnComplete: true,
  removeOnFail: true,
} satisfies JobsOptions;

export function criarFilaIntegracoes(conexao: ConnectionOptions = conexaoRedis()): Queue<JobIntegracao> {
  return new Queue<JobIntegracao>(NOME_FILA_INTEGRACOES, { connection: conexao, prefix: prefixoFila() });
}

const global = globalThis as unknown as { __filaIntegracoes?: Queue<JobIntegracao> };

/** Fila do processo do APP (só enfileira). O worker cria a dele. */
export function filaIntegracoes(): Queue<JobIntegracao> {
  global.__filaIntegracoes ??= criarFilaIntegracoes({ ...(conexaoRedis() as object), maxRetriesPerRequest: 1, connectTimeout: 3000 });
  return global.__filaIntegracoes;
}

export async function enfileirarEventoIntegracao(fila: Queue<JobIntegracao>, dados: unknown): Promise<void> {
  const job = esquemaJobIntegracao.parse(dados);
  // jobId = id do evento: enfileirar de novo enquanto o job existe não duplica (reentrega da plataforma).
  await fila.add("evento", job, { ...OPCOES_JOB_INTEGRACAO, jobId: job.eventoId });
}

const PRAZO_ENFILEIRAR_MS = 3000;

/** Enfileira com prazo; devolve false se não conseguiu (a linha PENDENTE espera o worker subir). */
export async function enfileirarComPrazo(eventoIds: readonly string[], fila: Queue<JobIntegracao> = filaIntegracoes()): Promise<boolean> {
  try {
    await Promise.race([
      Promise.all(eventoIds.map((eventoId) => enfileirarEventoIntegracao(fila, { eventoId }))),
      new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("fila não respondeu")), PRAZO_ENFILEIRAR_MS)),
    ]);
    return true;
  } catch (e) {
    console.error("CRITICAL [integracoes] eventos não enfileirados (o worker reenfileira ao subir):", eventoIds.length, e instanceof Error ? e.message : e);
    return false;
  }
}
