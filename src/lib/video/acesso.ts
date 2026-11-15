import type { PapelCriador, StatusModulo, StatusProduto } from "@/lib/db/schema/_enums";
import { liberacaoEfetiva, type LiberacaoDaAula } from "./liberacao";

/**
 * Quem pode ASSISTIR uma aula (regra PURA, RN-114 + RN-118). Única porta de entrada para o
 * token, a playlist, a chave, o progresso, os materiais e o estado das aulas nas telas do aluno:
 * mudar a regra é mudar AQUI. Os dados vêm de `acessoDaAula` (src/lib/video/acesso-aula.ts) ou
 * das consultas de src/lib/progresso/, sempre do criador do HOST.
 *
 * - Equipe (DONO, ADMIN; SUPER_ADMIN conta como DONO): sempre (confere o vídeo no admin).
 * - ALUNO: produto PUBLICADO ou NÃO LISTADO + módulo PUBLICADO + matrícula valendo agora no
 *   produto (ATIVA e não expirada) + aula liberada (`liberacaoEfetiva`: na data, ou N dias depois
 *   da `iniciada_em` DESTA matrícula, RN-274) + aprovado nas
 *   avaliações que liberam o módulo (passo 7, RN-125) + aula pré-requisito concluída (quando
 *   houver e ainda existir publicada).
 */
export interface QuemAssiste {
  /** Papel efetivo no criador do host (`papelEfetivo`); nulo = sem vínculo. */
  papel: PapelCriador | null;
  /**
   * Matrícula VIVA valendo AGORA no produto da aula (`matriculaValendo`), com o início que conta o
   * calendário "X dias depois da matrícula"; nula = sem matrícula valendo.
   */
  matricula: { iniciadaEm: Date } | null;
}

/** Liberação (`liberaEm` = numa data; `liberaAposDias` = N dias depois da matrícula, RN-274). */
export interface AulaAssistida extends LiberacaoDaAula {
  statusProduto: StatusProduto;
  statusModulo: StatusModulo;
  /** Sem pré-requisito, pré-requisito removido/oculto, ou concluído por quem pede. */
  preRequisitoCumprido: boolean;
  /**
   * Há avaliação PUBLICADA com "libera o próximo módulo" num módulo publicado ANTERIOR ao desta
   * aula, ainda não aprovada por quem pede (`avaliacaoPendenteSql`, src/lib/avaliacoes/sql.ts).
   */
  avaliacaoPendente: boolean;
}

/**
 * Por que a aula está fechada para quem pede (na ordem em que a tela explica):
 * INDISPONIVEL (sem vínculo, produto em rascunho ou módulo oculto) → MATRICULA → LIBERACAO →
 * AVALIACAO (módulo anterior com avaliação não aprovada) → PRE_REQUISITO. `null` = pode assistir.
 */
export type MotivoBloqueio = "INDISPONIVEL" | "MATRICULA" | "LIBERACAO" | "AVALIACAO" | "PRE_REQUISITO";

export function motivoDoBloqueio(quem: QuemAssiste, aula: AulaAssistida, agora: Date = new Date()): MotivoBloqueio | null {
  if (quem.papel === "DONO" || quem.papel === "ADMIN") return null;
  if (quem.papel !== "ALUNO" || aula.statusProduto === "RASCUNHO" || aula.statusModulo !== "PUBLICADO") return "INDISPONIVEL";
  if (!quem.matricula) return "MATRICULA";
  const libera = liberacaoEfetiva(aula, quem.matricula.iniciadaEm);
  if (libera && libera.getTime() > agora.getTime()) return "LIBERACAO";
  if (aula.avaliacaoPendente) return "AVALIACAO";
  if (!aula.preRequisitoCumprido) return "PRE_REQUISITO";
  return null;
}

export const podeAssistir = (quem: QuemAssiste, aula: AulaAssistida, agora: Date = new Date()): boolean =>
  motivoDoBloqueio(quem, aula, agora) === null;
