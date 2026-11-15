import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * Liberação da aula (RN-274). Três modos, um por aula:
 *  - nada (as duas nulas): liberada com a matrícula;
 *  - `liberaEm`: numa data, igual para todos;
 *  - `liberaAposDias` (1..3650): N dias depois da matrícula de CADA aluno, à meia-noite de São Paulo
 *    do dia local de `iniciada_em` + N (matriculado 10/11 às 15h, N=7 ⇒ 17/11 00:00 de Brasília).
 *
 * `liberacaoEfetiva` (TS) e `liberacaoPorMatriculaSql` (SQL) são a MESMA conta — o teste de
 * integração compara as duas. Fuso por Intl / `AT TIME ZONE`, nunca offset fixo.
 */

export const FUSO_LIBERACAO = "America/Sao_Paulo";
export const LIBERA_APOS_DIAS_MAX = 3650;

export interface LiberacaoDaAula {
  liberaEm: Date | null;
  liberaAposDias: number | null;
}

const PARTES = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO_LIBERACAO,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function local(d: Date) {
  const p = Object.fromEntries(PARTES.formatToParts(d).map((x) => [x.type, Number(x.value)]));
  return { ano: p.year, mes: p.month, dia: p.day, hora: p.hour, minuto: p.minute, segundo: p.second };
}

/** Diferença (ms) entre o relógio de São Paulo e o UTC no instante `ms`. */
function deslocamento(ms: number): number {
  const l = local(new Date(ms));
  return Date.UTC(l.ano, l.mes - 1, l.dia, l.hora, l.minuto, l.segundo) - Math.floor(ms / 1000) * 1000;
}

/**
 * Instante da meia-noite local (São Paulo) de ano/mês/dia (dia pode passar do fim do mês: o
 * `Date.UTC` normaliza). Meia-noite que não existiu (início do antigo horário de verão) = o
 * primeiro instante do dia, como o `AT TIME ZONE` do PostgreSQL.
 */
function meiaNoiteLocal(ano: number, mes: number, dia: number): Date {
  const alvo = Date.UTC(ano, mes - 1, dia);
  const primeira = alvo - deslocamento(alvo);
  const segunda = alvo - deslocamento(primeira);
  return new Date(local(new Date(segunda)).hora === 0 ? segunda : primeira);
}

/**
 * Quando a aula libera para quem tem a matrícula iniciada em `iniciadaEm`. `null` = sem trava de
 * data. Sem matrícula (`iniciadaEm` nulo) a aula "X dias" não tem calendário: devolve `null` —
 * quem chama já barrou antes (MATRICULA) ou é a equipe (prévia, tudo liberado).
 */
export function liberacaoEfetiva(aula: LiberacaoDaAula, iniciadaEm: Date | null): Date | null {
  if (aula.liberaAposDias === null) return aula.liberaEm;
  if (!iniciadaEm) return null;
  const l = local(iniciadaEm);
  return meiaNoiteLocal(l.ano, l.mes, l.dia + aula.liberaAposDias);
}

/** A mesma conta de `liberacaoEfetiva` (modo "X dias") em SQL: `timestamptz`. */
export const liberacaoPorMatriculaSql = (iniciadaEm: SQLWrapper, dias: SQLWrapper): SQL<Date> =>
  sql<Date>`(((${iniciadaEm} at time zone ${sql.raw(`'${FUSO_LIBERACAO}'`)})::date + ${dias})::timestamp at time zone ${sql.raw(`'${FUSO_LIBERACAO}'`)})`;
