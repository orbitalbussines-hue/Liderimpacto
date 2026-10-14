import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import { produtos, produtos_modulos, produtos_modulos_aulas } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { matriculaAtiva } from "@/lib/matriculas/consultas";
import { podeAssistir } from "./acesso";

/**
 * Dados da aula (aula, módulo e produto vivos DESTE criador) + matrícula de quem pede, e a
 * decisão de `podeAssistir`. Usado pelo token (actions) e pela entrega (playlist e chave): as
 * portas decidem igual. `null` = a aula não existe neste criador.
 */
export async function acessoDaAula(
  criadorId: string,
  aulaId: string,
  quem: { papel: PapelCriador | null; membroId: string | null },
  agora: Date = new Date(),
): Promise<{ pode: boolean } | null> {
  const [a] = await db
    .select({
      liberaEm: produtos_modulos_aulas.libera_em,
      statusModulo: produtos_modulos.status,
      statusProduto: produtos.status,
      produtoId: produtos.id,
    })
    .from(produtos_modulos_aulas)
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
    .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id))
    .where(
      and(
        eq(produtos_modulos_aulas.id, aulaId),
        eq(produtos_modulos_aulas.criador_id, criadorId),
        vivos(produtos_modulos_aulas),
        vivos(produtos_modulos),
        vivos(produtos),
      ),
    );
  if (!a) return null;
  // A matrícula só importa para o ALUNO (a equipe passa sem ela).
  const ativa = quem.papel === "ALUNO" && quem.membroId !== null && (await matriculaAtiva(criadorId, quem.membroId, a.produtoId, agora));
  return { pode: podeAssistir({ papel: quem.papel, matriculaAtiva: ativa }, a, agora) };
}
