/**
 * Worker dos certificados — PROCESSO SEPARADO do site (container próprio em produção). Consome a
 * fila `certificados` (chaves `li:certificados:*`). Separado do worker de vídeo de propósito: o
 * vídeo roda com concorrência 1 e FFmpeg; um PDF leva milissegundos e não pode esperar um vídeo
 * de 2 h na frente.
 *
 *   npm run worker:certificados   (= tsx --conditions=react-server scripts/worker-certificados.ts)
 *
 * Precisa de DATABASE_URL, S3_*, REDIS_URL e PLATAFORMA_DOMINIO (docs/back.md). Ao subir,
 * reenfileira as versões PENDENTES (fila fora do ar quando foram pedidas). Cada job: gera o PDF,
 * sobe no storage e marca a versão PRONTA (src/lib/certificados/worker.ts). Falha de vez: FALHOU
 * + cópia na DLQ.
 *
 * É também o "worker de jobs leves": um 2º `Worker` consome a fila `eventos` (lembrete 1 h antes,
 * ADR-0011 item 6), com concorrência e DLQ próprias (`eventos-dlq`) — um PDF atrasado não segura o
 * lembrete. Ao subir, reenfileira o lembrete de todo evento PUBLICADO que ainda não começou.
 * Um 3º `Worker` consome a fila `conhecimento` (reindexação da base do assistente, ADR-0014), com
 * DLQ `conhecimento-dlq`; o job é idempotente (relê a fonte e compara a assinatura dos trechos).
 * Um 4º `Worker` consome a fila `webhooks` (entregas de saída, ADR-0018 item 5): backoff exponencial,
 * DLQ `webhooks-dlq`; ao subir, reenfileira as entregas PENDENTES (`jobId` = entrega: não duplica).
 */
import { type Job, Queue, Worker } from "bullmq";
import {
  CONCORRENCIA_WORKER_CONHECIMENTO,
  esquemaJobConhecimento,
  type JobConhecimento,
  NOME_FILA_CONHECIMENTO,
  NOME_FILA_CONHECIMENTO_DLQ,
} from "../src/lib/conhecimento/fila";
import { sincronizar } from "../src/lib/conhecimento/indexar";
import {
  CONCORRENCIA_WORKER_CERTIFICADOS,
  criarFilaCertificados,
  enfileirarCertificado,
  esquemaJobCertificado,
  type JobCertificado,
  NOME_FILA_CERTIFICADOS,
  NOME_FILA_CERTIFICADOS_DLQ,
  OPCOES_JOB_CERTIFICADO,
} from "../src/lib/certificados/fila";
import { marcarFalhaDaVersao, processarVersao, versoesPendentes } from "../src/lib/certificados/worker";
import {
  CONCORRENCIA_WORKER_EVENTOS,
  criarFilaEventos,
  enfileirarLembrete,
  type JobLembrete,
  NOME_FILA_EVENTOS,
  NOME_FILA_EVENTOS_DLQ,
} from "../src/lib/eventos/fila";
import { lembretesPendentes, processarLembrete } from "../src/lib/eventos/lembrete";
import { conexaoRedis, ehFalhaDefinitiva, prefixoFila } from "../src/lib/video/fila";
import { aguardarEsquema } from "../src/lib/db/migracoes";
import { entregasPendentes, processarEntrega } from "../src/lib/webhooks/entrega";
import {
  CONCORRENCIA_WORKER_WEBHOOKS,
  criarFilaWebhooks,
  enfileirarEntrega,
  esquemaJobWebhook,
  type JobWebhook,
  NOME_FILA_WEBHOOKS,
  NOME_FILA_WEBHOOKS_DLQ,
  OPCOES_JOB_WEBHOOK,
} from "../src/lib/webhooks/fila";

async function processarWebhook(job: Job<JobWebhook>): Promise<string> {
  const { entregaId } = esquemaJobWebhook.parse(job.data);
  const r = await processarEntrega(entregaId, job.attemptsMade + 1, job.opts.attempts ?? OPCOES_JOB_WEBHOOK.attempts);
  console.log(`[webhooks] ${entregaId}: ${r} (tentativa ${job.attemptsMade + 1})`);
  return r;
}

async function processar(job: Job<JobCertificado>): Promise<string> {
  const { versaoId } = esquemaJobCertificado.parse(job.data);
  const inicio = Date.now();
  const r = await processarVersao(versaoId);
  console.log(`[certificados] ${versaoId}: ${r} em ${Date.now() - inicio} ms (tentativa ${job.attemptsMade + 1}/${job.opts.attempts ?? OPCOES_JOB_CERTIFICADO.attempts})`);
  return r;
}

async function processarEvento(job: Job<JobLembrete>): Promise<number> {
  const n = await processarLembrete(job.data);
  console.log(`[eventos] lembrete ${job.id}: ${n} aviso(s)`);
  return n;
}

async function processarConhecimento(job: Job<JobConhecimento>): Promise<string> {
  const j = esquemaJobConhecimento.parse(job.data);
  const r = await sincronizar(j.criadorId, j.alvo, j.autorId);
  console.log(`[conhecimento] ${j.alvo.tipo} ${Object.values(j.alvo)[1]}: ${r}`);
  return r;
}

async function principal() {
  await aguardarEsquema("certificados"); // ADR-0016: deploy sem job prévio, a migração pode estar rodando
  const conexao = conexaoRedis();
  const prefix = prefixoFila();
  const dlq = new Queue(NOME_FILA_CERTIFICADOS_DLQ, { connection: conexao, prefix });
  const worker = new Worker<JobCertificado>(NOME_FILA_CERTIFICADOS, processar, { connection: conexao, prefix, concurrency: CONCORRENCIA_WORKER_CERTIFICADOS });

  worker.on("failed", (job, erro) => {
    if (!job) return;
    console.error(`[certificados] ${job.data.versaoId}: falhou (${job.attemptsMade}/${job.opts.attempts}): ${erro.message}`);
    if (ehFalhaDefinitiva(job.attemptsMade, job.opts.attempts)) {
      void marcarFalhaDaVersao(job.data.versaoId, erro.message);
      void dlq.add("falhou", { ...job.data, erro: erro.message, falhouEm: new Date().toISOString() });
    }
  });
  worker.on("error", (e) => console.error("[certificados] erro do worker:", e.message));

  const dlqEventos = new Queue(NOME_FILA_EVENTOS_DLQ, { connection: conexao, prefix });
  const workerEventos = new Worker<JobLembrete>(NOME_FILA_EVENTOS, processarEvento, { connection: conexao, prefix, concurrency: CONCORRENCIA_WORKER_EVENTOS });
  workerEventos.on("failed", (job, erro) => {
    if (!job) return;
    console.error(`[eventos] lembrete ${job.id}: falhou (${job.attemptsMade}/${job.opts.attempts}): ${erro.message}`);
    if (ehFalhaDefinitiva(job.attemptsMade, job.opts.attempts)) void dlqEventos.add("falhou", { ...job.data, erro: erro.message, falhouEm: new Date().toISOString() });
  });
  workerEventos.on("error", (e) => console.error("[eventos] erro do worker:", e.message));

  const dlqConhecimento = new Queue(NOME_FILA_CONHECIMENTO_DLQ, { connection: conexao, prefix });
  const workerConhecimento = new Worker<JobConhecimento>(NOME_FILA_CONHECIMENTO, processarConhecimento, { connection: conexao, prefix, concurrency: CONCORRENCIA_WORKER_CONHECIMENTO });
  workerConhecimento.on("failed", (job, erro) => {
    if (!job) return;
    console.error(`[conhecimento] ${job.id}: falhou (${job.attemptsMade}/${job.opts.attempts}): ${erro.message}`);
    if (ehFalhaDefinitiva(job.attemptsMade, job.opts.attempts)) void dlqConhecimento.add("falhou", { ...job.data, erro: erro.message, falhouEm: new Date().toISOString() });
  });
  workerConhecimento.on("error", (e) => console.error("[conhecimento] erro do worker:", e.message));

  const dlqWebhooks = new Queue(NOME_FILA_WEBHOOKS_DLQ, { connection: conexao, prefix });
  const workerWebhooks = new Worker<JobWebhook>(NOME_FILA_WEBHOOKS, processarWebhook, { connection: conexao, prefix, concurrency: CONCORRENCIA_WORKER_WEBHOOKS });
  workerWebhooks.on("failed", (job, erro) => {
    if (!job) return;
    console.error(`[webhooks] ${job.id}: falhou (${job.attemptsMade}/${job.opts.attempts}): ${erro.message}`);
    if (ehFalhaDefinitiva(job.attemptsMade, job.opts.attempts)) void dlqWebhooks.add("falhou", { ...job.data, erro: erro.message, falhouEm: new Date().toISOString() });
  });
  workerWebhooks.on("error", (e) => console.error("[webhooks] erro do worker:", e.message));

  const fila = criarFilaCertificados(conexao);
  const pendentes = await versoesPendentes();
  for (const versaoId of pendentes) await enfileirarCertificado(fila, { versaoId });
  await fila.close();

  const filaEv = criarFilaEventos(conexao);
  const lembretes = await lembretesPendentes();
  for (const l of lembretes) await enfileirarLembrete(filaEv, l);
  await filaEv.close();

  const filaWh = criarFilaWebhooks(conexao);
  const entregas = await entregasPendentes();
  for (const entregaId of entregas) await enfileirarEntrega(filaWh, { entregaId });
  await filaWh.close();

  const desligar = async () => {
    console.log("[certificados] desligando: termina os jobs atuais e para.");
    await Promise.all([worker.close(), workerEventos.close(), workerConhecimento.close(), workerWebhooks.close()]);
    await Promise.all([dlq.close(), dlqEventos.close(), dlqConhecimento.close(), dlqWebhooks.close()]);
    process.exit(0);
  };
  process.on("SIGTERM", desligar);
  process.on("SIGINT", desligar);
  console.log(`[certificados] worker ouvindo ${prefix}:${NOME_FILA_CERTIFICADOS} (concorrência ${CONCORRENCIA_WORKER_CERTIFICADOS}); ${pendentes.length} pendente(s) reenfileirada(s).`);
  console.log(`[eventos] worker ouvindo ${prefix}:${NOME_FILA_EVENTOS} (concorrência ${CONCORRENCIA_WORKER_EVENTOS}); ${lembretes.length} lembrete(s) (re)enfileirado(s).`);
  console.log(`[conhecimento] worker ouvindo ${prefix}:${NOME_FILA_CONHECIMENTO} (concorrência ${CONCORRENCIA_WORKER_CONHECIMENTO}).`);
  console.log(`[webhooks] worker ouvindo ${prefix}:${NOME_FILA_WEBHOOKS} (concorrência ${CONCORRENCIA_WORKER_WEBHOOKS}); ${entregas.length} entrega(s) pendente(s) reenfileirada(s).`);
}

principal().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
