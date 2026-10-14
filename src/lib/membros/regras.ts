import type { PapelCriador } from "@/lib/db/schema/_enums";

/**
 * QUEM GERENCIA QUEM dentro de um criador (RN-104) — regra pura, travada por teste.
 * `ator` = papel EFETIVO de quem age (SUPER_ADMIN chega aqui como DONO).
 *
 *  - DONO e ADMIN gerenciam ALUNOS (cadastrar, grupos, inativar, remover);
 *  - so DONO gerencia a EQUIPE: cadastra ADMIN, muda papel, mexe em ADMIN/DONO;
 *  - o ultimo DONO ativo nunca sai (nem rebaixado, nem inativado, nem removido) — conferido
 *    no banco com trava de linha (vincular.ts), porque depende do estado de agora.
 */

/** Papeis que o ator pode escolher no cadastro. Promover a DONO so pela troca de papel. */
export function papeisQuePodeCadastrar(ator: PapelCriador): PapelCriador[] {
  if (ator === "DONO") return ["ALUNO", "ADMIN"];
  if (ator === "ADMIN") return ["ALUNO"];
  return [];
}

/** O ator pode inativar, remover, mexer em grupos ou gerar link deste membro? */
export function podeGerir(ator: PapelCriador, alvo: PapelCriador): boolean {
  if (ator === "DONO") return true;
  return ator === "ADMIN" && alvo === "ALUNO";
}

/** Trocar papel (promover/rebaixar) e so do DONO. */
export const podeMudarPapel = (ator: PapelCriador) => ator === "DONO";

export const MSG_ULTIMO_DONO = "Esta área precisa de pelo menos um DONO ativo. Promova outra pessoa antes.";

/** A mudanca tira um DONO ativo e ele e o unico? (`donosAtivos` lido com trava de linha.) */
export function tiraUltimoDono(donosAtivos: number, alvoEraDonoAtivo: boolean, continuaDonoAtivo: boolean): boolean {
  return alvoEraDonoAtivo && !continuaDonoAtivo && donosAtivos <= 1;
}
