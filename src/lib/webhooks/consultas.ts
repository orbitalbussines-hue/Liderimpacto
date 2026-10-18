import "server-only";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import type { SituacaoEntregaWebhook } from "@/lib/db/schema/_enums";
import { criadores_webhooks as wh, criadores_webhooks_entregas as ent } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

/** Leituras do card "Integrações e webhooks" (RN-204, só DONO). Nunca devolvem o segredo cifrado. */

export async function listarWebhooks(criadorId: string) {
  return db
    .select({
      id: wh.id,
      nome: wh.nome,
      url: wh.url,
      eventos: wh.eventos,
      situacao: wh.situacao,
      segredoFinal: wh.segredo_final,
      criadoEm: wh.created_at,
      versao: wh.updated_at,
    })
    .from(wh)
    .where(and(eq(wh.criador_id, criadorId), vivos(wh)))
    .orderBy(desc(wh.created_at));
}

/** Últimas entregas do webhook (mais recentes primeiro). `null` = webhook não é deste criador. */
export async function entregasDoWebhook(criadorId: string, webhookId: string, f: { situacao?: SituacaoEntregaWebhook; limite?: number } = {}) {
  const [w] = await db.select({ id: wh.id }).from(wh).where(and(eq(wh.id, webhookId), eq(wh.criador_id, criadorId), vivos(wh)));
  if (!w) return null;
  const condicoes: SQL[] = [eq(ent.webhook_id, webhookId), eq(ent.criador_id, criadorId), vivos(ent)];
  if (f.situacao) condicoes.push(eq(ent.situacao, f.situacao));
  return db
    .select({
      id: ent.id,
      evento: ent.evento,
      payload: ent.payload,
      situacao: ent.situacao,
      tentativas: ent.tentativas,
      statusHttp: ent.status_http,
      erro: ent.erro,
      proximaTentativaEm: ent.proxima_tentativa_em,
      entregueEm: ent.entregue_em,
      criadoEm: ent.created_at,
      versao: ent.updated_at,
    })
    .from(ent)
    .where(and(...condicoes))
    .orderBy(desc(ent.created_at))
    .limit(Math.min(f.limite ?? 50, 200));
}
