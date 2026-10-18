"use server";

import { ErroDeNegocio, executar } from "@/lib/acao";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { estourouTeto } from "@/lib/auth/teto";
import { db } from "@/lib/db";
import { agendarCampanha, cancelarCampanha, criarCampanha, excluirCampanha, salvarCampanha } from "@/lib/marketing/campanhas";
import { enviarTeste } from "@/lib/marketing/envio";
import { enfileirarEnviosComPrazo, enfileirarMarketingComPrazo } from "@/lib/marketing/fila";
import { criarModelo, excluirModelo, salvarModelo } from "@/lib/marketing/modelos";
import { provedorEmail } from "@/lib/marketing/provedor";
import { contarPublico } from "@/lib/marketing/publico";
import { MSG_EMAIL_DESLIGADO } from "@/lib/marketing/regras";
import { atorDoLink, contarReenvio, criarLoteDeReenvio } from "@/lib/marketing/reenvio";
import {
  agendarCampanhaSchema,
  campanhaVersaoSchema,
  contarPublicoSchema,
  criarCampanhaSchema,
  criarModeloSchema,
  envioTesteSchema,
  excluirModeloSchema,
  salvarCampanhaSchema,
  salvarModeloSchema,
} from "@/lib/validators/marketing";

/**
 * Campanhas de e-mail, modelos e reenvio do primeiro acesso (RN-220 a RN-223, RN-226), criador do
 * HOST. DONO e ADMIN (ALUNO: "Sem permissão"). Regra em src/lib/marketing/. O que vai para a fila é
 * enfileirado DEPOIS do commit (fila fora do ar = o worker reenfileira ao subir).
 */

const exigirEmailLigado = () => {
  if (!provedorEmail().configurado()) throw new ErroDeNegocio(MSG_EMAIL_DESLIGADO);
};

export async function acaoCriarModeloEmail(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = criarModeloSchema.parse(entrada);
    const m = await db.transaction((tx) => criarModelo(tx, { criadorId: criador.id, autor: usuario.id, nome: e.nome, conteudo: e.conteudo }));
    return { id: m.id, versao: m.versao.toISOString() };
  });
}

export async function acaoSalvarModeloEmail(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = salvarModeloSchema.parse(entrada);
    const m = await db.transaction((tx) => salvarModelo(tx, { criadorId: criador.id, autor: usuario.id, modeloId: e.modeloId, versao: e.versao, nome: e.nome, conteudo: e.conteudo }));
    return { versao: m.versao.toISOString() };
  });
}

/** Ação crítica na tela: ModalConfirmacaoBlock. */
export async function acaoExcluirModeloEmail(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = excluirModeloSchema.parse(entrada);
    await db.transaction((tx) => excluirModelo(tx, { criadorId: criador.id, autor: usuario.id, modeloId: e.modeloId, versao: e.versao }));
    return null;
  });
}

export async function acaoCriarCampanha(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = criarCampanhaSchema.parse(entrada);
    const c = await db.transaction((tx) => criarCampanha(tx, { criadorId: criador.id, autor: usuario.id, nome: e.nome, conteudo: e.conteudo, publico: e.publico }));
    return { id: c.id, versao: c.versao.toISOString() };
  });
}

export async function acaoSalvarCampanha(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = salvarCampanhaSchema.parse(entrada);
    const c = await db.transaction((tx) =>
      salvarCampanha(tx, { criadorId: criador.id, autor: usuario.id, campanhaId: e.campanhaId, versao: e.versao, nome: e.nome, conteudo: e.conteudo, publico: e.publico }),
    );
    return { versao: c.versao.toISOString() };
  });
}

/** Contagem ANTES de enviar (a tela mostra "X pessoas receberão; Y descadastradas ficam de fora"). */
export async function acaoContarPublico(entrada: unknown) {
  return executar(async () => {
    const { criador } = await exigirMembro(EQUIPE);
    const { publico } = contarPublicoSchema.parse(entrada);
    return contarPublico(criador.id, publico);
  });
}

/** Envia o conteúdo da tela para o e-mail de quem pede (campanha, automação ou modelo). Teto: 10 / 10 min. */
export async function acaoEnviarTesteEmail(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const { conteudo } = envioTesteSchema.parse(entrada);
    exigirEmailLigado();
    if (await estourouTeto(`email-teste:${usuario.id}`, 600, 10)) throw new ErroDeNegocio("Muitos testes seguidos. Aguarde alguns minutos.");
    await enviarTeste({ criador, para: usuario.email, nome: usuario.nome, conteudo });
    return { para: usuario.email };
  });
}

/** `quando` nulo = enviar agora. Ação crítica na tela: ModalConfirmacaoBlock com a contagem do público. */
export async function acaoAgendarCampanha(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = agendarCampanhaSchema.parse(entrada);
    exigirEmailLigado();
    const r = await db.transaction((tx) => agendarCampanha(tx, { criadorId: criador.id, autor: usuario.id, campanhaId: e.campanhaId, versao: e.versao, quando: e.quando }));
    await enfileirarMarketingComPrazo([{ job: { tipo: "campanha", campanhaId: e.campanhaId }, quando: r.quando }]);
    return { versao: r.versao.toISOString(), quando: r.quando.toISOString() };
  });
}

/** Ação crítica: ModalConfirmacaoBlock. */
export async function acaoCancelarCampanha(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = campanhaVersaoSchema.parse(entrada);
    const r = await db.transaction((tx) => cancelarCampanha(tx, { criadorId: criador.id, autor: usuario.id, campanhaId: e.campanhaId, versao: e.versao }));
    return { versao: r.versao.toISOString(), naoEnviados: r.naoEnviados };
  });
}

/** Ação crítica: ModalConfirmacaoBlock. Só rascunho. */
export async function acaoExcluirCampanha(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = campanhaVersaoSchema.parse(entrada);
    await db.transaction((tx) => excluirCampanha(tx, { criadorId: criador.id, autor: usuario.id, campanhaId: e.campanhaId, versao: e.versao }));
    return null;
  });
}

/** Quantas pessoas receberão o link novo de primeiro acesso (mostrar ANTES de confirmar). */
export async function acaoContarReenvioPrimeiroAcesso(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const { publico } = contarPublicoSchema.parse(entrada);
    return contarReenvio(criador.id, await atorDoLink(usuario.id, criador.id), publico);
  });
}

/**
 * Gera um link NOVO de primeiro acesso para cada pessoa do filtro e envia pela fila com teto (RN-226).
 * Ação crítica: ModalConfirmacaoBlock com a contagem. Teto: 3 lotes por área a cada 10 min.
 */
export async function acaoReenviarPrimeiroAcesso(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const { publico } = contarPublicoSchema.parse(entrada);
    exigirEmailLigado();
    if (await estourouTeto(`reenvio-acesso:${criador.id}`, 600, 3)) throw new ErroDeNegocio("Muitos reenvios seguidos. Aguarde alguns minutos.");
    const r = await criarLoteDeReenvio({ criadorId: criador.id, ator: await atorDoLink(usuario.id, criador.id), publico });
    await enfileirarEnviosComPrazo(r.envioIds);
    return { lote: r.lote, enfileirados: r.envioIds.length, foraDaRegra: r.foraDaRegra, alemDoLimite: r.alemDoLimite };
  });
}
