/**
 * Reindexação da Base de conhecimento de UM criador (ADR-0014, RN-190):
 *
 *   npm run conhecimento:reindexar -- <slug>
 *
 * Idempotente: fonte que não mudou não mexe em nada (assinatura dos trechos). Lê descrições de
 * aulas e cursos, a legenda viva de cada aula (o `.vtt` no storage, para os tempos; sem storage, o
 * texto sem tempos) e os textos da equipe; exclui (lógico) os documentos de aula/curso removidos.
 * Precisa de DATABASE_URL (e S3_* para os tempos da transcrição).
 */
import { and, eq } from "drizzle-orm";
import { AUTOR_SISTEMA } from "@/lib/conhecimento/regras";
import { reindexarCriador } from "@/lib/conhecimento/indexar";
import { db } from "@/lib/db";
import { criadores } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

async function principal(): Promise<number> {
  const slug = process.argv[2]?.trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]{1,63}$/.test(slug)) {
    console.error("Uso: npm run conhecimento:reindexar -- <slug-do-criador>");
    return 2;
  }
  const [c] = await db.select({ id: criadores.id, nome: criadores.nome }).from(criadores).where(and(eq(criadores.slug, slug), vivos(criadores)));
  if (!c) {
    console.error(`Criador "${slug}" não encontrado.`);
    return 1;
  }
  const inicio = Date.now();
  const r = await reindexarCriador(c.id, AUTOR_SISTEMA);
  console.log(`[conhecimento] ${c.nome} (${slug}) em ${Date.now() - inicio} ms:`, r);
  return 0;
}

principal()
  .catch((e: unknown) => {
    console.error("conhecimento:reindexar falhou:", e instanceof Error ? e.message : e);
    return 1;
  })
  .then((codigo) => process.exit(codigo));
