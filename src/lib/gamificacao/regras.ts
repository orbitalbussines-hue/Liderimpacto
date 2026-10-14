/**
 * Regras PURAS da gamificação (ADR-0012, RN-144 a RN-147): níveis, períodos do ranking e o que
 * cada motivo vale. Sem banco; testadas em regras.test.ts. Servidor e tela usam as MESMAS.
 */
import { z } from "zod";
import type { MotivoPontos } from "@/lib/db/schema/_enums";
import { NIVEIS_PADRAO, PONTOS_PADRAO, type NivelGamificacao } from "./padroes";

export { NIVEIS_PADRAO, PONTOS_PADRAO, type NivelGamificacao };

/** Motivos concedidos pelo sistema (o valor sai da configuração do criador). */
export type MotivoAutomatico = Extract<MotivoPontos, "AULA_CONCLUIDA" | "CURSO_CONCLUIDO" | "AVALIACAO_APROVADA" | "PUBLICACAO_COMUNIDADE">;

/** Coluna de `criadores_gamificacao` com o valor de cada motivo automático (nome fixo, nunca de fora). */
export const COLUNA_DO_MOTIVO: Record<MotivoAutomatico, string> = {
  AULA_CONCLUIDA: "pontos_aula_concluida",
  CURSO_CONCLUIDO: "pontos_curso_concluido",
  AVALIACAO_APROVADA: "pontos_avaliacao_aprovada",
  PUBLICACAO_COMUNIDADE: "pontos_publicacao_comunidade",
};

export const ROTULO_DO_MOTIVO: Record<MotivoPontos, string> = {
  AULA_CONCLUIDA: "Aula concluída",
  CURSO_CONCLUIDO: "Curso concluído",
  AVALIACAO_APROVADA: "Avaliação aprovada",
  PUBLICACAO_COMUNIDADE: "Publicação na comunidade",
  DESAFIO_CONCLUIDO: "Desafio concluído",
  AJUSTE_MANUAL: "Ajuste da equipe",
};

/** Lista de níveis: 1 a 10, nomes de 2 a 30 caracteres, o primeiro em 0 e mínimos estritamente crescentes. */
export const esquemaNiveis = z
  .array(z.strictObject({ nome: z.string().trim().min(2, "Nome do nível com 2 a 30 caracteres.").max(30, "Nome do nível com 2 a 30 caracteres."), minimo: z.number().int().min(0).max(1_000_000) }))
  .min(1, "Pelo menos um nível.")
  .max(10, "No máximo 10 níveis.")
  .refine((n) => n[0]?.minimo === 0, "O primeiro nível começa em 0 ponto.")
  .refine((n) => n.every((x, i) => i === 0 || x.minimo > n[i - 1].minimo), "Os pontos mínimos precisam crescer de um nível para o seguinte.");

export interface NivelDoMembro {
  atual: NivelGamificacao;
  /** Nulo = já está no último nível. */
  proximo: NivelGamificacao | null;
  /** Pontos que faltam para o próximo (0 no último). */
  faltam: number;
  /** 0..1 dentro do nível atual (1 no último). */
  progresso: number;
}

/** Nível pelo saldo (saldo negativo por ajuste fica no primeiro nível). */
export function nivelDoMembro(pontos: number, niveis: readonly NivelGamificacao[] = NIVEIS_PADRAO): NivelDoMembro {
  const lista = niveis.length > 0 ? niveis : NIVEIS_PADRAO;
  let i = 0;
  while (i + 1 < lista.length && pontos >= lista[i + 1].minimo) i++;
  const atual = lista[i];
  const proximo = lista[i + 1] ?? null;
  if (!proximo) return { atual, proximo: null, faltam: 0, progresso: 1 };
  const faixa = proximo.minimo - atual.minimo;
  return { atual, proximo, faltam: proximo.minimo - Math.max(pontos, atual.minimo), progresso: Math.min(1, Math.max(0, (pontos - atual.minimo) / faixa)) };
}

/** Situação efetiva do desafio para a tela: EM_BREVE, ATIVO (aceita progresso) ou ENCERRADO. */
export type MomentoDoDesafio = "EM_BREVE" | "ATIVO" | "ENCERRADO";

export function momentoDoDesafio(d: { inicioEm: Date; fimEm: Date; situacao: string }, agora: Date): MomentoDoDesafio {
  if (d.situacao === "ENCERRADO" || agora.getTime() >= d.fimEm.getTime()) return "ENCERRADO";
  return agora.getTime() < d.inicioEm.getTime() ? "EM_BREVE" : "ATIVO";
}

/** Ranking: semana (segunda a domingo, Brasília), mês (do dia 1, Brasília) ou desde sempre. */
export const PERIODOS_RANKING = ["semana", "mes", "total"] as const;
export type PeriodoRanking = (typeof PERIODOS_RANKING)[number];
export const lerPeriodoRanking = (v: unknown): PeriodoRanking => (PERIODOS_RANKING as readonly unknown[]).includes(v) ? (v as PeriodoRanking) : "semana";
