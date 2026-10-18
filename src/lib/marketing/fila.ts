/**
 * Filas do e-mail de marketing (ADR-0020), no padrão das outras (`li:<fila>:*`, DLQ, workers em
 * `npm run worker:certificados`):
 *  - `emails` (6º Worker, concorrência 1): um job por ENVIO (`jobId` = envio: enfileirar de novo não
 *    duplica). O TETO de envio para a fila inteira (`worker.rateLimit`) e o job volta a esperar sem
 *    gastar tentativa: o que passa do teto sai na janela seguinte, nunca é descartado.
 *  - `marketing` (7º Worker): iniciar campanha agendada, executar automação (job atrasado pelo
 *    atraso configurado) e a varredura diária de inatividade (job repetido).
 * O app só enfileira DEPOIS do commit; fila fora do ar = o registro fica PENDENTE/AGENDADO e o worker
 * reenfileira ao subir.
 */
import { type ConnectionOptions, type JobsOptions, Queue } from "bullmq";
import { z } from "zod";
import { conexaoRedis, prefixoFila } from "@/lib/video/fila";

export const NOME_FILA_EMAILS = "emails";
export const NOME_FILA_EMAILS_DLQ = "emails-dlq";
export const NOME_FILA_MARKETING = "marketing";
export const NOME_FILA_MARKETING_DLQ = "marketing-dlq";
/** Um envio por vez: o teto é lido e gasto em sequência (sem corrida). */
export const CONCORRENCIA_WORKER_EMAILS = 1;
export const CONCORRENCIA_WORKER_MARKETING = 2;
/** Varredura diária (inatividade / nunca acessou): 09:00 de Brasília, fora da madrugada. */
export const VARREDURA_DIARIA = { id: "varredura-diaria", pattern: "0 9 * * *", tz: "America/Sao_Paulo" } as const;

export const esquemaJobEnvio = z.strictObject({ envioId: z.uuid() });
export type JobEnvio = z.infer<typeof esquemaJobEnvio>;

export const esquemaJobMarketing = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("campanha"), campanhaId: z.uuid() }),
  z.strictObject({ tipo: z.literal("execucao"), execucaoId: z.uuid() }),
  z.strictObject({ tipo: z.literal("varredura") }),
]);
export type JobMarketing = z.infer<typeof esquemaJobMarketing>;

export const OPCOES_JOB_ENVIO = {
  attempts: 5,
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: true,
  removeOnFail: true,
} satisfies JobsOptions;

export const OPCOES_JOB_MARKETING = {
  attempts: 5,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: true,
  removeOnFail: true,
} satisfies JobsOptions;

export const criarFilaEmails = (conexao: ConnectionOptions = conexaoRedis()) => new Queue<JobEnvio>(NOME_FILA_EMAILS, { connection: conexao, prefix: prefixoFila() });
export const criarFilaMarketing = (conexao: ConnectionOptions = conexaoRedis()) => new Queue<JobMarketing>(NOME_FILA_MARKETING, { connection: conexao, prefix: prefixoFila() });

const global = globalThis as unknown as { __filaEmails?: Queue<JobEnvio>; __filaMarketing?: Queue<JobMarketing> };
const conexaoDoApp = () => ({ ...(conexaoRedis() as object), maxRetriesPerRequest: 1, connectTimeout: 3000 });

/** Filas do processo do APP (só enfileiram). O worker cria as dele. */
export function filaEmails(): Queue<JobEnvio> {
  global.__filaEmails ??= criarFilaEmails(conexaoDoApp());
  return global.__filaEmails;
}
export function filaMarketing(): Queue<JobMarketing> {
  global.__filaMarketing ??= criarFilaMarketing(conexaoDoApp());
  return global.__filaMarketing;
}

/** `jobId` estável: campanha + instante agendado (reagendar cria outro job; o velho vira no-op). */
export function idDoJobMarketing(j: JobMarketing, quando?: Date): string {
  if (j.tipo === "campanha") return `campanha-${j.campanhaId}-${quando?.getTime() ?? 0}`;
  if (j.tipo === "execucao") return `execucao-${j.execucaoId}`;
  return "varredura";
}

export async function enfileirarEnvios(fila: Queue<JobEnvio>, envioIds: readonly string[]): Promise<void> {
  for (let i = 0; i < envioIds.length; i += 500) {
    await fila.addBulk(envioIds.slice(i, i + 500).map((envioId) => ({ name: "enviar", data: esquemaJobEnvio.parse({ envioId }), opts: { ...OPCOES_JOB_ENVIO, jobId: envioId } })));
  }
}

export async function enfileirarMarketing(fila: Queue<JobMarketing>, dados: unknown, quando?: Date, agora = new Date()): Promise<void> {
  const job = esquemaJobMarketing.parse(dados);
  const delay = quando ? Math.max(0, quando.getTime() - agora.getTime()) : 0;
  await fila.add(job.tipo, job, { ...OPCOES_JOB_MARKETING, jobId: idDoJobMarketing(job, quando), delay });
}

const PRAZO_MS = 3000;

async function comPrazo(rotulo: string, f: () => Promise<void>): Promise<boolean> {
  try {
    await Promise.race([f(), new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("fila não respondeu")), PRAZO_MS))]);
    return true;
  } catch (e) {
    console.error(`CRITICAL [marketing] ${rotulo} não enfileirado (o worker reenfileira ao subir):`, e instanceof Error ? e.message : e);
    return false;
  }
}

/** Do app, depois do commit: nunca lança (o registro PENDENTE é reenfileirado quando o worker sobe). */
export const enfileirarEnviosComPrazo = (ids: readonly string[], fila: Queue<JobEnvio> = filaEmails()) =>
  ids.length ? comPrazo(`${ids.length} envio(s)`, () => enfileirarEnvios(fila, ids)) : Promise.resolve(true);

export const enfileirarMarketingComPrazo = (itens: readonly { job: JobMarketing; quando?: Date }[], fila: Queue<JobMarketing> = filaMarketing()) =>
  itens.length ? comPrazo(`${itens.length} job(s) de marketing`, async () => void (await Promise.all(itens.map((i) => enfileirarMarketing(fila, i.job, i.quando))))) : Promise.resolve(true);
