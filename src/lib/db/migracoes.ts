import { sql } from "drizzle-orm";
import diario from "./migrations/meta/_journal.json";
import { db } from "@/lib/db";

/**
 * O banco já tem TODAS as migrações que este código conhece? (ADR-0016)
 *
 * No Easypanel não há "job antes do deploy": o serviço `ferramentas` migra (scripts/db-migrar.ts,
 * com trava) enquanto o app e os workers novos sobem. Quem sobe antes da migração terminar espera:
 * o `GET /api/saude` responde 503 (a versão anterior continua atendendo) e os workers aguardam em
 * `aguardarEsquema`. Compara o `when` da última migração do journal (entra no bundle) com o maior
 * `created_at` da tabela de controle do migrator. `>=`: a versão ANTERIOR continua saudável sobre
 * o schema novo (migrações aditivas, ADR-0015).
 */
export const ULTIMA_MIGRACAO = Math.max(...diario.entries.map((e) => e.when));

export const esquemaAtende = (ultimaAplicada: number | null) => ultimaAplicada !== null && ultimaAplicada >= ULTIMA_MIGRACAO;

/** false também quando o banco está fora ou a tabela de controle ainda não existe. */
export async function esquemaEmDia(): Promise<boolean> {
  try {
    const r = await db.execute<{ ultima: string | null }>(sql`select max(created_at)::text as ultima from drizzle.__drizzle_migrations`);
    const ultima = r.rows[0]?.ultima;
    return esquemaAtende(ultima ? Number(ultima) : null);
  } catch {
    return false;
  }
}

/** Workers: só começam a consumir a fila com o schema em dia (consulta a cada 5 s, sem prazo). */
export async function aguardarEsquema(quem: string, intervaloMs = 5000): Promise<void> {
  let avisou = false;
  while (!(await esquemaEmDia())) {
    if (!avisou) console.log(`[${quem}] aguardando o banco migrado (serviço ferramentas)...`);
    avisou = true;
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  if (avisou) console.log(`[${quem}] banco migrado; iniciando.`);
}
