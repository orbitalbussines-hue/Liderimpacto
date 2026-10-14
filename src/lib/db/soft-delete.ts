import { and, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

interface TabelaAuditada {
  id: AnyPgColumn;
  updated_at: AnyPgColumn;
  is_deleted: AnyPgColumn;
}

/** Filtro de TODA leitura: so registros nao excluidos. */
export const vivos = (t: { is_deleted: AnyPgColumn }): SQL => eq(t.is_deleted, false);

/**
 * WHERE da trava de colisao (optimistic locking): mesmo id, mesmo `updated_at`
 * que a tela abriu, e ainda nao excluido. Zero linhas afetadas = outro usuario
 * mexeu antes.
 */
export const travaDeColisao = (t: TabelaAuditada, id: string, updatedAtOriginal: Date): SQL =>
  and(eq(t.id, id), eq(t.updated_at, updatedAtOriginal), vivos(t)) as SQL;

/** SET do soft delete. Delete fisico e proibido. */
export const marcaDeExclusao = (userId: string) => {
  const agora = new Date();
  return { is_deleted: true, deleted_at: agora, updated_at: agora, modified_by: userId };
};

export const MSG_COLISAO = "Registro alterado por outro usuario. Recarregue e tente novamente.";
