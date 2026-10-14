/**
 * Padrões da gamificação (RN-144), sem dependência: o schema (default das colunas) e as regras
 * (tela e servidor) leem daqui.
 */

export interface NivelGamificacao {
  nome: string;
  /** Pontos mínimos (o primeiro nível é sempre 0). */
  minimo: number;
}

export const NIVEIS_PADRAO: readonly NivelGamificacao[] = [
  { nome: "Iniciante", minimo: 0 },
  { nome: "Aprendiz", minimo: 100 },
  { nome: "Praticante", minimo: 300 },
  { nome: "Líder", minimo: 700 },
  { nome: "Referência", minimo: 1500 },
];

export const PONTOS_PADRAO = { aulaConcluida: 10, cursoConcluido: 100, avaliacaoAprovada: 30, publicacaoComunidade: 2 } as const;
