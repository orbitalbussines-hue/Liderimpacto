import type { PapelCriador, StatusModulo, StatusProduto } from "@/lib/db/schema/_enums";

/**
 * Quem pode ASSISTIR o vídeo de uma aula (regra PURA, RN-114). Única porta de entrada para o
 * token, a playlist e a chave: mudar a regra é mudar AQUI. Os dados vêm de `acessoDaAula`
 * (src/lib/video/acesso-aula.ts), sempre do criador do HOST.
 *
 * - Equipe (DONO, ADMIN; SUPER_ADMIN conta como DONO): sempre (confere o vídeo no admin).
 * - ALUNO: matrícula valendo agora no produto da aula (ATIVA e não expirada) + produto
 *   PUBLICADO ou NÃO LISTADO + módulo PUBLICADO + aula liberada (`liberaEm` nula ou já passada).
 */
export interface QuemAssiste {
  /** Papel efetivo no criador do host (`papelEfetivo`); nulo = sem vínculo. */
  papel: PapelCriador | null;
  /** Matrícula valendo AGORA no produto da aula (`matriculaAtiva`). */
  matriculaAtiva: boolean;
}

export interface AulaAssistida {
  /** Liberação programada (drip). */
  liberaEm: Date | null;
  statusProduto: StatusProduto;
  statusModulo: StatusModulo;
}

export function podeAssistir(quem: QuemAssiste, aula: AulaAssistida, agora: Date = new Date()): boolean {
  if (quem.papel === "DONO" || quem.papel === "ADMIN") return true;
  if (quem.papel !== "ALUNO" || !quem.matriculaAtiva) return false;
  if (aula.statusProduto === "RASCUNHO" || aula.statusModulo !== "PUBLICADO") return false;
  if (aula.liberaEm && aula.liberaEm.getTime() > agora.getTime()) return false;
  // TODO(passo 5): pré-requisito por progresso (`pre_requisito_aula_id` concluída) — ainda não há progresso.
  return true;
}
