import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import type { EventoWebhook, SituacaoWebhook } from "@/lib/db/schema/_enums";
import { criadores_webhooks as wh, criadores_webhooks_entregas as ent } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { MAX_WEBHOOKS_POR_CRIADOR, problemaNaUrlWebhook } from "./regras";
import { cifrarSegredo, gerarSegredoWebhook } from "./segredo";

/**
 * ESCRITA dos webhooks (RN-204), na transação de quem chama, criador do HOST, trilha junto (sem o
 * segredo: só o final de 4 caracteres). O segredo em claro sai UMA vez no retorno de criar/rotacionar.
 */

const TABELA = "criadores_webhooks";

export interface CamposWebhook {
  nome: string;
  url: string;
  eventos: readonly EventoWebhook[];
}

function conferir(c: CamposWebhook) {
  const problema = problemaNaUrlWebhook(c.url);
  if (problema) throw new ErroDeNegocio(problema);
  if (!c.eventos.length) throw new ErroDeNegocio("Escolha ao menos um evento.");
}

const linha = (c: CamposWebhook) => ({ nome: c.nome, url: c.url, eventos: [...new Set(c.eventos)].sort() });

export async function criarWebhook(tx: Transacao, p: CamposWebhook & { criadorId: string; autor: string }): Promise<{ id: string; segredo: string; versao: Date }> {
  conferir(p);
  // Serializa por criador: o teto de webhooks não estoura com dois cliques.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`webhooks:${p.criadorId}`}, 0))`);
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(wh).where(and(eq(wh.criador_id, p.criadorId), vivos(wh)));
  if (n >= MAX_WEBHOOKS_POR_CRIADOR) throw new ErroDeNegocio(`Limite de ${MAX_WEBHOOKS_POR_CRIADOR} webhooks por área.`);
  const id = randomUUID();
  const segredo = gerarSegredoWebhook();
  const [w] = await tx
    .insert(wh)
    .values({ id, criador_id: p.criadorId, ...linha(p), segredo_cifrado: cifrarSegredo(segredo, id), segredo_final: segredo.slice(-4), modified_by: p.autor })
    .returning({ versao: wh.updated_at });
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "criar", tabela: TABELA, registroId: id, detalhes: `Criou o webhook "${p.nome}"`, dadosNovos: { ...linha(p), segredo_final: segredo.slice(-4) } });
  return { id, segredo, versao: w.versao };
}

async function travado(tx: Transacao, criadorId: string, webhookId: string, versao: Date) {
  const [w] = await tx
    .select({ nome: wh.nome, url: wh.url, eventos: wh.eventos, situacao: wh.situacao, segredoFinal: wh.segredo_final })
    .from(wh)
    .where(and(travaDeColisao(wh, webhookId, versao), eq(wh.criador_id, criadorId)))
    .for("update");
  if (!w) throw new ErroDeNegocio(MSG_COLISAO);
  return w;
}

async function gravar(tx: Transacao, criadorId: string, webhookId: string, versao: Date, valores: Partial<typeof wh.$inferInsert>) {
  const [w] = await tx
    .update(wh)
    .set(valores)
    .where(and(travaDeColisao(wh, webhookId, versao), eq(wh.criador_id, criadorId)))
    .returning({ versao: wh.updated_at });
  if (!w) throw new ErroDeNegocio(MSG_COLISAO);
  return w;
}

export async function salvarWebhook(tx: Transacao, p: CamposWebhook & { criadorId: string; autor: string; webhookId: string; versao: Date }): Promise<{ versao: Date }> {
  conferir(p);
  const antes = await travado(tx, p.criadorId, p.webhookId, p.versao);
  const w = await gravar(tx, p.criadorId, p.webhookId, p.versao, { ...linha(p), updated_at: new Date(), modified_by: p.autor });
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: p.webhookId,
    detalhes: `Editou o webhook "${p.nome}"`,
    dadosAnteriores: { nome: antes.nome, url: antes.url, eventos: antes.eventos },
    dadosNovos: linha(p),
  });
  return w;
}

/** ATIVO ⇄ PAUSADO. Pausado: eventos novos não geram entrega; as pendentes falham ao sair da fila. */
export async function mudarSituacaoWebhook(tx: Transacao, p: { criadorId: string; autor: string; webhookId: string; versao: Date; situacao: SituacaoWebhook }): Promise<{ versao: Date }> {
  const antes = await travado(tx, p.criadorId, p.webhookId, p.versao);
  if (antes.situacao === p.situacao) throw new ErroDeNegocio("O webhook já está nesta situação.");
  const w = await gravar(tx, p.criadorId, p.webhookId, p.versao, { situacao: p.situacao, updated_at: new Date(), modified_by: p.autor });
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: p.webhookId,
    detalhes: `Webhook "${antes.nome}": ${antes.situacao} → ${p.situacao}`,
    dadosAnteriores: { situacao: antes.situacao },
    dadosNovos: { situacao: p.situacao },
  });
  return w;
}

/** Segredo novo (o antigo deixa de valer na hora). Devolve o novo em claro UMA vez. */
export async function rotacionarSegredo(tx: Transacao, p: { criadorId: string; autor: string; webhookId: string; versao: Date }): Promise<{ segredo: string; versao: Date }> {
  const antes = await travado(tx, p.criadorId, p.webhookId, p.versao);
  const segredo = gerarSegredoWebhook();
  const w = await gravar(tx, p.criadorId, p.webhookId, p.versao, { segredo_cifrado: cifrarSegredo(segredo, p.webhookId), segredo_final: segredo.slice(-4), updated_at: new Date(), modified_by: p.autor });
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: p.webhookId,
    detalhes: `Trocou o segredo do webhook "${antes.nome}"`,
    dadosAnteriores: { segredo_final: antes.segredoFinal },
    dadosNovos: { segredo_final: segredo.slice(-4) },
  });
  return { segredo, versao: w.versao };
}

export async function excluirWebhook(tx: Transacao, p: { criadorId: string; autor: string; webhookId: string; versao: Date }): Promise<void> {
  const antes = await travado(tx, p.criadorId, p.webhookId, p.versao);
  await gravar(tx, p.criadorId, p.webhookId, p.versao, marcaDeExclusao(p.autor));
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "excluir", tabela: TABELA, registroId: p.webhookId, detalhes: `Excluiu o webhook "${antes.nome}"`, dadosAnteriores: { nome: antes.nome, url: antes.url, eventos: antes.eventos } });
}

/** Entrega que FALHOU volta a PENDENTE (tentativas zeradas); quem chama enfileira depois do commit. */
export async function reenviarEntrega(tx: Transacao, p: { criadorId: string; autor: string; entregaId: string; versao: Date }): Promise<{ versao: Date }> {
  const [e] = await tx
    .select({ situacao: ent.situacao, evento: ent.evento, webhookId: ent.webhook_id })
    .from(ent)
    .where(and(travaDeColisao(ent, p.entregaId, p.versao), eq(ent.criador_id, p.criadorId)))
    .for("update");
  if (!e) throw new ErroDeNegocio(MSG_COLISAO);
  if (e.situacao !== "FALHOU") throw new ErroDeNegocio("Só entregas que falharam podem ser reenviadas.");
  const [w] = await tx.select({ situacao: wh.situacao }).from(wh).where(and(eq(wh.id, e.webhookId), vivos(wh)));
  if (w?.situacao !== "ATIVO") throw new ErroDeNegocio("Ative o webhook antes de reenviar.");
  const [n] = await tx
    .update(ent)
    .set({ situacao: "PENDENTE", tentativas: 0, erro: null, status_http: null, proxima_tentativa_em: null, updated_at: new Date(), modified_by: p.autor })
    .where(and(travaDeColisao(ent, p.entregaId, p.versao), eq(ent.criador_id, p.criadorId)))
    .returning({ versao: ent.updated_at });
  if (!n) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "atualizar", tabela: "criadores_webhooks_entregas", registroId: p.entregaId, detalhes: `Reenviou a entrega ${e.evento}`, dadosAnteriores: { situacao: "FALHOU" }, dadosNovos: { situacao: "PENDENTE" } });
  return n;
}
