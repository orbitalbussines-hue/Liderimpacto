import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { TipoAvaliacao } from "@/lib/db/schema/_enums";
import { produtos_avaliacoes as av, produtos_avaliacoes_tentativas as tent, produtos_modulos } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

/**
 * Avaliações PUBLICADAS de um produto com a situação do membro — o que a página do curso e o
 * player precisam para travar módulos (RN-125) e mostrar "Avaliação do módulo". A regra da trava
 * é a mesma do SQL (`avaliacaoPendenteSql`): módulo publicado de ordem MENOR, não aprovada.
 */

export interface AvaliacaoDoCurso {
  id: string;
  titulo: string;
  tipo: TipoAvaliacao;
  /** Nulo = avaliação do produto (final). */
  moduloId: string | null;
  moduloOrdem: number | null;
  moduloPublicado: boolean;
  liberaProximoModulo: boolean;
  obrigatoriaParaCertificado: boolean;
  aprovada: boolean;
  /** Melhor nota entre as tentativas finalizadas (0–100, 1 casa); nula sem tentativa. */
  melhorNota: number | null;
}

export async function avaliacoesDoProduto(criadorId: string, produtoId: string, membroId: string | null): Promise<AvaliacaoDoCurso[]> {
  const doMembro = membroId ? sql`${tent.membro_id} = ${membroId}::uuid` : sql`false`;
  return db
    .select({
      id: av.id,
      titulo: av.titulo,
      tipo: av.tipo,
      moduloId: av.modulo_id,
      moduloOrdem: produtos_modulos.ordem,
      moduloPublicado: sql<boolean>`coalesce(${produtos_modulos.status} = 'PUBLICADO', false)`,
      liberaProximoModulo: av.libera_proximo_modulo,
      obrigatoriaParaCertificado: av.obrigatoria_para_certificado,
      aprovada: sql<boolean>`coalesce(bool_or(${tent.aprovada}), false)`,
      melhorNota: sql<number | null>`max(${tent.nota})::float8`,
    })
    .from(av)
    .leftJoin(produtos_modulos, and(eq(produtos_modulos.id, av.modulo_id), vivos(produtos_modulos)))
    .leftJoin(tent, and(eq(tent.avaliacao_id, av.id), doMembro, vivos(tent)))
    .where(
      and(
        eq(av.criador_id, criadorId),
        eq(av.produto_id, produtoId),
        eq(av.status, "PUBLICADA"),
        vivos(av),
        // Avaliação de módulo removido some junto com o módulo.
        sql`(${av.modulo_id} is null or ${produtos_modulos.id} is not null)`,
      ),
    )
    .groupBy(av.id, produtos_modulos.id)
    .orderBy(sql`${produtos_modulos.ordem} nulls last`, asc(av.created_at));
}

/** A avaliação que trava um módulo de ordem `moduloOrdem` para o membro (a primeira), ou nenhuma. */
export function avaliacaoQueTrava(avaliacoes: readonly AvaliacaoDoCurso[], moduloOrdem: number): AvaliacaoDoCurso | undefined {
  return avaliacoes.find((a) => a.liberaProximoModulo && a.moduloPublicado && a.moduloOrdem !== null && a.moduloOrdem < moduloOrdem && !a.aprovada);
}
