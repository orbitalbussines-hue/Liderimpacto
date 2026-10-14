/**
 * Regras PURAS do Analytics do admin (/admin/analytics): leitura da URL, taxas, variação em
 * pontos percentuais, abandono por aula, matriz de coortes e CSV. Sem banco, testadas em
 * regras.test.ts. Definição de cada métrica: docs/back.md (Analytics) e RN-139.
 * Período (`?de=&ate=`, `src/lib/painel/periodo.ts`) e variação relativa vêm do painel.
 */
import { PERCENTUAL_CONCLUSAO } from "@/lib/progresso/regras";
import type { Intervalo } from "@/lib/painel/periodo";

export const ABAS_ANALYTICS = [
  { valor: "visao-geral", rotulo: "Visão geral" },
  { valor: "conteudo", rotulo: "Conteúdo" },
  { valor: "retencao", rotulo: "Retenção" },
  { valor: "avaliacoes", rotulo: "Avaliações" },
] as const;
export type AbaAnalytics = (typeof ABAS_ANALYTICS)[number]["valor"];

/** Abandono = começou e não chegou a 90% (o mesmo corte da conclusão automática). */
export const LIMIAR_ABANDONO = PERCENTUAL_CONCLUSAO;
/** Coortes: as últimas 8 semanas (segunda a domingo, Brasília), a atual inclusive. */
export const SEMANAS_COORTE = 8;
/** Coorte com menos alunos que isto ganha o selo "amostra pequena". */
export const COORTE_PEQUENA = 5;

type Valor = string | string[] | undefined;

export function lerAba(v: Valor): AbaAnalytics {
  return ABAS_ANALYTICS.find((a) => a.valor === v)?.valor ?? "visao-geral";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `?curso=<uuid>`; qualquer outra coisa = todos os cursos. Quem confere se é do criador é a consulta. */
export const lerCurso = (v: Valor): string | null => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);

export type OrdemConteudo = "abandono" | "estrutura";
export const lerOrdem = (v: Valor): OrdemConteudo => (v === "estrutura" ? "estrutura" : "abandono");

export interface FiltrosAnalytics {
  aba: AbaAnalytics;
  periodo: Pick<Intervalo, "de" | "ate">;
  curso: string | null;
  ordem?: OrdemConteudo;
}

/** Query string dos filtros (sem os padrões), para links e para o CSV. */
export function consulta(f: FiltrosAnalytics): string {
  const p = new URLSearchParams();
  if (f.aba !== "visao-geral") p.set("aba", f.aba);
  p.set("de", f.periodo.de);
  p.set("ate", f.periodo.ate);
  if (f.curso) p.set("curso", f.curso);
  if (f.ordem === "estrutura") p.set("ordem", "estrutura");
  return p.toString();
}

/** Razão 0..1; base zero = nula (sem "0%" falso). */
export const taxa = (parte: number, total: number): number | null => (total > 0 ? parte / total : null);

const umaCasa = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Variação de uma TAXA em pontos percentuais ("↗ +5,0 p.p."). Sem base em algum lado = "—". */
export function variacaoEmPontos(atual: number | null, anterior: number | null): { texto: string; leitor: string; tom: "ok" | "warn" | "neutro" } {
  if (atual === null || anterior === null) return { texto: "—", leitor: "sem base para comparar", tom: "neutro" };
  const pp = Math.round((atual - anterior) * 1000) / 10;
  if (pp === 0) return { texto: "→ 0 p.p.", leitor: "sem variação", tom: "neutro" };
  const n = umaCasa.format(Math.abs(pp));
  return pp > 0
    ? { texto: `↗ +${n} p.p.`, leitor: `alta de ${n} pontos percentuais`, tom: "ok" }
    : { texto: `↘ −${n} p.p.`, leitor: `queda de ${n} pontos percentuais`, tom: "warn" };
}

/** "1.234 h", "12,5 h", "45 min", "0 min". */
export function formatarHoras(segundos: number): string {
  if (segundos < 3600) return `${Math.floor(segundos / 60)} min`;
  const h = segundos / 3600;
  return h >= 100 ? `${new Intl.NumberFormat("pt-BR").format(Math.round(h))} h` : `${umaCasa.format(h)} h`;
}

/** Tempo médio de uma aula: "4 min 05 s", "38 s". */
export function formatarDuracao(segundos: number): string {
  const s = Math.round(segundos);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

// ---------------------------------------------------------------- Conteúdo

export interface AulaAnalytics {
  aulaId: string;
  produtoId: string;
  curso: string;
  /** "2.3": módulo publicado . aula viva (como o aluno vê). */
  numero: string;
  titulo: string;
  /** Posição no curso (ordem do módulo e da aula) para a ordenação por estrutura. */
  posicao: number;
  iniciaram: number;
  concluiram: number;
  /** Começaram e não estão concluídos (abaixo de 90%). */
  pararam: number;
  /** Média dos segundos ÚNICOS assistidos entre quem começou. */
  tempoMedioSeg: number;
}

export const abandono = (a: Pick<AulaAnalytics, "pararam" | "iniciaram">) => taxa(a.pararam, a.iniciaram);

/** Aula com a MAIOR taxa de abandono (empate: mais gente parada). Ninguém começou = nula. */
export function maiorQueda<T extends Pick<AulaAnalytics, "pararam" | "iniciaram">>(aulas: readonly T[]): T | null {
  let melhor: T | null = null;
  for (const a of aulas) {
    const t = abandono(a);
    if (t === null || a.pararam === 0) continue;
    const tm = melhor ? abandono(melhor)! : -1;
    if (t > tm || (t === tm && a.pararam > melhor!.pararam)) melhor = a;
  }
  return melhor;
}

/** Ordena a tabela: maior abandono primeiro (sem dado por último) ou a ordem do curso. */
export function ordenarAulas(aulas: readonly AulaAnalytics[], ordem: OrdemConteudo): AulaAnalytics[] {
  const copia = [...aulas];
  const doCurso = (a: AulaAnalytics, b: AulaAnalytics) => a.curso.localeCompare(b.curso, "pt-BR") || a.produtoId.localeCompare(b.produtoId) || a.posicao - b.posicao;
  if (ordem === "estrutura") return copia.sort(doCurso);
  return copia.sort((a, b) => (abandono(b) ?? -1) - (abandono(a) ?? -1) || b.pararam - a.pararam || doCurso(a, b));
}

// ---------------------------------------------------------------- Retenção

export interface LinhaCoorte {
  /** Segunda-feira da semana de entrada (AAAA-MM-DD). */
  semana: string;
  tamanho: number;
  /** Semanas desde a entrada (0 = a própria) → alunos com atividade naquela semana. */
  ativosPorSemana: Record<number, number>;
}

export interface Coorte {
  semana: string;
  tamanho: number;
  pequena: boolean;
  /** Índice = semanas desde a entrada; nula = semana ainda não chegou. */
  celulas: ({ ativos: number; taxa: number | null } | null)[];
}

/**
 * Matriz de coortes: `linhas` já vêm com as 8 semanas (a mais antiga primeiro, a atual por
 * último). A coorte i (0 = mais antiga) tem 8 − i semanas observáveis, a atual inclusive.
 */
export function montarCoortes(linhas: readonly LinhaCoorte[]): Coorte[] {
  const n = linhas.length;
  return linhas.map((l, i) => ({
    semana: l.semana,
    tamanho: l.tamanho,
    pequena: l.tamanho > 0 && l.tamanho < COORTE_PEQUENA,
    celulas: Array.from({ length: n }, (_, k) => {
      if (k >= n - i) return null;
      const ativos = l.ativosPorSemana[k] ?? 0;
      return { ativos, taxa: taxa(ativos, l.tamanho) };
    }),
  }));
}

/** Faixa de intensidade 0..4 do mapa de calor (a cor só reforça: o número vai escrito). */
export const faixaDeCalor = (t: number | null): 0 | 1 | 2 | 3 | 4 => (t === null || t === 0 ? 0 : t < 0.25 ? 1 : t < 0.5 ? 2 : t < 0.75 ? 3 : 4);

// ---------------------------------------------------------------- CSV

/**
 * CSV para o Excel em PT-BR: `;` separa, vírgula decimal, BOM UTF-8, CRLF. Texto que começa com
 * `= + - @` (título de curso é texto livre) ganha `'` na frente: não vira fórmula na planilha.
 */
export function gerarCsv(cabecalho: readonly string[], linhas: readonly (readonly (string | number | null)[])[]): string {
  const celula = (v: string | number | null) => {
    if (v === null) return "";
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, "").replace(".", ",");
    const t = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return `﻿${[cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n")}\r\n`;
}
