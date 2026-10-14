import type { Acesso } from "@/lib/criador/area";
import type { PapelCriador } from "@/lib/db/schema/_enums";

/**
 * Regra PURA de permissao por criador (matriz em docs/rbac.md). Quem aplica:
 * `exigirMembro` (actions) e `membroDaPagina` (paginas).
 *
 * SUPER_ADMIN conta como DONO em qualquer criador (suporte da plataforma; a entrada fica na
 * trilha como "acesso de suporte"). Sem vinculo e sem ser SUPER_ADMIN: nenhum papel.
 */
export function papelEfetivo(acesso: Acesso | null): PapelCriador | null {
  if (!acesso) return null;
  if (acesso.superAdmin) return "DONO";
  return acesso.membro?.papel ?? null;
}

/** O papel efetivo esta entre os aceitos pela acao/pagina? */
export function papelAceito(acesso: Acesso | null, papeis: readonly PapelCriador[]): boolean {
  const papel = papelEfetivo(acesso);
  return papel !== null && papeis.includes(papel);
}

/** Atalhos usados pelas telas. */
export const EQUIPE: readonly PapelCriador[] = ["DONO", "ADMIN"];
export const TODOS_OS_MEMBROS: readonly PapelCriador[] = ["DONO", "ADMIN", "ALUNO"];
