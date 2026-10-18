import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { criadores_webhooks as wh, criadores_webhooks_entregas as ent } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { type PostarWebhook, postarWebhook } from "./rede";
import { CABECALHO_ASSINATURA, CABECALHO_ENTREGA, CABECALHO_EVENTO, atrasoDaProxima, entregaOk, resumirErroWebhook } from "./regras";
import { assinarCorpo, decifrarSegredo } from "./segredo";

/**
 * Uma TENTATIVA de entrega (4º Worker de `worker:certificados`). Registra status, erro e a próxima
 * tentativa na linha; falhou = LANÇA para o BullMQ refazer com backoff. Na última, marca FALHOU (o
 * worker copia para a DLQ). Atualização de sistema: não mexe em `updated_at` (a trava da tela
 * "Reenviar" continua valendo). O POST é injetável (os testes nunca saem para a rede).
 */

export type ResultadoEntrega = "entregue" | "ignorada" | "cancelada";

export async function processarEntrega(
  entregaId: string,
  tentativa: number,
  maxTentativas: number,
  postar: PostarWebhook = postarWebhook,
  agora: () => Date = () => new Date(),
): Promise<ResultadoEntrega> {
  const [e] = await db
    .select({ entrega: ent, url: wh.url, segredo: wh.segredo_cifrado, situacaoWebhook: wh.situacao, webhookVivo: wh.is_deleted })
    .from(ent)
    .innerJoin(wh, eq(wh.id, ent.webhook_id))
    .where(and(eq(ent.id, entregaId), vivos(ent)));
  if (!e || e.entrega.situacao !== "PENDENTE") return "ignorada";
  if (e.webhookVivo || e.situacaoWebhook !== "ATIVO") {
    await db.update(ent).set({ situacao: "FALHOU", erro: "Webhook pausado ou removido antes da entrega.", proxima_tentativa_em: null }).where(eq(ent.id, entregaId));
    return "cancelada";
  }

  const corpo = JSON.stringify(e.entrega.payload);
  let status: number | null = null;
  let erro: string;
  try {
    const r = await postar(e.url, corpo, {
      [CABECALHO_ASSINATURA]: assinarCorpo(decifrarSegredo(e.segredo, e.entrega.webhook_id), corpo, agora()),
      [CABECALHO_EVENTO]: e.entrega.evento,
      [CABECALHO_ENTREGA]: entregaId,
    });
    status = r.status;
    if (entregaOk(r.status)) {
      await db.update(ent).set({ situacao: "ENTREGUE", tentativas: tentativa, status_http: r.status, erro: null, proxima_tentativa_em: null, entregue_em: agora() }).where(eq(ent.id, entregaId));
      return "entregue";
    }
    erro = r.status >= 300 && r.status < 400 ? `HTTP ${r.status} (redirecionamento não é seguido)` : `HTTP ${r.status}`;
  } catch (x) {
    erro = x instanceof Error ? x.message : "Falha de rede.";
  }
  const final = tentativa >= maxTentativas;
  erro = resumirErroWebhook(erro);
  await db
    .update(ent)
    .set({
      situacao: final ? "FALHOU" : "PENDENTE",
      tentativas: tentativa,
      status_http: status !== null && status >= 100 && status <= 599 ? status : null,
      erro,
      proxima_tentativa_em: final ? null : new Date(agora().getTime() + atrasoDaProxima(tentativa)),
    })
    .where(eq(ent.id, entregaId));
  throw new Error(erro);
}

/** Entregas PENDENTES (fila fora do ar quando o evento aconteceu): o worker reenfileira ao subir. */
export async function entregasPendentes(limite = 5000): Promise<string[]> {
  const linhas = await db
    .select({ id: ent.id })
    .from(ent)
    .where(and(eq(ent.situacao, "PENDENTE"), vivos(ent)))
    .orderBy(asc(ent.created_at))
    .limit(limite);
  return linhas.map((l) => l.id);
}
