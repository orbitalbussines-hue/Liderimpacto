"use server";

import { executar } from "@/lib/acao";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { criarAutomacao, excluirAutomacao, mudarSituacaoAutomacao, salvarAutomacao } from "@/lib/marketing/automacoes";
import { automacaoVersaoSchema, criarAutomacaoSchema, salvarAutomacaoSchema, situacaoAutomacaoSchema } from "@/lib/validators/marketing";

/**
 * Automações de e-mail (RN-224, RN-225), criador do HOST. DONO e ADMIN (ALUNO: "Sem permissão").
 * Regra em src/lib/marketing/automacoes.ts. Nascem PAUSADAS; ativar só vale para o que acontecer depois.
 */

export async function acaoCriarAutomacao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = criarAutomacaoSchema.parse(entrada);
    const a = await db.transaction((tx) =>
      criarAutomacao(tx, { criadorId: criador.id, autor: usuario.id, gatilho: e.gatilho, nome: e.nome, produtoId: e.produtoId, dias: e.dias, atrasoMinutos: e.atrasoMinutos, conteudo: e.conteudo, tagId: e.tagId }),
    );
    return { id: a.id, versao: a.versao.toISOString() };
  });
}

export async function acaoSalvarAutomacao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = salvarAutomacaoSchema.parse(entrada);
    const a = await db.transaction((tx) =>
      salvarAutomacao(tx, {
        criadorId: criador.id,
        autor: usuario.id,
        automacaoId: e.automacaoId,
        versao: e.versao,
        gatilho: e.gatilho,
        nome: e.nome,
        produtoId: e.produtoId,
        dias: e.dias,
        atrasoMinutos: e.atrasoMinutos,
        conteudo: e.conteudo,
        tagId: e.tagId,
      }),
    );
    return { versao: a.versao.toISOString() };
  });
}

export async function acaoMudarSituacaoAutomacao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = situacaoAutomacaoSchema.parse(entrada);
    const a = await db.transaction((tx) => mudarSituacaoAutomacao(tx, { criadorId: criador.id, autor: usuario.id, automacaoId: e.automacaoId, versao: e.versao, situacao: e.situacao }));
    return { versao: a.versao.toISOString() };
  });
}

/** Ação crítica na tela: ModalConfirmacaoBlock. */
export async function acaoExcluirAutomacao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = automacaoVersaoSchema.parse(entrada);
    await db.transaction((tx) => excluirAutomacao(tx, { criadorId: criador.id, autor: usuario.id, automacaoId: e.automacaoId, versao: e.versao }));
    return null;
  });
}
