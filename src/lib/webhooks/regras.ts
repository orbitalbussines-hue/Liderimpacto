/**
 * Webhooks de saída (RN-204, ADR-0018 item 5) — PURO e sem módulo do Node: serve à tela (rótulos,
 * validação da URL antes de enviar) e ao servidor (backoff, resumo de erro). O bloqueio de IP
 * privado (resolução de DNS) mora em `rede.ts`, só servidor.
 */
import type { EventoWebhook } from "@/lib/db/schema/_enums";

export const ROTULO_EVENTO_WEBHOOK: Record<EventoWebhook, string> = {
  MATRICULA_CRIADA: "Matrícula criada",
  MATRICULA_CANCELADA: "Matrícula cancelada",
  AULA_CONCLUIDA: "Aula concluída",
  CURSO_CONCLUIDO: "Curso concluído",
  CERTIFICADO_EMITIDO: "Certificado emitido",
  AVALIACAO_APROVADA: "Avaliação aprovada",
  MEMBRO_CADASTRADO: "Membro cadastrado",
};

/** Cabeçalhos enviados (o receptor confere `Assinatura` = `t=<unix>,v1=<hex HMAC-SHA256(segredo, "<t>.<corpo>")>`). */
export const CABECALHO_ASSINATURA = "X-Lider-Assinatura";
export const CABECALHO_EVENTO = "X-Lider-Evento";
export const CABECALHO_ENTREGA = "X-Lider-Entrega";

export const MAX_WEBHOOKS_POR_CRIADOR = 10;
/** 1 + 7 novas tentativas: 30 s, 1, 2, 4, 8, 16, 32 min (≈ 1 h no total). */
export const TENTATIVAS_WEBHOOK = 8;
export const ATRASO_BASE_WEBHOOK_MS = 30_000;
export const TIMEOUT_WEBHOOK_MS = 5_000;

/** Atraso antes da tentativa `feitas + 1` (mesma conta do backoff exponencial do BullMQ). */
export const atrasoDaProxima = (feitas: number) => ATRASO_BASE_WEBHOOK_MS * 2 ** Math.max(0, feitas - 1);

/** Hosts que nunca são destino, mesmo antes de resolver o DNS. */
const HOSTS_PROIBIDOS = /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i;

/**
 * Problema na URL (texto para a tela) ou `null`. Só https, sem usuário/senha na URL, com nome de
 * host. IP literal passa aqui e é conferido em `rede.ts` (privado = recusado).
 */
export function problemaNaUrlWebhook(texto: string): string | null {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return "URL inválida.";
  }
  if (url.protocol !== "https:") return "Use uma URL https://.";
  if (url.username || url.password) return "A URL não pode ter usuário ou senha.";
  if (!url.hostname || HOSTS_PROIBIDOS.test(url.hostname.replace(/\.$/, ""))) return "Endereço não permitido.";
  // IP literal (o URL já normaliza "2130706433" para "127.0.0.1"): recusa ao salvar, a entrega também recusaria.
  if (/^\[|^\d+(\.\d+){3}$/.test(url.hostname)) return "Use o nome do domínio, não um endereço IP.";
  if (texto.length > 500) return "URL muito longa (máximo de 500).";
  return null;
}

/** Resumo de erro para a tabela (sem corpo de resposta), até 300 caracteres. */
export const resumirErroWebhook = (texto: string) => texto.replace(/\s+/g, " ").trim().slice(0, 300);

/** Status HTTP de sucesso. Redirecionamento NÃO é seguido e conta como falha. */
export const entregaOk = (status: number) => status >= 200 && status < 300;
