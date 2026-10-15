/**
 * Healthcheck dos contêineres de worker (deploy/hml/docker-compose.yml): o Redis da fila responde
 * PING com a credencial do REDIS_URL? Sai 0 (saudável) ou 1. Sem tsx: roda a cada 30 s e precisa
 * ser leve. Não imprime a URL (tem senha).
 */
import { Redis } from "ioredis";

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
