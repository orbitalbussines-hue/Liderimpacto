"use server";

import { ErroDeNegocio, executar } from "@/lib/acao";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE, TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { notificarMatriculas } from "@/lib/notificacoes/gerar";
import { violouUnico } from "@/lib/membros/vinculos";
import { criarVoucherSchema, excluirVoucherSchema, resgatarVoucherSchema, salvarVoucherSchema, situacaoVoucherSchema } from "@/lib/validators/vouchers";
import { criarVoucher, excluirVoucher, mudarSituacaoVoucher, resgatarVoucher, salvarVoucher } from "@/lib/vouchers/servico";
import { automacaoVoucherResgatado } from "@/lib/marketing/gatilhos";
import { webhookMatriculas } from "@/lib/webhooks/emitir";

/**
 * Vouchers (RN-201), criador do HOST. Gerenciar: DONO e ADMIN. Resgatar: qualquer membro COM
 * vínculo, sempre para si (nenhum id de pessoa no corpo). Regra em src/lib/vouchers/servico.ts.
 */

export async function acaoCriarVoucher(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = criarVoucherSchema.parse(entrada);
    const v = await db.transaction((tx) => criarVoucher(tx, { criadorId: criador.id, autor: usuario.id, ...e }));
    return { id: v.id, codigo: v.codigo, versao: v.versao.toISOString() };
  });
}

export async function acaoSalvarVoucher(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = salvarVoucherSchema.parse(entrada);
    const v = await db.transaction((tx) => salvarVoucher(tx, { criadorId: criador.id, autor: usuario.id, ...e }));
    return { versao: v.versao.toISOString() };
  });
}

/** ATIVO ⇄ PAUSADO; ENCERRAR é final (ModalConfirmacaoBlock na tela). */
export async function acaoMudarSituacaoVoucher(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = situacaoVoucherSchema.parse(entrada);
    const v = await db.transaction((tx) => mudarSituacaoVoucher(tx, { criadorId: criador.id, autor: usuario.id, voucherId: e.voucherId, versao: e.versao, situacao: e.situacao }));
    return { versao: v.versao.toISOString() };
  });
}

/** Só sem resgates (ModalConfirmacaoBlock na tela). */
export async function acaoExcluirVoucher(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = excluirVoucherSchema.parse(entrada);
    await db.transaction((tx) => excluirVoucher(tx, { criadorId: criador.id, autor: usuario.id, voucherId: e.voucherId, versao: e.versao }));
    return null;
  });
}

/** O membro da sessão resgata o código. Devolve as matrículas (a tela leva ao curso). */
export async function acaoResgatarVoucher(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador, membro } = await exigirMembro(TODOS_OS_MEMBROS);
    if (!membro.id) throw new ErroDeNegocio("Vouchers valem só para quem é membro desta área.");
    const membroId = membro.id;
    const { codigo } = resgatarVoucherSchema.parse(entrada);
    const r = await db
      .transaction((tx) => resgatarVoucher(tx, { criadorId: criador.id, membroId, usuarioId: usuario.id, codigo }))
      .catch((erro: unknown) => {
        if (violouUnico(erro)) throw new ErroDeNegocio("Resgate em andamento em outra aba. Recarregue e confira seus cursos.");
        throw erro;
      });
    // Depois do commit; nunca lançam (RN-134, RN-204).
    await notificarMatriculas(criador.id, r.novas, usuario.id);
    await webhookMatriculas(criador.id, r.novas, "MATRICULA_CRIADA", usuario.id);
    await automacaoVoucherResgatado(criador.id, r.resgateId); // nunca lança (RN-225)
    return { resgateId: r.resgateId, matriculas: r.matriculas };
  });
}
