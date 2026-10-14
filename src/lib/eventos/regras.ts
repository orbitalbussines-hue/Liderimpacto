/**
 * Regras PURAS dos eventos ao vivo (ADR-0011, RN-142 e RN-143): janela do link, lembrete, validação
 * do link e formatação. Sem banco; testadas em regras.test.ts. Servidor e tela usam as MESMAS.
 */

/** Rota da tela do aluno (o link das notificações sai daqui). Mudou a rota? Mude AQUI. */
export const ROTA_EVENTOS = "/eventos";
/** O link aparece a partir de 15 min antes do início (RN-142). */
export const LINK_ABRE_ANTES_MIN = 15;
/** Lembrete aos inscritos 1 h antes (RN-143). */
export const LEMBRETE_ANTES_MIN = 60;

const MIN = 60_000;

export interface Agenda {
  inicioEm: Date;
  duracaoMin: number;
}

export const fimDoEvento = (e: Agenda): Date => new Date(e.inicioEm.getTime() + e.duracaoMin * MIN);

/**
 * EM_BREVE = antes da janela (a tela mostra contagem regressiva); ABERTO = de 15 min antes até o fim
 * (o servidor entrega o link); ENCERRADO = depois do fim (gravação, se houver).
 */
export type MomentoDoEvento = "EM_BREVE" | "ABERTO" | "ENCERRADO";

export function momentoDoEvento(e: Agenda, agora: Date): MomentoDoEvento {
  if (agora.getTime() >= fimDoEvento(e).getTime()) return "ENCERRADO";
  if (agora.getTime() >= e.inicioEm.getTime() - LINK_ABRE_ANTES_MIN * MIN) return "ABERTO";
  return "EM_BREVE";
}

/** Quando o lembrete deve sair (o job atrasado da fila usa isto como `delay`). */
export const momentoDoLembrete = (inicioEm: Date): Date => new Date(inicioEm.getTime() - LEMBRETE_ANTES_MIN * MIN);

/**
 * Id do job do lembrete = idempotência por (evento, início): enfileirar de novo não duplica; mudar o
 * horário gera outro job (o antigo, ao rodar, vê que o início mudou e não faz nada). Sem ":" (o
 * BullMQ recusa id próprio com ":").
 */
export const idDoJobLembrete = (eventoId: string, inicioEm: Date) => `lembrete-${eventoId}-${inicioEm.getTime()}`;

/** Chave da notificação de lembrete (única por membro): o mesmo início nunca avisa duas vezes. */
export const chaveDoLembrete = (eventoId: string, inicioEm: Date) => `evento-lembrete:${eventoId}:${inicioEm.getTime()}`;

const ROTULO_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;

/**
 * Link de acesso aceito: https, host com ponto (rótulos válidos), sem usuário/senha, até 500
 * caracteres. A mesma regra está no CHECK do banco (`REGEX_LINK_EVENTO_SQL`).
 */
export function linkDeEventoValido(texto: string): boolean {
  if (texto.length > 500 || /\s/.test(texto)) return false;
  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (!texto.toLowerCase().startsWith(`https://${u.hostname}`)) return false;
  const rotulos = u.hostname.split(".");
  return rotulos.length >= 2 && rotulos.every((r) => ROTULO_HOST.test(r));
}

const FORMATO = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** "21/10 às 19:30" (Brasília). */
export function quandoDoEvento(inicioEm: Date): string {
  const p = Object.fromEntries(FORMATO.formatToParts(inicioEm).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}
