/**
 * Recálculo retroativo dos pontos de UM criador (ADR-0012, RN-145):
 *
 *   npm run gamificacao:recalcular -- <slug>
 *
 * Idempotente (ON CONFLICT DO NOTHING no razão): rodar de novo não duplica nada. Precisa de
 * DATABASE_URL. Com a gamificação desligada, só conclui desafios cumpridos (sem pontos).
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { criadores } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { recalcularPontos } from "@/lib/gamificacao/recalcular";

async function principal(): Promise<number> {
  const slug = process.argv[2]?.trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]{1,63}$/.test(slug)) {
    console.error("Uso: npm run gamificacao:recalcular -- <slug-do-criador>");
    return 2;
  }
  const [c] = await db.select({ id: criadores.id, nome: criadores.nome }).from(criadores).where(and(eq(criadores.slug, slug), vivos(criadores)));
  if (!c) {
    console.error(`Criador "${slug}" não encontrado.`);
    return 1;
  }
  const inicio = Date.now();
  const r = await recalcularPontos(c.id);
  console.log(`[gamificacao] ${c.nome} (${slug}) em ${Date.now() - inicio} ms:`, r);
  return 0;
}

principal()
  .catch((e: unknown) => {
    console.error("gamificacao:recalcular falhou:", e instanceof Error ? e.message : e);
    return 1;
  })
  .then((codigo) => process.exit(codigo));
