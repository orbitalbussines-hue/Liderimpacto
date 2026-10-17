import { connection } from "next/server";
import { esquemaEmDia } from "@/lib/db/migracoes";

/**
 * `GET /api/saude` — healthcheck do contêiner e conferência do deploy (ADR-0015/0016). Pública e
 * mínima: só `{ ok }`, sem versão, host, erro ou tempo (nada que ajude quem sonda). 200 = o
 * processo responde, o banco aceita consulta E já tem todas as migrações deste código; 503 = banco
 * fora ou ainda não migrado (no Easypanel a versão nova só entra no ar depois do 200).
 * `connection()` impede o prerender no build (com cacheComponents um GET sem dado da requisição
 * viraria estático).
 */
const SEM_CACHE = { "Cache-Control": "no-store" };

export async function GET() {
  await connection();
  const ok = await esquemaEmDia();
  return Response.json({ ok }, { status: ok ? 200 : 503, headers: SEM_CACHE });
}
