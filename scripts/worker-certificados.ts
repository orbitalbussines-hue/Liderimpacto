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
 */
import { type Job, Queue, Worker } from "bullmq";
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
import { conexaoRedis, ehFalhaDefinitiva, prefixoFila } from "../src/lib/video/fila";

async function processar(job: Job<JobCertificado>): Promise<string> {
  const { versaoId } = esquemaJobCertificado.parse(job.data);
  const inicio = Date.now();
  const r = await processarVersao(versaoId);
  console.log(`[certificados] ${versaoId}: ${r} em ${Date.now() - inicio} ms (tentativa ${job.attemptsMade + 1}/${job.opts.attempts ?? OPCOES_JOB_CERTIFICADO.attempts})`);
  return r;
}

async function principal() {
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

  const fila = criarFilaCertificados(conexao);
  const pendentes = await versoesPendentes();
  for (const versaoId of pendentes) await enfileirarCertificado(fila, { versaoId });
  await fila.close();

  const desligar = async () => {
    console.log("[certificados] desligando: termina os jobs atuais e para.");
    await worker.close();
    await dlq.close();
    process.exit(0);
  };
  process.on("SIGTERM", desligar);
  process.on("SIGINT", desligar);
  console.log(`[certificados] worker ouvindo ${prefix}:${NOME_FILA_CERTIFICADOS} (concorrência ${CONCORRENCIA_WORKER_CERTIFICADOS}); ${pendentes.length} pendente(s) reenfileirada(s).`);
}

principal().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
