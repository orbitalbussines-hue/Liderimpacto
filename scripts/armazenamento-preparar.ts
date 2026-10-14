/**
 * Cria os 3 buckets do armazenamento (arquivos, videos originais, HLS) e aplica o CORS que o
 * navegador precisa para subir direto (PUT) e ler o ETag do multipart. IDEMPOTENTE: rodar de
 * novo nao muda nada. Uso: `npm run armazenamento:preparar` (com as variaveis S3_* no ambiente).
 *
 * Origens do CORS: S3_CORS_ORIGENS (separadas por virgula) ou, sem ela, as do BETTER_AUTH_URL:
 * o apex e os subdominios dos criadores (http://localhost:3011 e http://*.localhost:3011 em dev).
 */
import { prepararBucket, type Bucket } from "../src/lib/armazenamento/cliente";

function origens(): string[] {
  const explicitas = process.env.S3_CORS_ORIGENS?.split(",").map((o) => o.trim()).filter(Boolean);
  if (explicitas?.length) return explicitas;
  const base = process.env.BETTER_AUTH_URL;
  if (!base) throw new Error("Defina S3_CORS_ORIGENS ou BETTER_AUTH_URL para montar o CORS dos buckets.");
  const u = new URL(base);
  return [u.origin, `${u.protocol}//*.${u.host}`];
}

async function principal() {
  const lista = origens();
  for (const b of ["arquivos", "videosOriginais", "hls"] as Bucket[]) {
    const estado = await prepararBucket(b, lista);
    console.log(`bucket ${b}: ${estado} (CORS: ${lista.join(", ")})`);
  }
}

principal().catch((e: unknown) => {
  console.error("Falha ao preparar o armazenamento:", e instanceof Error ? e.message : e);
  process.exit(1);
});
