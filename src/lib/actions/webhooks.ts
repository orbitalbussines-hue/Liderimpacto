"use server";

import { executar } from "@/lib/acao";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { db } from "@/lib/db";
import { reenviarEntregaSchema, criarWebhookSchema, salvarWebhookSchema, situacaoWebhookSchema, webhookVersaoSchema } from "@/lib/validators/webhooks";
import { enfileirarEntregasComPrazo } from "@/lib/webhooks/fila";
import { criarWebhook, excluirWebhook, mudarSituacaoWebhook, reenviarEntrega, rotacionarSegredo, salvarWebhook } from "@/lib/webhooks/servico";

/**
 * Integrações e webhooks (RN-204), criador do HOST. SÓ DONO (ADMIN e ALUNO: "Sem permissão"): o
 * webhook manda dados de pessoas para fora da plataforma. Regra em src/lib/webhooks/servico.ts.
 * Criar e trocar o segredo devolvem o segredo em claro UMA vez (a tela mostra e não guarda).
 */

const DONO = ["DONO"] as const;

export async function acaoCriarWebhook(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const e = criarWebhookSchema.parse(entrada);
    const w = await db.transaction((tx) => criarWebhook(tx, { criadorId: criador.id, autor: usuario.id, nome: e.nome, url: e.url, eventos: e.eventos }));
    return { id: w.id, segredo: w.segredo, versao: w.versao.toISOString() };
  });
}

export async function acaoSalvarWebhook(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const e = salvarWebhookSchema.parse(entrada);
    const w = await db.transaction((tx) => salvarWebhook(tx, { criadorId: criador.id, autor: usuario.id, webhookId: e.webhookId, versao: e.versao, nome: e.nome, url: e.url, eventos: e.eventos }));
    return { versao: w.versao.toISOString() };
  });
}

export async function acaoMudarSituacaoWebhook(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const e = situacaoWebhookSchema.parse(entrada);
    const w = await db.transaction((tx) => mudarSituacaoWebhook(tx, { criadorId: criador.id, autor: usuario.id, webhookId: e.webhookId, versao: e.versao, situacao: e.situacao }));
    return { versao: w.versao.toISOString() };
  });
}

/** Ação crítica: ModalConfirmacaoBlock (o segredo antigo para de valer na hora). */
export async function acaoRotacionarSegredoWebhook(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const e = webhookVersaoSchema.parse(entrada);
    const w = await db.transaction((tx) => rotacionarSegredo(tx, { criadorId: criador.id, autor: usuario.id, webhookId: e.webhookId, versao: e.versao }));
    return { segredo: w.segredo, versao: w.versao.toISOString() };
  });
}

/** Ação crítica: ModalConfirmacaoBlock. */
export async function acaoExcluirWebhook(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const e = webhookVersaoSchema.parse(entrada);
    await db.transaction((tx) => excluirWebhook(tx, { criadorId: criador.id, autor: usuario.id, webhookId: e.webhookId, versao: e.versao }));
    return null;
  });
}

export async function acaoReenviarEntrega(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const e = reenviarEntregaSchema.parse(entrada);
    const r = await db.transaction((tx) => reenviarEntrega(tx, { criadorId: criador.id, autor: usuario.id, entregaId: e.entregaId, versao: e.versao }));
    await enfileirarEntregasComPrazo([e.entregaId]);
    return { versao: r.versao.toISOString() };
  });
}
