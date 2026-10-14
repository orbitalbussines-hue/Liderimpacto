import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Pré-requisito cumprido (RN-118), em SQL, para quem lê a aula junto: `acessoDaAula` e as
 * consultas das telas. Cumprido quando a aula não tem pré-requisito, quando o pré-requisito não
 * existe mais publicado (removido ou módulo oculto: ninguém conseguiria concluí-lo) ou quando o
 * membro o concluiu. `membroId` nulo (SUPER_ADMIN sem vínculo) nunca cumpre — a equipe nem chega
 * a olhar (motivoDoBloqueio).
 */
export const preRequisitoCumpridoSql = (preRequisito: AnyPgColumn, membroId: string | null): SQL<boolean> => sql<boolean>`(
  ${preRequisito} is null
  or not exists (select 1 from produtos_modulos_aulas pa join produtos_modulos pm on pm.id = pa.modulo_id
    where pa.id = ${preRequisito} and pa.is_deleted = false and pm.is_deleted = false and pm.status = 'PUBLICADO')
  or exists (select 1 from produtos_modulos_aulas_progressos pp
    where pp.aula_id = ${preRequisito} and pp.membro_id = ${membroId}::uuid and pp.concluida and pp.is_deleted = false)
)`;
