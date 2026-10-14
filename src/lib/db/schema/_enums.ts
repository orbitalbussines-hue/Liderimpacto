/**
 * Enums do banco: `text` + CHECK, com a lista aqui. Nunca `pgEnum` —
 * acrescentar valor em pgEnum exige migracao que nao roda dentro de transacao.
 */

/** Papel na PLATAFORMA (ADR-0002). O default da coluna e o menor: NENHUM. */
export const PAPEIS_PLATAFORMA = ["NENHUM", "SUPER_ADMIN"] as const;
export type PapelPlataforma = (typeof PAPEIS_PLATAFORMA)[number];

/** Papel DENTRO de um criador, do maior para o menor privilegio (a ordem e a hierarquia). */
export const PAPEIS_CRIADOR = ["DONO", "ADMIN", "ALUNO"] as const;
export type PapelCriador = (typeof PAPEIS_CRIADOR)[number];

export const STATUS_CRIADOR = ["ATIVO", "SUSPENSO"] as const;
export type StatusCriador = (typeof STATUS_CRIADOR)[number];

export const STATUS_MEMBRO = ["ATIVO", "INATIVO"] as const;
export type StatusMembro = (typeof STATUS_MEMBRO)[number];

/** Turma (cohort) ou grupo de acesso (libera conteudo/canal). */
export const TIPOS_GRUPO = ["TURMA", "ACESSO"] as const;
export type TipoGrupo = (typeof TIPOS_GRUPO)[number];

/** Monta o CHECK de uma coluna enum a partir da lista (sem repetir os valores). */
export const listaSql = (valores: readonly string[]) =>
  valores.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
