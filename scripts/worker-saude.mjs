/**
 * Healthcheck dos contêineres da imagem worker (HEALTHCHECK do deploy/docker/worker.Dockerfile e o
 * compose da HML). Sai 0 (saudável) ou 1. Sem tsx: roda a cada 30 s e precisa ser leve.
 *   - com SAUDE_ARQUIVO (serviço `ferramentas` do Easypanel): o arquivo existe = a migração terminou
 *     (scripts/db-migrar.ts grava no fim);
 *   - senão (workers): o Redis da fila responde PING com a credencial do REDIS_URL.
 * Não imprime a URL (tem senha).
 */
import { existsSync } from "node:fs";
import { Redis } from "ioredis";

const marca = process.env.SAUDE_ARQUIVO?.trim();
if (marca) process.exit(existsSync(marca) ? 0 : 1);

const url = process.env.REDIS_URL;
if (!url) process.exit(1);
const redis = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true });
try {
  await redis.connect();
  process.exitCode = (await redis.ping()) === "PONG" ? 0 : 1;
} catch {
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
