/**
 * Textos de TELA dos eventos (puros, servidor e cliente; testados em tela.test.ts). Fuso de Brasília.
 */
import { dataEmBrasilia } from "@/lib/matriculas/regras";
import { LINK_ABRE_ANTES_MIN } from "./regras";

const MIN = 60_000;
const FUSO = { timeZone: "America/Sao_Paulo" } as const;

/** Quando o link abre (a tela recarrega nesse instante para receber o link do servidor). */
export const aberturaDoLink = (inicioEm: Date) => new Date(inicioEm.getTime() - LINK_ABRE_ANTES_MIN * MIN);

/** "Começa em 12 min", "Começa em 3 h 20 min", "Amanhã", "Em 4 dias", "Ao vivo agora", "Encerrado". */
export function textoDaContagem(e: { inicioEm: Date; fimEm: Date }, agora: Date): string {
  if (agora >= e.fimEm) return "Encerrado";
  if (agora >= e.inicioEm) return "Ao vivo agora";
  const falta = e.inicioEm.getTime() - agora.getTime();
  if (falta < 60 * MIN) return `Começa em ${Math.max(1, Math.ceil(falta / MIN))} min`;
  const dias = Math.round((Date.parse(dataEmBrasilia(e.inicioEm)) - Date.parse(dataEmBrasilia(agora))) / 86_400_000);
  if (dias === 0 || falta < 12 * 60 * MIN) {
    const h = Math.floor(falta / (60 * MIN));
    const m = Math.floor((falta % (60 * MIN)) / MIN);
    return `Começa em ${h} h${m ? ` ${m} min` : ""}`;
  }
  return dias === 1 ? "Amanhã" : `Em ${dias} dias`;
}

const EXTENSO = new Intl.DateTimeFormat("pt-BR", { ...FUSO, weekday: "long", day: "numeric", month: "long" });
const HORA = new Intl.DateTimeFormat("pt-BR", { ...FUSO, hour: "2-digit", minute: "2-digit" });
const DIA_MES = new Intl.DateTimeFormat("pt-BR", { ...FUSO, day: "2-digit", month: "short" });

/** "Terça-feira, 21 de outubro · 19:30". */
export function quandoPorExtenso(inicioEm: Date): string {
  const data = EXTENSO.format(inicioEm);
  return `${data.charAt(0).toUpperCase()}${data.slice(1)} · ${HORA.format(inicioEm)}`;
}

/** Hora "19:30" em Brasília. */
export const horaDoEvento = (d: Date) => HORA.format(d);

/** Bloco de data do cartão: { dia: "21", mes: "out" }. */
export function diaEMes(inicioEm: Date): { dia: string; mes: string } {
  const p = Object.fromEntries(DIA_MES.formatToParts(inicioEm).map((x) => [x.type, x.value]));
  return { dia: p.day, mes: String(p.month).replace(".", "") };
}

/** "1 h", "1 h 30 min", "45 min". */
export function duracaoTexto(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "1 confirmado", "12 confirmados", "Ninguém confirmou ainda". */
export const textoConfirmados = (n: number) => (n === 0 ? "Ninguém confirmou ainda" : n === 1 ? "1 confirmado" : `${n} confirmados`);
