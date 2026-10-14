import type { PapelCriador } from "@/lib/db/schema/_enums";

/**
 * Quem pode ASSISTIR o vídeo de uma aula (regra PURA, RN-114). Única porta de entrada para o
 * token, a playlist e a chave: mudar a regra é mudar AQUI.
 *
 * Nesta fase: só a equipe do criador (DONO, ADMIN; SUPER_ADMIN conta como DONO) confere o vídeo
 * no admin. O passo 4 acrescenta o ALUNO com matrícula ativa no produto e a aula liberada
 * (drip e pré-requisito): os campos já existem no tipo para o teste do passo 4 nascer pronto.
 */
export interface QuemAssiste {
  /** Papel efetivo no criador do host (`papelEfetivo`); nulo = sem vínculo. */
  papel: PapelCriador | null;
  /** Passo 4: matrícula ativa no produto da aula. */
  matriculaAtiva?: boolean;
}

export interface AulaAssistida {
  /** Liberação programada (drip). */
  liberaEm: Date | null;
}

export function podeAssistir(quem: QuemAssiste, aula: AulaAssistida, agora: Date = new Date()): boolean {
  if (quem.papel === "DONO" || quem.papel === "ADMIN") return true;
  // TODO(passo 4): ALUNO com matrícula ativa e aula liberada (libera_em <= agora e pré-requisito concluído).
  void aula;
  void agora;
  return false;
}
