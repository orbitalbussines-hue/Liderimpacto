
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { usuarios_limites } from "@/lib/db/schema";

/** A MAIOR janela usada aqui; `rateLimit.window` em auth.ts precisa ser >= isto. */
export const MAIOR_JANELA_S = 900;

/**
 * Contador por janela, atomico no banco (upsert), reaproveitando a tabela de
 * limites do Better Auth. `true` = passou do teto nesta janela.
 * ATENCAO: a biblioteca poda essa tabela pela maior janela que ELA conhece
 * (`rateLimit.window`), entao aquele valor tem de cobrir `MAIOR_JANELA_S`.
 * Mora num modulo proprio porque quase tudo depende dele (login, recuperacao,
 * fatores, reautenticacao, alertas) e ninguem deve depender de `login.ts`.
 */
export async function estourouTeto(chave: string, janelaSeg: number, max: number): Promise<boolean> {
  const agora = Date.now();
  const janelaMs = janelaSeg * 1000;
  const [linha] = await db
    .insert(usuarios_limites)
    .values({ chave, contagem: 1, ultima_requisicao: agora })
    .onConflictDoUpdate({
      target: usuarios_limites.chave,
      set: {
        contagem: sql`case when ${agora} - ${usuarios_limites.ultima_requisicao} >= ${janelaMs} then 1 else ${usuarios_limites.contagem} + 1 end`,
        ultima_requisicao: sql`case when ${agora} - ${usuarios_limites.ultima_requisicao} >= ${janelaMs} then ${agora} else ${usuarios_limites.ultima_requisicao} end`,
      },
    })
    .returning({ contagem: usuarios_limites.contagem });
  return (linha?.contagem ?? 0) > max;
}
