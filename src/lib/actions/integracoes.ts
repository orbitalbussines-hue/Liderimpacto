"use server";

import { executar } from "@/lib/acao";
import { exigirMembro, exigirSessao } from "@/lib/auth/autorizacao";
import { urlDaPlataforma } from "@/lib/criador/area";
import { db } from "@/lib/db";
import { conectarBling, trocarCredenciaisBling, urlDeAutorizacao } from "@/lib/integracoes/bling/oauth";
import { enfileirarComPrazo } from "@/lib/integracoes/fila";
import { urlDoWebhook } from "@/lib/integracoes/regras";
import { conectarIntegracao, criarMapeamento, desconectarIntegracao, excluirMapeamento, reprocessarEvento, trocarSegredoIntegracao } from "@/lib/integracoes/servico";
import {
  autorizarBlingSchema,
  conectarBlingSchema,
  conectarIntegracaoSchema,
  criarMapeamentoSchema,
  integracaoVersaoSchema,
  mapeamentoVersaoSchema,
  reprocessarEventoSchema,
  trocarCredenciaisBlingSchema,
  trocarSegredoSchema,
} from "@/lib/validators/integracoes";

/**
 * Integrações de venda externa — Hotmart, Eduzz e Bling (RN-230 a RN-236, RN-260), criador do HOST. SÓ DONO (ADMIN e
 * ALUNO: "Sem permissão"): a conexão libera acesso pago e guarda o token da conta do criador. Regra em
 * src/lib/integracoes/servico.ts. O token nunca volta ao navegador.
 */

const DONO = ["DONO"] as const;

export async function acaoConectarIntegracao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const e = conectarIntegracaoSchema.parse(entrada);
    const i = await db.transaction((tx) => conectarIntegracao(tx, { criadorId: criador.id, autor: usuario.id, plataforma: e.plataforma, segredo: e.segredo }));
    return { id: i.id, url: urlDoWebhook(urlDaPlataforma(), e.plataforma, i.id), versao: i.versao.toISOString() };
  });
}

export async function acaoTrocarSegredoIntegracao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const e = trocarSegredoSchema.parse(entrada);
    const r = await db.transaction((tx) => trocarSegredoIntegracao(tx, { criadorId: criador.id, autor: usuario.id, integracaoId: e.integracaoId, versao: e.versao, segredo: e.segredo }));
    return { versao: r.versao.toISOString() };
  });
}

/** Ação crítica: ModalConfirmacaoBlock (a URL para de funcionar e os mapeamentos saem). */
export async function acaoDesconectarIntegracao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const e = integracaoVersaoSchema.parse(entrada);
    return db.transaction((tx) => desconectarIntegracao(tx, { criadorId: criador.id, autor: usuario.id, integracaoId: e.integracaoId, versao: e.versao }));
  });
}

export async function acaoCriarMapeamento(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const e = criarMapeamentoSchema.parse(entrada);
    return db.transaction((tx) =>
      criarMapeamento(tx, { criadorId: criador.id, autor: usuario.id, integracaoId: e.integracaoId, produtoExterno: e.produtoExterno, nomeExterno: e.nomeExterno, produtoIds: e.produtoIds, diasAcesso: e.diasAcesso }),
    );
  });
}

/** Ação crítica: ModalConfirmacaoBlock. */
export async function acaoExcluirMapeamento(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const e = mapeamentoVersaoSchema.parse(entrada);
    await db.transaction((tx) => excluirMapeamento(tx, { criadorId: criador.id, autor: usuario.id, mapeamentoId: e.mapeamentoId, versao: e.versao }));
    return null;
  });
}

export async function acaoReprocessarEventoIntegracao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const e = reprocessarEventoSchema.parse(entrada);
    const r = await db.transaction((tx) => reprocessarEvento(tx, { criadorId: criador.id, autor: usuario.id, eventoId: e.eventoId, versao: e.versao }));
    // Fila fora do ar: a linha fica PENDENTE e o worker a pega ao subir.
    const naFila = await enfileirarComPrazo([e.eventoId]);
    return { versao: r.versao.toISOString(), naFila };
  });
}

/** Bling (ADR-0024): cadastra client_id + client_secret; a tela mostra a URL do webhook e pede "Autorizar no Bling". */
export async function acaoConectarBling(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const e = conectarBlingSchema.parse(entrada);
    const i = await db.transaction((tx) => conectarBling(tx, { criadorId: criador.id, autor: usuario.id, clienteId: e.clienteId, clientSecret: e.clientSecret }));
    return { id: i.id, url: urlDoWebhook(urlDaPlataforma(), "BLING", i.id), versao: i.versao.toISOString() };
  });
}

/** Troca client_id/secret do app: os tokens antigos saem e precisa autorizar de novo. */
export async function acaoTrocarCredenciaisBling(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const e = trocarCredenciaisBlingSchema.parse(entrada);
    const r = await db.transaction((tx) =>
      trocarCredenciaisBling(tx, { criadorId: criador.id, autor: usuario.id, integracaoId: e.integracaoId, versao: e.versao, clienteId: e.clienteId, clientSecret: e.clientSecret }),
    );
    return { versao: r.versao.toISOString() };
  });
}

/** URL do `authorize` do Bling com o state assinado e preso a ESTA sessão (o navegador vai até ela). */
export async function acaoAutorizarBling(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(DONO);
    const { sessaoId } = await exigirSessao();
    const e = autorizarBlingSchema.parse(entrada);
    return { url: await urlDeAutorizacao({ criadorId: criador.id, integracaoId: e.integracaoId, sessaoId, usuarioId: usuario.id, agora: new Date() }) };
  });
}
