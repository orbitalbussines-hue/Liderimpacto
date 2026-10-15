import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/lib/db";

/**
 * `GET /api/saude` — healthcheck do contêiner e conferência do deploy (ADR-0015). Pública e
 * mínima: só `{ ok }`, sem versão, host, erro ou tempo (nada que ajude quem sonda). 200 = o
 * processo responde E o banco aceita uma consulta; 503 = banco fora. `connection()` impede o
 * prerender no build (com cacheComponents um GET sem dado da requisição viraria estático).
 */
const SEM_CACHE = { "Cache-Control": "no-store" };

export async function GET() {
  await connection();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: SEM_CACHE });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: SEM_CACHE });
  }
}
