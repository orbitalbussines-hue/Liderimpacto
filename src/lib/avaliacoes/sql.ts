import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Trechos SQL das avaliações reaproveitados por quem lê a aula junto (`acessoDaAula`) e pelas
 * consultas (RN-125). Nomes de tabela fixos daqui; valores sempre parametrizados.
 */

/** Tentativa APROVADA do membro na avaliação `avaliacao` (coluna/expressão). */
export const aprovadoSql = (avaliacao: AnyPgColumn | SQL, membroId: string | null): SQL<boolean> => sql<boolean>`exists (
  select 1 from produtos_avaliacoes_tentativas t
  where t.avaliacao_id = ${avaliacao} and t.membro_id = ${membroId}::uuid and t.aprovada and t.is_deleted = false
)`;

/**
 * Há avaliação PUBLICADA com "libera o próximo módulo" num módulo PUBLICADO do mesmo produto e
 * de ordem MENOR que a do módulo `modulo`, ainda não aprovada pelo membro? (Todo módulo depois
 * de uma avaliação dessas fica travado até a aprovação; módulo em rascunho não trava ninguém.)
 */
export const avaliacaoPendenteSql = (modulo: AnyPgColumn, membroId: string | null): SQL<boolean> => sql<boolean>`exists (
  select 1 from produtos_avaliacoes av
  join produtos_modulos ma on ma.id = av.modulo_id
  join produtos_modulos mx on mx.id = ${modulo}
  where av.libera_proximo_modulo and av.status = 'PUBLICADA' and av.is_deleted = false
    and ma.produto_id = mx.produto_id and ma.is_deleted = false and ma.status = 'PUBLICADO' and ma.ordem < mx.ordem
    and not ${aprovadoSql(sql`av.id`, membroId)}
)`;
