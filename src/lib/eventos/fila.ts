/**
 * Fila `eventos` do LEMBRETE (ADR-0011 item 6), no mesmo padrão da fila de certificados: mesma
 * conexão e prefixo (`VIDEO_FILA_PREFIXO`, padrão "li" → chaves `li:eventos:*`), 3 tentativas com
 * backoff e DLQ `eventos-dlq`. Um job ATRASADO por (evento, início): `jobId = idDoJobLembrete`
 * (enfileirar de novo não duplica; reagendar gera outro job e o velho vira no-op) e `delay` até 1 h
 * antes do início. O app só enfileira DEPOIS do commit; quem consome é o 2º Worker de
 * `npm run worker:certificados`.
 */
import { type ConnectionOptions, type JobsOptions, Queue } from "bullmq";
import { z } from "zod";
import { conexaoRedis, prefixoFila } from "@/lib/video/fila";
import { idDoJobLembrete, momentoDoLembrete } from "./regras";

export const NOME_FILA_EVENTOS = "eventos";
export const NOME_FILA_EVENTOS_DLQ = "eventos-dlq";
/** Job de milissegundos (um INSERT ... SELECT). */
export const CONCORRENCIA_WORKER_EVENTOS = 2;

export const esquemaJobLembrete = z.strictObject({ criadorId: z.uuid(), eventoId: z.uuid(), inicioEm: z.iso.datetime() });
export type JobLembrete = z.infer<typeof esquemaJobLembrete>;

export const OPCOES_JOB_LEMBRETE = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: true,
  removeOnFail: true,
} satisfies JobsOptions;

/** `jobId` sem ":" e `delay` = até o momento do lembrete (já passou = roda agora). */
export function opcoesDoJobLembrete(job: JobLembrete, agora: Date): JobsOptions {
  const inicio = new Date(job.inicioEm);
  return { ...OPCOES_JOB_LEMBRETE, jobId: idDoJobLembrete(job.eventoId, inicio), delay: Math.max(0, momentoDoLembrete(inicio).getTime() - agora.getTime()) };
}

export function criarFilaEventos(conexao: ConnectionOptions = conexaoRedis()): Queue<JobLembrete> {
  return new Queue<JobLembrete>(NOME_FILA_EVENTOS, { connection: conexao, prefix: prefixoFila() });
}

const global = globalThis as unknown as { __filaEventos?: Queue<JobLembrete> };

/** Fila do processo do APP (só enfileira). O worker cria a dele. */
export function filaEventos(): Queue<JobLembrete> {
  global.__filaEventos ??= criarFilaEventos({ ...(conexaoRedis() as object), maxRetriesPerRequest: 1, connectTimeout: 3000 });
  return global.__filaEventos;
}

export async function enfileirarLembrete(fila: Queue<JobLembrete>, dados: unknown, agora = new Date()): Promise<void> {
  const job = esquemaJobLembrete.parse(dados);
  await fila.add("lembrete", job, opcoesDoJobLembrete(job, agora));
}

const PRAZO_ENFILEIRAR_MS = 5000;

/**
 * Enfileira com prazo: fila fora do ar devolve `false` e a action segue valendo (o worker, ao subir,
 * reenfileira os lembretes de todo evento publicado que não começou). Nunca segura a resposta.
 */
export async function enfileirarLembreteComPrazo(criadorId: string, eventoId: string, inicioEm: Date): Promise<boolean> {
  try {
    await Promise.race([
      enfileirarLembrete(filaEventos(), { criadorId, eventoId, inicioEm: inicioEm.toISOString() }),
      new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("fila não respondeu")), PRAZO_ENFILEIRAR_MS)),
    ]);
    return true;
  } catch (e) {
    console.error("CRITICAL [eventos] lembrete não enfileirado (o worker reenfileira ao subir):", eventoId, e);
    return false;
  }
}
