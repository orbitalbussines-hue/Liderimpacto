import type { TipoItemTrilha } from "@/lib/db/schema/_enums";
import type { MotivoAvaliacao } from "@/lib/avaliacoes/regras";

/**
 * Regras PURAS das trilhas (RN-126), testadas em regras.test.ts: estado de cada item (na ordem),
 * progresso, CTA e próximo passo. Os dados vêm de src/lib/trilhas/consultas.ts.
 */

export type EstadoItemTrilha = "concluido" | "andamento" | "disponivel" | "bloqueado";

/** ANTERIOR = conclua o item anterior; MATRICULA = "Matricule-se"; os de avaliação vêm de `motivoDaAvaliacao`. */
export type MotivoItemTrilha = "ANTERIOR" | "MATRICULA" | "INDISPONIVEL" | Exclude<MotivoAvaliacao, "INDISPONIVEL" | "MATRICULA">;

export const TEXTO_MOTIVO_ITEM: Record<MotivoItemTrilha, string> = {
  ANTERIOR: "Conclua a etapa anterior",
  MATRICULA: "Matricule-se",
  INDISPONIVEL: "Indisponível",
  MODULO_BLOQUEADO: "Seja aprovado na avaliação anterior",
  AULAS_PENDENTES: "Conclua as aulas antes",
  TENTATIVAS_ESGOTADAS: "Tentativas esgotadas",
};

/** O que cada item sabe por si (sem olhar os vizinhos). */
export interface DadosItemTrilha {
  tipo: TipoItemTrilha;
  exigeAnterior: boolean;
  concluido: boolean;
  /** Começou e não terminou (progresso > 0, ou tentativa sem aprovação). */
  iniciado: boolean;
  /** Motivo próprio de não poder começar (`null` = pode). */
  motivoProprio: Exclude<MotivoItemTrilha, "ANTERIOR"> | null;
}

export function estadosDaTrilha(itens: readonly DadosItemTrilha[]): { estado: EstadoItemTrilha; motivo: MotivoItemTrilha | null }[] {
  return itens.map((it, i) => {
    if (it.concluido) return { estado: "concluido", motivo: null };
    if (it.exigeAnterior && i > 0 && !itens[i - 1].concluido) return { estado: "bloqueado", motivo: "ANTERIOR" };
    if (it.motivoProprio) return { estado: "bloqueado", motivo: it.motivoProprio };
    return { estado: it.iniciado ? "andamento" : "disponivel", motivo: null };
  });
}

/** "Continuar" (algo feito ou começado), "Iniciar" (nada) ou "Rever" (tudo concluído). */
export function ctaDaTrilha(estados: readonly { estado: EstadoItemTrilha }[]): "Iniciar" | "Continuar" | "Rever" {
  if (estados.length > 0 && estados.every((e) => e.estado === "concluido")) return "Rever";
  return estados.some((e) => e.estado === "concluido" || e.estado === "andamento") ? "Continuar" : "Iniciar";
}

/** Índice do próximo passo: o primeiro não concluído que dá para fazer; senão o primeiro não concluído; `-1` = tudo feito. */
export function indiceDoProximoPasso(estados: readonly { estado: EstadoItemTrilha }[]): number {
  const livre = estados.findIndex((e) => e.estado === "andamento" || e.estado === "disponivel");
  return livre >= 0 ? livre : estados.findIndex((e) => e.estado !== "concluido");
}

/** "3 de 5 etapas". */
export const textoEtapas = (concluidas: number, total: number) => `${concluidas} de ${total} ${total === 1 ? "etapa" : "etapas"}`;
