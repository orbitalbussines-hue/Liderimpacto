/**
 * Período dos filtros do admin (painel, analytics e logs) e a matemática do calendário do
 * `SeletorDatas`. PURO (sem banco, sem relógio escondido: `hoje` = "AAAA-MM-DD" de Brasília
 * entra por parâmetro), testado em periodo.test.ts. Definição: docs/back.md (Painel e Analytics).
 *
 * URL: `?de=AAAA-MM-DD&ate=AAAA-MM-DD` (ambos inclusivos, dias de Brasília). Legado `?periodo=7|30|90`
 * = últimos N dias. Sem nada (ou inválido) = últimos 30 dias.
 */

export const FUSO = "America/Sao_Paulo";
/** Intervalo mais longo aceito (um ano bissexto inteiro). */
export const MAX_DIAS = 366;
export const DIAS_PADRAO = 30;
/** Acima disto os gráficos diários do Analytics agrupam por semana. */
export const MAX_DIAS_SERIE_DIARIA = 92;

export interface Intervalo {
  /** Primeiro dia (AAAA-MM-DD, Brasília), inclusivo. */
  de: string;
  /** Último dia, inclusivo. */
  ate: string;
  /** Quantidade de dias (`ate − de + 1`). */
  dias: number;
}

type Valor = string | string[] | undefined;
const DIA_MS = 86_400_000;
const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

const paraMs = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const deMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** "AAAA-MM-DD" que existe no calendário (2026-02-30 não; ano fora de 1970..9999 também não). */
export const dataValida = (v: unknown): v is string => typeof v === "string" && FORMATO.test(v) && v >= "1970" && deMs(paraMs(v)) === v;
export const somarDias = (d: string, n: number) => deMs(paraMs(d) + n * DIA_MS);
export const diasEntre = (de: string, ate: string) => Math.round((paraMs(ate) - paraMs(de)) / DIA_MS);

/** Mesmo dia `n` meses depois (ou antes); 31/05 − 3 meses = 28/02 (último dia do mês curto). */
export function somarMeses(d: string, n: number): string {
  const alvo = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return deMs(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(Number(d.slice(8, 10)), ultimo)));
}

/** Dia de hoje em Brasília ("AAAA-MM-DD"). Única função com relógio: as telas chamam e passam adiante. */
export const hojeEmBrasilia = (agora = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);

export const intervalo = (de: string, ate: string): Intervalo => ({ de, ate, dias: diasEntre(de, ate) + 1 });
export const ultimosDias = (n: number, hoje: string) => intervalo(somarDias(hoje, -(n - 1)), hoje);

/** O período anterior: o mesmo número de dias imediatamente antes de `de`. */
export const periodoAnterior = (i: Intervalo): Intervalo => intervalo(somarDias(i.de, -i.dias), somarDias(i.de, -1));

/**
 * `?de=&ate=` válidos (formato, data que existe, de ≤ ate ≤ hoje, no máximo 366 dias) ou nulo.
 * Os Logs usam direto (sem intervalo = desde o início); painel e analytics via `lerIntervalo`.
 */
export function lerIntervaloExplicito(p: { de?: Valor; ate?: Valor }, hoje: string): Intervalo | null {
  const { de, ate } = p;
  if (!dataValida(de) || !dataValida(ate) || de > ate || ate > hoje) return null;
  const i = intervalo(de, ate);
  return i.dias <= MAX_DIAS ? i : null;
}

/** Intervalo da URL; inválido/ausente cai no legado `?periodo=7|30|90` e, sem nada, nos últimos 30 dias. */
export function lerIntervalo(p: { de?: Valor; ate?: Valor; periodo?: Valor }, hoje: string): Intervalo {
  const legado = [7, 30, 90].find((n) => p.periodo === String(n));
  return lerIntervaloExplicito(p, hoje) ?? ultimosDias(legado ?? DIAS_PADRAO, hoje);
}

/** Gráfico diário com intervalo longo vira semanal (90 barras ainda cabem; 366 não). */
export const agrupamentoDaSerie = (dias: number): "dia" | "semana" => (dias > MAX_DIAS_SERIE_DIARIA ? "semana" : "dia");

// ---------------------------------------------------------------- atalhos

export const ATALHOS = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "ontem", rotulo: "Ontem" },
  { id: "7d", rotulo: "Últimos 7 dias" },
  { id: "30d", rotulo: "Últimos 30 dias" },
  { id: "90d", rotulo: "Últimos 90 dias" },
  { id: "este-mes", rotulo: "Este mês" },
  { id: "mes-passado", rotulo: "Mês passado" },
  { id: "3m", rotulo: "Últimos 3 meses" },
  { id: "6m", rotulo: "Últimos 6 meses" },
  { id: "12m", rotulo: "Últimos 12 meses" },
] as const;
export type Atalho = (typeof ATALHOS)[number]["id"];

const inicioDoMes = (d: string) => `${d.slice(0, 8)}01`;

export function intervaloDoAtalho(a: Atalho, hoje: string): Intervalo {
  switch (a) {
    case "hoje":
      return intervalo(hoje, hoje);
    case "ontem":
      return intervalo(somarDias(hoje, -1), somarDias(hoje, -1));
    case "7d":
      return ultimosDias(7, hoje);
    case "30d":
      return ultimosDias(30, hoje);
    case "90d":
      return ultimosDias(90, hoje);
    case "este-mes":
      return intervalo(inicioDoMes(hoje), hoje);
    case "mes-passado": {
      const fim = somarDias(inicioDoMes(hoje), -1);
      return intervalo(inicioDoMes(fim), fim);
    }
    case "3m":
    case "6m":
    case "12m":
      // Do dia seguinte ao "mesmo dia N meses atrás" até hoje (12 meses = 365 ou 366 dias).
      return intervalo(somarDias(somarMeses(hoje, -Number.parseInt(a, 10)), 1), hoje);
  }
}

/** Atalho que dá exatamente este intervalo (o primeiro da lista), para destacar. */
export function atalhoDoIntervalo(de: string, ate: string, hoje: string): Atalho | null {
  return ATALHOS.find(({ id }) => {
    const i = intervaloDoAtalho(id, hoje);
    return i.de === de && i.ate === ate;
  })?.id ?? null;
}

// ---------------------------------------------------------------- calendário e texto

export const DIAS_DA_SEMANA = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"] as const;

/** Mês `mes` (1..12): `null` nas casas antes do dia 1 para a semana começar na SEGUNDA. */
export function gradeDoMes(ano: number, mes: number): (string | null)[] {
  const primeiro = Date.UTC(ano, mes - 1, 1);
  const vazias = (new Date(primeiro).getUTCDay() + 6) % 7;
  const total = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return [...Array<null>(vazias).fill(null), ...Array.from({ length: total }, (_, i) => deMs(primeiro + i * DIA_MS))];
}

/** `{ ano, mes }` deslocado `n` meses. */
export function deslocarMes(m: { ano: number; mes: number }, n: number) {
  const t = m.ano * 12 + m.mes - 1 + n;
  return { ano: Math.floor(t / 12), mes: (t % 12) + 1 };
}

const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const porExtenso = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "Outubro 2026". */
export function tituloDoMes(m: { ano: number; mes: number }): string {
  const n = nomeMes.format(Date.UTC(m.ano, m.mes - 1, 1));
  return `${n[0].toUpperCase()}${n.slice(1)} ${m.ano}`;
}

/** "14 de outubro de 2026" (aria-label do dia). */
export const dataPorExtenso = (d: string) => porExtenso.format(paraMs(d));
/** "14/10/2026". */
export const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
/** "01/10/2026 a 14/10/2026" (um dia só: "14/10/2026"). */
export const textoDoIntervalo = (de: string, ate: string) => (de === ate ? dataCurta(de) : `${dataCurta(de)} a ${dataCurta(ate)}`);

/** Frase para a tela: "nos últimos 30 dias", "hoje", "de 01/09/2026 a 30/09/2026", "em 01/09/2026". */
export function frasePeriodo(i: Intervalo, hoje: string): string {
  if (i.ate === hoje) return i.dias === 1 ? "hoje" : `nos últimos ${i.dias} dias`;
  return i.dias === 1 ? `em ${dataCurta(i.de)}` : `de ${textoDoIntervalo(i.de, i.ate)}`;
}

/** Rótulo curto ao lado do título de um cartão: "30 dias" ou "01/09/2026 a 30/09/2026". */
export const rotuloDoPeriodo = (i: Intervalo, hoje: string) => (i.ate === hoje ? (i.dias === 1 ? "hoje" : `${i.dias} dias`) : textoDoIntervalo(i.de, i.ate));
