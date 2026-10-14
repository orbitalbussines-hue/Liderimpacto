/**
 * Regras PURAS do painel do admin (passo 6): período, variação contra o período anterior,
 * tempo relativo e a frase de cada evento do "Acontecendo agora". Sem banco, testadas em
 * regras.test.ts. Definição de cada métrica: docs/back.md (Painel) e RN-122.
 */

export const DIAS_PERIODO = [7, 30, 90] as const;
export type DiasPeriodo = (typeof DIAS_PERIODO)[number];
export const PERIODO_PADRAO: DiasPeriodo = 30;

/** `?periodo=7|30|90`; qualquer outra coisa (ausente, lixo, lista) = 30. */
export function lerPeriodo(valor: string | string[] | undefined): DiasPeriodo {
  const n = typeof valor === "string" && /^\d{1,2}$/.test(valor) ? Number(valor) : NaN;
  return DIAS_PERIODO.find((d) => d === n) ?? PERIODO_PADRAO;
}

export type Variacao =
  | { tipo: "alta" | "queda"; percentual: number }
  | { tipo: "igual" }
  /** Período anterior zerado e atual > 0: não existe % (seria infinito). */
  | { tipo: "novo" }
  /** Os dois zerados. */
  | { tipo: "sem-dados" };

export function variacao(atual: number, anterior: number): Variacao {
  if (anterior === 0) return atual === 0 ? { tipo: "sem-dados" } : { tipo: "novo" };
  if (atual === anterior) return { tipo: "igual" };
  const percentual = ((atual - anterior) / anterior) * 100;
  return { tipo: percentual > 0 ? "alta" : "queda", percentual: Math.abs(percentual) };
}

const umaCasa = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "39,1%" (taxa 0..1). */
export const formatarTaxa = (taxa: number) => `${umaCasa.format(taxa * 100)}%`;

/**
 * Texto VISÍVEL da variação: seta + sinal + número (a cor só reforça). "↗ +12,5%", "↘ −51,9%",
 * "→ 0%", "novo", "—". `leitor` é a versão por extenso para leitor de tela.
 */
export function textoDaVariacao(v: Variacao): { texto: string; leitor: string; tom: "ok" | "warn" | "neutro" } {
  switch (v.tipo) {
    case "alta":
      return { texto: `↗ +${umaCasa.format(v.percentual)}%`, leitor: `alta de ${umaCasa.format(v.percentual)}%`, tom: "ok" };
    case "queda":
      return { texto: `↘ −${umaCasa.format(v.percentual)}%`, leitor: `queda de ${umaCasa.format(v.percentual)}%`, tom: "warn" };
    case "igual":
      return { texto: "→ 0%", leitor: "sem variação", tom: "neutro" };
    case "novo":
      return { texto: "novo", leitor: "novo: nada no período anterior", tom: "ok" };
    case "sem-dados":
      return { texto: "—", leitor: "sem dados nos dois períodos", tom: "neutro" };
  }
}

const FUSO = "America/Sao_Paulo";
const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "agora", "há 5 min", "há 3 h"; de um dia para trás, "21/09 · 14:44" (horário de Brasília). */
export function tempoRelativo(quando: Date, agora: Date): string {
  const min = Math.floor((agora.getTime() - quando.getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`;
  const p = Object.fromEntries(dataHora.formatToParts(quando).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} · ${p.hour}:${p.minute}`;
}

/** "21/09" de uma data `AAAA-MM-DD` (eixo do gráfico). */
export const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/**
 * Evento do "Acontecendo agora" como sai do banco. SÓ nome, título e número: nunca e-mail,
 * token, IP ou o texto livre `detalhes` da trilha (que pode ter e-mail).
 */
export type EventoPainel =
  | { tipo: "matricula" | "reativacao"; quando: Date; pessoa: string; produto: string }
  | { tipo: "membro"; quando: Date; pessoa: string; papel: "DONO" | "ADMIN" | "ALUNO" }
  | { tipo: "publicacao"; quando: Date; pessoa: string | null; produto: string }
  | { tipo: "video"; quando: Date; aula: string }
  | { tipo: "conclusao"; quando: Date; pessoa: string; aula: string; numero: string | null };

/** Frase humana: `pessoa` em negrito + o resto. Sem pessoa (worker), o destaque é o fato. */
export function fraseDoEvento(e: EventoPainel): { destaque: string; texto: string; pessoa: string | null } {
  switch (e.tipo) {
    case "matricula":
      return { pessoa: e.pessoa, destaque: e.pessoa, texto: `recebeu matrícula em ${e.produto}` };
    case "reativacao":
      return { pessoa: e.pessoa, destaque: e.pessoa, texto: `teve a matrícula reativada em ${e.produto}` };
    case "membro":
      return {
        pessoa: e.pessoa,
        destaque: e.pessoa,
        texto: e.papel === "ALUNO" ? "entrou na área de membros" : `entrou na equipe como ${e.papel === "DONO" ? "Dono" : "Admin"}`,
      };
    case "publicacao":
      return e.pessoa
        ? { pessoa: e.pessoa, destaque: e.pessoa, texto: `publicou ${e.produto}` }
        : { pessoa: null, destaque: e.produto, texto: "foi publicado" };
    case "video":
      return { pessoa: null, destaque: "Vídeo pronto", texto: `na aula ${e.aula}` };
    case "conclusao":
      return { pessoa: e.pessoa, destaque: e.pessoa, texto: `concluiu a aula ${e.numero ? `${e.numero} · ` : ""}${e.aula}` };
  }
}
