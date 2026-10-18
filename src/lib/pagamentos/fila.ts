/**
 * Fila `pagamentos` (ADR-0019 item 5), no padrão da fila `webhooks`: mesma conexão e prefixo
 * (`li:pagamentos:*`), DLQ `pagamentos-dlq`, consumida por um 5º Worker de `npm run worker:certificados`.
 * Um job por EVENTO do Stripe (`jobId` = id do evento: entrega repetida enquanto o job existe não
 * duplica; depois, reprocessar é idempotente). O job leva só ids — nada de dado do comprador no Redis.
 */
import { type ConnectionOptions, type JobsOptions, Queue } from "bullmq";
import { z } from "zod";
import { conexaoRedis, prefixoFila } from "@/lib/video/fila";

export const NOME_FILA_PAGAMENTOS = "pagamentos";
export const NOME_FILA_PAGAMENTOS_DLQ = "pagamentos-dlq";
// ponytail: um evento por vez (a ordem entre eventos da mesma assinatura importa e o volume é baixo); por conta se crescer.
export const CONCORRENCIA_WORKER_PAGAMENTOS = 1;

export const esquemaJobPagamento = z.strictObject({
  eventoId: z.string().regex(/^evt_[A-Za-z0-9]{1,100}$/),
  contaId: z.string().regex(/^acct_[A-Za-z0-9]{1,100}$/),
});
export type JobPagamento = z.infer<typeof esquemaJobPagamento>;

export const OPCOES_JOB_PAGAMENTO = {
  // 10 tentativas, 15 s dobrando (≈ 4 h): cobre evento fora de ordem e Stripe/banco fora do ar.
  attempts: 10,
  backoff: { type: "exponential", delay: 15_000 },
  removeOnComplete: true,
  removeOnFail: true,
} satisfies JobsOptions;

export function criarFilaPagamentos(conexao: ConnectionOptions = conexaoRedis()): Queue<JobPagamento> {
  return new Queue<JobPagamento>(NOME_FILA_PAGAMENTOS, { connection: conexao, prefix: prefixoFila() });
}

const global = globalThis as unknown as { __filaPagamentos?: Queue<JobPagamento> };

/** Fila do processo do APP (só enfileira). O worker cria a dele. */
export function filaPagamentos(): Queue<JobPagamento> {
  global.__filaPagamentos ??= criarFilaPagamentos({ ...(conexaoRedis() as object), maxRetriesPerRequest: 1, connectTimeout: 3000 });
  return global.__filaPagamentos;
}

const PRAZO_ENFILEIRAR_MS = 3000;

/** Enfileira com prazo; LANÇA se não conseguir (o webhook responde 500 e o Stripe reenvia). */
export async function enfileirarEventoStripe(dados: JobPagamento, fila: Queue<JobPagamento> = filaPagamentos()): Promise<void> {
  const job = esquemaJobPagamento.parse(dados);
  await Promise.race([
    fila.add("evento", job, { ...OPCOES_JOB_PAGAMENTO, jobId: job.eventoId }),
    new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("fila não respondeu")), PRAZO_ENFILEIRAR_MS)),
  ]);
}
