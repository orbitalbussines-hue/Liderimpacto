import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { criadores_eventos as eventos } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { notificarLembreteEvento } from "@/lib/notificacoes/gerar";
import { esquemaJobLembrete, type JobLembrete } from "./fila";

/**
 * Lado do WORKER do lembrete (ADR-0011 item 6). O job só chama `notificarLembreteEvento`, que
 * confere situação, início e fim (cancelado/reagendado/terminado = 0) e é idempotente por membro.
 * Lança em falha de banco: o BullMQ tenta de novo (3x) e depois vai para a DLQ.
 */
export async function processarLembrete(dados: unknown, agora = new Date()): Promise<number> {
  const job = esquemaJobLembrete.parse(dados);
  return notificarLembreteEvento(job.criadorId, job.eventoId, new Date(job.inicioEm), agora);
}

/**
 * Lembretes a (re)enfileirar ao subir o worker: todo evento PUBLICADO que ainda não começou, de
 * todos os criadores. Redis perdido ou fila fora do ar no publish não perdem lembrete; os que já
 * estão na fila não duplicam (mesmo `jobId`).
 * ponytail: varre a tabela inteira (o índice da agenda começa por `criador_id`); índice só por
 * `inicio_em` quando houver dezenas de milhares de eventos.
 */
export async function lembretesPendentes(agora = new Date()): Promise<JobLembrete[]> {
  const l = await db
    .select({ criadorId: eventos.criador_id, eventoId: eventos.id, inicioEm: eventos.inicio_em })
    .from(eventos)
    .where(and(eq(eventos.situacao, "PUBLICADO"), gt(eventos.inicio_em, agora), vivos(eventos)));
  return l.map((e) => ({ criadorId: e.criadorId, eventoId: e.eventoId, inicioEm: e.inicioEm.toISOString() }));
}
