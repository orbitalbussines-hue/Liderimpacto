"use server";

import { executar } from "@/lib/acao";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { aplicarTag, criarTag, excluirTag, removerTag, salvarTag } from "@/lib/tags/servico";
import { criarTagSchema, excluirTagSchema, marcarTagSchema, salvarTagSchema } from "@/lib/validators/tags";

/**
 * Tags de membros (RN-200), criador do HOST. DONO e ADMIN (ALUNO: "Sem permissão"). A regra mora em
 * src/lib/tags/servico.ts (trilha na transação). Devolvem `versao` ISO para a próxima edição.
 */

export async function acaoCriarTag(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = criarTagSchema.parse(entrada);
    const t = await db.transaction((tx) => criarTag(tx, { criadorId: criador.id, autor: usuario.id, nome: e.nome, cor: e.cor }));
    return { id: t.id, versao: t.versao.toISOString() };
  });
}

export async function acaoSalvarTag(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = salvarTagSchema.parse(entrada);
    const t = await db.transaction((tx) => salvarTag(tx, { criadorId: criador.id, autor: usuario.id, tagId: e.tagId, versao: e.versao, nome: e.nome, cor: e.cor }));
    return { versao: t.versao.toISOString() };
  });
}

/** Ação crítica na tela: ModalConfirmacaoBlock (tira a tag de todos os membros). */
export async function acaoExcluirTag(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = excluirTagSchema.parse(entrada);
    return db.transaction((tx) => excluirTag(tx, { criadorId: criador.id, autor: usuario.id, tagId: e.tagId, versao: e.versao }));
  });
}

export async function acaoAplicarTag(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = marcarTagSchema.parse(entrada);
    return db.transaction((tx) => aplicarTag(tx, { criadorId: criador.id, autor: usuario.id, tagId: e.tagId, membroIds: e.membroIds }));
  });
}

export async function acaoRemoverTag(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = marcarTagSchema.parse(entrada);
    return db.transaction((tx) => removerTag(tx, { criadorId: criador.id, autor: usuario.id, tagId: e.tagId, membroIds: e.membroIds }));
  });
}
