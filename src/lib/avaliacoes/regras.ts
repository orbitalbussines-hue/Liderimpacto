import type { PapelCriador, StatusAvaliacao, StatusModulo, StatusProduto, TipoAvaliacao, TipoQuestao } from "@/lib/db/schema/_enums";
import type { CorrecaoQuestao, OrdemTentativa } from "@/lib/db/schema/avaliacoes";

/**
 * Regras PURAS das avaliações (RN-123 a RN-125), testadas em regras.test.ts. Servidor e tela usam
 * as mesmas. Nada aqui lê banco.
 */

/** Ids das opções por POSIÇÃO ("a".."h"): a tela não escolhe id. */
export const IDS_OPCOES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const OPCOES_VF = ["Verdadeiro", "Falso"] as const;

export const ROTULO_TIPO_AVALIACAO: Record<TipoAvaliacao, string> = { QUIZ: "Quiz", PROVA: "Prova", SIMULADO: "Simulado" };
export const ROTULO_TIPO_QUESTAO: Record<TipoQuestao, string> = { UNICA: "Única escolha", MULTIPLA: "Múltipla escolha", VERDADEIRO_FALSO: "Verdadeiro ou falso" };

export interface QuestaoCorrigivel {
  id: string;
  tipo: TipoQuestao;
  gabarito: readonly string[];
  peso: number;
}

const mesmoConjunto = (a: readonly string[], b: readonly string[]) => {
  const x = new Set(a);
  return x.size === new Set(b).size && b.every((v) => x.has(v));
};

/**
 * Questão certa? UNICA e VERDADEIRO_FALSO: a opção marcada é a do gabarito. MULTIPLA: o conjunto
 * marcado é EXATAMENTE o do gabarito (faltar ou sobrar uma = errada; sem ponto parcial — RN-124).
 */
export function questaoCorreta(q: QuestaoCorrigivel, marcadas: readonly string[] | undefined): boolean {
  if (!marcadas || marcadas.length === 0) return false;
  if (q.tipo !== "MULTIPLA" && marcadas.length !== 1) return false;
  return mesmoConjunto(marcadas, q.gabarito);
}

/** Nota 0–100 com UMA casa (meio para cima), em aritmética inteira (sem 66,66666). */
export function notaComUmaCasa(pontos: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((pontos * 1000) / total) / 10;
}

/** Corrige no servidor: nota ponderada pelos pesos e a correção congelada de cada questão. */
export function corrigir(questoes: readonly QuestaoCorrigivel[], respostas: Readonly<Record<string, readonly string[]>>): { nota: number; correcao: CorrecaoQuestao[] } {
  const correcao = questoes.map((q) => ({ q: q.id, correta: questaoCorreta(q, respostas[q.id]), peso: q.peso }));
  const total = correcao.reduce((s, c) => s + c.peso, 0);
  const pontos = correcao.reduce((s, c) => s + (c.correta ? c.peso : 0), 0);
  return { nota: notaComUmaCasa(pontos, total), correcao };
}

export const aprovou = (nota: number, notaMinima: number) => nota >= notaMinima;

/** Fisher–Yates. `aleatorio` injetável no teste. */
export function embaralhar<T>(lista: readonly T[], aleatorio: () => number = Math.random): T[] {
  const r = [...lista];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** Ordem da tentativa: na ordem do cadastro, ou sorteada (questões e opções; V/F nunca troca). */
export function montarOrdem(
  questoes: readonly { id: string; tipo: TipoQuestao; opcoes: readonly { id: string }[] }[],
  sortear: boolean,
  aleatorio: () => number = Math.random,
): OrdemTentativa[] {
  const ordem = questoes.map((q) => ({
    q: q.id,
    o: sortear && q.tipo !== "VERDADEIRO_FALSO" ? embaralhar(q.opcoes.map((o) => o.id), aleatorio) : q.opcoes.map((o) => o.id),
  }));
  return sortear ? embaralhar(ordem, aleatorio) : ordem;
}

/** Tentativas que ainda restam (`null` = ilimitado). Base + concessões − finalizadas. */
export function tentativasRestantes(tentativasMax: number, extras: number, finalizadas: number): number | null {
  if (tentativasMax === 0) return null;
  return Math.max(0, tentativasMax + extras - finalizadas);
}

/**
 * Gabarito e explicação no resultado (RN-124): QUIZ e SIMULADO mostram logo depois da correção
 * (são para aprender/treinar). PROVA só mostra quando não dá mais para tentar de novo: aprovado
 * ou sem tentativas restantes. Certa/errada aparece sempre.
 */
export function revelaGabarito(tipo: TipoAvaliacao, aprovado: boolean, restantes: number | null): boolean {
  if (tipo !== "PROVA") return true;
  return aprovado || restantes === 0;
}

/**
 * Por que o membro não pode INICIAR uma tentativa agora (null = pode). Ordem em que a tela explica:
 * INDISPONIVEL (rascunho, curso em rascunho, módulo oculto, sem vínculo) → MATRICULA →
 * MODULO_BLOQUEADO (avaliação anterior não aprovada) → AULAS_PENDENTES → TENTATIVAS_ESGOTADAS.
 * Equipe (DONO/ADMIN) sempre pode (prévia; sem limite de tentativas).
 * Com uma tentativa ABERTA, o caminho é retomá-la (não conta como nova).
 */
export type MotivoAvaliacao = "INDISPONIVEL" | "MATRICULA" | "MODULO_BLOQUEADO" | "AULAS_PENDENTES" | "TENTATIVAS_ESGOTADAS";

export interface DadosDisponibilidade {
  papel: PapelCriador | null;
  temVinculo: boolean;
  status: StatusAvaliacao;
  statusProduto: StatusProduto;
  /** Nulo = avaliação do produto (sem módulo). */
  statusModulo: StatusModulo | null;
  matriculaValendo: boolean;
  moduloTravado: boolean;
  exigeAulasConcluidas: boolean;
  aulasPendentes: number;
  temAberta: boolean;
  restantes: number | null;
}

export function motivoDaAvaliacao(d: DadosDisponibilidade): MotivoAvaliacao | null {
  if (!d.temVinculo) return "INDISPONIVEL";
  if (d.papel === "DONO" || d.papel === "ADMIN") return null;
  if (d.status !== "PUBLICADA" || d.statusProduto === "RASCUNHO" || (d.statusModulo !== null && d.statusModulo !== "PUBLICADO")) return "INDISPONIVEL";
  if (!d.matriculaValendo) return "MATRICULA";
  if (d.temAberta) return null;
  if (d.moduloTravado) return "MODULO_BLOQUEADO";
  if (d.exigeAulasConcluidas && d.aulasPendentes > 0) return "AULAS_PENDENTES";
  if (d.restantes === 0) return "TENTATIVAS_ESGOTADAS";
  return null;
}

export const TEXTO_MOTIVO_AVALIACAO: Record<MotivoAvaliacao, string> = {
  INDISPONIVEL: "Indisponível",
  MATRICULA: "Matricule-se no curso",
  MODULO_BLOQUEADO: "Seja aprovado na avaliação anterior",
  AULAS_PENDENTES: "Conclua as aulas antes",
  TENTATIVAS_ESGOTADAS: "Tentativas esgotadas",
};

/** "92" ou "92,5". */
export const formatarNota = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

/** "10 questões · 15 min · nota mínima 70%" (sem limite: "sem limite de tempo"). */
export function metaDaAvaliacao(a: { questoes: number; tempoLimiteMin: number | null; notaMinima: number }): string {
  const q = `${a.questoes} ${a.questoes === 1 ? "questão" : "questões"}`;
  const t = a.tempoLimiteMin ? `${a.tempoLimiteMin} min` : "sem limite de tempo";
  return `${q} · ${t} · nota mínima ${a.notaMinima}%`;
}

export type SituacaoAvaliacaoAluno = "CONCLUIDA" | "EM_ANDAMENTO" | "DISPONIVEL" | "BLOQUEADA";

/** Status e botão do card da tela 6 ("Concluída · 92%" / "Disponível" / "Bloqueada"). */
export function cardDaAvaliacao(a: { aprovada: boolean; melhorNota: number | null; temAberta: boolean; motivo: MotivoAvaliacao | null; tentou: boolean }): {
  situacao: SituacaoAvaliacaoAluno;
  rotulo: string;
  cta: string | null;
} {
  // Tentativa aberta vem primeiro: quem ja foi aprovado e refaz para subir a nota precisa do "Continuar".
  if (a.temAberta)
    return {
      situacao: "EM_ANDAMENTO",
      rotulo: a.aprovada ? `Em andamento · aprovado com ${formatarNota(a.melhorNota ?? 0)}%` : "Em andamento",
      cta: "Continuar",
    };
  if (a.aprovada) return { situacao: "CONCLUIDA", rotulo: `Concluída · ${formatarNota(a.melhorNota ?? 0)}%`, cta: "Ver resultado" };
  if (a.motivo) return { situacao: "BLOQUEADA", rotulo: `Bloqueada · ${TEXTO_MOTIVO_AVALIACAO[a.motivo]}`, cta: a.tentou ? "Ver resultado" : null };
  return { situacao: "DISPONIVEL", rotulo: a.tentou ? `Disponível · melhor nota ${formatarNota(a.melhorNota ?? 0)}%` : "Disponível", cta: a.tentou ? "Tentar de novo" : "Iniciar" };
}

/** Segundos que faltam até o prazo (null = sem limite; 0 = esgotado). */
export function segundosRestantes(prazo: Date | null, agora: Date): number | null {
  if (!prazo) return null;
  return Math.max(0, Math.floor((prazo.getTime() - agora.getTime()) / 1000));
}

export const prazoEstourado = (prazo: Date | null, agora: Date) => prazo !== null && agora.getTime() >= prazo.getTime();
