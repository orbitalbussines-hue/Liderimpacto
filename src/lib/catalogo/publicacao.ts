import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import type { Transacao } from "@/lib/db";
import { arquivos, produtos, produtos_modulos, produtos_modulos_aulas } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { pendenciasParaPublicar } from "./regras";

type ProdutoLido = Pick<typeof produtos.$inferSelect, "id" | "titulo" | "status" | "capa_16x9_arquivo_id">;

/** O que falta para o produto ficar publicavel, lido na transacao de quem chama. */
export async function pendenciasDoProduto(tx: Transacao, criadorId: string, p: ProdutoLido): Promise<string[]> {
  const [{ modulos }] = await tx
    .select({ modulos: sql<number>`count(distinct ${produtos_modulos.id})::int` })
    .from(produtos_modulos)
    .innerJoin(produtos_modulos_aulas, and(eq(produtos_modulos_aulas.modulo_id, produtos_modulos.id), vivos(produtos_modulos_aulas)))
    .where(and(eq(produtos_modulos.produto_id, p.id), eq(produtos_modulos.criador_id, criadorId), eq(produtos_modulos.status, "PUBLICADO"), vivos(produtos_modulos)));
  const capa = p.capa_16x9_arquivo_id
    ? (await tx.select({ id: arquivos.id }).from(arquivos).where(and(eq(arquivos.id, p.capa_16x9_arquivo_id), eq(arquivos.criador_id, criadorId), vivos(arquivos))))[0]
    : undefined;
  return pendenciasParaPublicar({ titulo: p.titulo, temCapa16x9: !!capa, modulosComAula: modulos });
}

/**
 * Invariante: produto fora de RASCUNHO continua publicavel. Chamado DEPOIS da mudanca (remover
 * aula, ocultar modulo), dentro da transacao: se quebrou, lanca e tudo volta.
 */
export async function garantirPublicavel(tx: Transacao, criadorId: string, p: ProdutoLido): Promise<void> {
  if (p.status === "RASCUNHO") return;
  const faltas = await pendenciasDoProduto(tx, criadorId, p);
  if (faltas.length) {
    throw new ErroDeNegocio(`"${p.titulo}" está publicado e ficaria sem: ${faltas.join("; ")}. Volte o produto para rascunho antes.`);
  }
}
