"use server";

import { z } from "zod";
import { executar } from "@/lib/acao";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { criarCanal, removerCanal, salvarCanal } from "@/lib/comunidade/canais";
import { dessilenciar, fixarPublicacao, ocultar, resolverDenuncia, silenciar } from "@/lib/comunidade/moderacao";
import type { Moderador } from "@/lib/comunidade/sql";
import { canalSchema, fixarSchema, idSchema, ocultarSchema, resolverDenunciaSchema, silenciarSchema, versaoSchema } from "@/lib/validators/comunidade";

/**
 * Moderação e canais (RN-130, RN-132): SÓ DONO e ADMIN (e SUPER_ADMIN como DONO) do criador do
 * HOST. ALUNO recebe "Sem permissão" em todas. Trava de colisão e trilha em cada uma.
 */

async function moderador(): Promise<Moderador> {
  const m = await exigirMembro(EQUIPE);
  return { criadorId: m.criador.id, usuarioId: m.usuario.id, membroId: m.membro.id, nome: m.usuario.nome };
}

export async function acaoFixarPublicacao(entrada: unknown) {
  return executar(async () => {
    const m = await moderador();
    const e = fixarSchema.parse(entrada);
    return fixarPublicacao(m, e.postId, e.versao, e.fixar);
  });
}

/** Ocultar (motivo obrigatório) ou reexibir um post (`postId`) ou comentário (`comentarioId`). */
export async function acaoOcultar(entrada: unknown) {
  return executar(async () => {
    const m = await moderador();
    const e = ocultarSchema.parse(entrada);
    const alvo = "postId" in e ? { postId: e.postId } : { comentarioId: e.comentarioId };
    return ocultar(m, alvo, e.versao, e.ocultar ? { ocultar: true, motivo: e.motivo } : { ocultar: false });
  });
}

export async function acaoResolverDenuncia(entrada: unknown) {
  return executar(async () => {
    const m = await moderador();
    const e = resolverDenunciaSchema.parse(entrada);
    return resolverDenuncia(m, e.denunciaId, e.versao, e.situacao, e.decisao);
  });
}

export async function acaoSilenciarMembro(entrada: unknown) {
  return executar(async () => {
    const m = await moderador();
    const e = silenciarSchema.parse(entrada);
    return silenciar(m, e.membroId, e.dias, e.motivo);
  });
}

export async function acaoDessilenciarMembro(entrada: unknown) {
  return executar(async () => {
    const m = await moderador();
    const { membroId } = z.strictObject({ membroId: idSchema }).parse(entrada);
    await dessilenciar(m, membroId);
    return null;
  });
}

export async function acaoCriarCanal(entrada: unknown) {
  return executar(async () => {
    const m = await moderador();
    const e = canalSchema.parse(entrada);
    return criarCanal({ criadorId: m.criadorId, usuarioId: m.usuarioId }, e);
  });
}

/** `{ canalId, versao, dados: { nome, descricao, ordem, acesso, grupoId, produtoId, quemPosta } }`. */
export async function acaoSalvarCanal(entrada: unknown) {
  return executar(async () => {
    const m = await moderador();
    const e = z.strictObject({ canalId: idSchema, versao: versaoSchema, dados: canalSchema }).parse(entrada);
    return salvarCanal({ criadorId: m.criadorId, usuarioId: m.usuarioId }, e.canalId, e.versao, e.dados);
  });
}

export async function acaoRemoverCanal(entrada: unknown) {
  return executar(async () => {
    const m = await moderador();
    const e = z.strictObject({ canalId: idSchema, versao: versaoSchema }).parse(entrada);
    await removerCanal({ criadorId: m.criadorId, usuarioId: m.usuarioId }, e.canalId, e.versao);
    return null;
  });
}
