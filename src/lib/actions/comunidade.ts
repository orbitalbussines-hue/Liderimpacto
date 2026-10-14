"use server";

import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { confirmarEnvioDeAnexo, iniciarEnvioDeAnexo, linkDoAnexo } from "@/lib/comunidade/anexos";
import { comentar, editarComentario, removerComentario } from "@/lib/comunidade/comentarios";
import { feedDaComunidade } from "@/lib/comunidade/consultas";
import { denunciar } from "@/lib/comunidade/moderacao";
import { alternarCurtida, editarPublicacao, publicar, removerPublicacao, votarNaEnquete } from "@/lib/comunidade/publicacoes";
import type { Participante } from "@/lib/comunidade/sql";
import {
  alvoPostOuComentarioSchema,
  comentarSchema,
  denunciarSchema,
  editarComentarioSchema,
  editarPostSchema,
  envioAnexoSchema,
  idSchema,
  publicarSchema,
  removerComentarioSchema,
  removerPostSchema,
  votarSchema,
} from "@/lib/validators/comunidade";

/**
 * Comunidade do MEMBRO (RN-130 a RN-133): qualquer papel com VÍNCULO no criador do HOST (o autor
 * vem da sessão, nunca do corpo). A regra mora em src/lib/comunidade/; aqui só sessão, Zod e
 * `executar()`. Remover post/comentário de OUTRA pessoa exige DONO/ADMIN (o serviço confere).
 */

async function participante(): Promise<Participante & { equipe: boolean }> {
  const m = await exigirMembro(TODOS_OS_MEMBROS);
  if (!m.membro.id) throw new ErroDeNegocio("Participar da comunidade exige vínculo nesta área.");
  return { criadorId: m.criador.id, usuarioId: m.usuario.id, membroId: m.membro.id, papel: m.membro.papel, nome: m.usuario.nome, equipe: m.membro.papel !== "ALUNO" };
}

export async function acaoPublicar(entrada: unknown) {
  return executar(async () => {
    const quem = await participante();
    const e = publicarSchema.parse(entrada);
    return publicar(quem, e);
  });
}

export async function acaoEditarPublicacao(entrada: unknown) {
  return executar(async () => {
    const quem = await participante();
    const e = editarPostSchema.parse(entrada);
    return editarPublicacao(quem, e.postId, e.versao, e.texto);
  });
}

/** Autor remove o seu; a equipe remove qualquer um (SUPER_ADMIN sem vínculo também, como DONO). */
export async function acaoRemoverPublicacao(entrada: unknown) {
  return executar(async () => {
    const m = await exigirMembro(TODOS_OS_MEMBROS);
    const e = removerPostSchema.parse(entrada);
    await removerPublicacao({ criadorId: m.criador.id, usuarioId: m.usuario.id, membroId: m.membro.id, equipe: m.membro.papel !== "ALUNO" }, e.postId, e.versao);
    return null;
  });
}

export async function acaoVotarEnquete(entrada: unknown) {
  return executar(async () => {
    const quem = await participante();
    const e = votarSchema.parse(entrada);
    return votarNaEnquete(quem, e.postId, e.opcao);
  });
}

/** Toggle: devolve o estado novo e o contador do alvo. */
export async function acaoCurtir(entrada: unknown) {
  return executar(async () => {
    const quem = await participante();
    const alvo = alvoPostOuComentarioSchema.parse(entrada);
    return alternarCurtida(quem, alvo);
  });
}

/** Em post (`postId`) ou aula (`aulaId`); `paiId` = resposta (1 nível). */
export async function acaoComentar(entrada: unknown) {
  return executar(async () => {
    const quem = await participante();
    const e = comentarSchema.parse(entrada);
    const alvo = "postId" in e ? { postId: e.postId } : { aulaId: e.aulaId };
    return comentar(quem, alvo, e.texto, e.paiId);
  });
}

export async function acaoEditarComentario(entrada: unknown) {
  return executar(async () => {
    const quem = await participante();
    const e = editarComentarioSchema.parse(entrada);
    return editarComentario(quem, e.comentarioId, e.versao, e.texto);
  });
}

export async function acaoRemoverComentario(entrada: unknown) {
  return executar(async () => {
    const m = await exigirMembro(TODOS_OS_MEMBROS);
    const e = removerComentarioSchema.parse(entrada);
    await removerComentario({ criadorId: m.criador.id, usuarioId: m.usuario.id, membroId: m.membro.id, equipe: m.membro.papel !== "ALUNO" }, e.comentarioId, e.versao);
    return null;
  });
}

export async function acaoDenunciar(entrada: unknown) {
  return executar(async () => {
    const quem = await participante();
    const e = denunciarSchema.parse(entrada);
    const alvo = "postId" in e ? { postId: e.postId } : { comentarioId: e.comentarioId };
    return denunciar(quem, alvo, e.motivo);
  });
}

/** 1º tempo do anexo: allowlist + URL de PUT (o navegador sobe direto ao storage). */
export async function acaoIniciarEnvioAnexo(entrada: unknown) {
  return executar(async () => {
    const quem = await participante();
    const e = envioAnexoSchema.parse(entrada);
    return iniciarEnvioDeAnexo(quem, e);
  });
}

/** 3º tempo: HEAD confere tamanho e tipo; devolve o `arquivoId` para `acaoPublicar({ anexoIds })`. */
export async function acaoConfirmarEnvioAnexo(entrada: unknown) {
  return executar(async () => {
    const quem = await participante();
    const { arquivoId } = z.strictObject({ arquivoId: idSchema }).parse(entrada);
    return confirmarEnvioDeAnexo(quem, arquivoId);
  });
}

/** URL curta (5 min) para abrir/baixar o anexo (PDF) de um post que quem pede vê. */
export async function acaoLinkDoAnexo(entrada: unknown) {
  return executar(async () => {
    const m = await exigirMembro(TODOS_OS_MEMBROS);
    const { anexoId } = z.strictObject({ anexoId: idSchema }).parse(entrada);
    const url = await linkDoAnexo(m, anexoId);
    if (!url) throw new ErroDeNegocio("Anexo não encontrado.");
    return { url };
  });
}

/** "Carregar mais" do feed (leitura): mesma consulta da página, a partir do cursor. */
export async function acaoMaisPublicacoes(entrada: unknown) {
  return executar(async () => {
    const m = await exigirMembro(TODOS_OS_MEMBROS);
    const e = z
      .strictObject({ canalId: idSchema.nullable().default(null), ordem: z.enum(["RECENTES", "CURTIDOS"]).default("RECENTES"), cursor: z.string().max(200).nullable().default(null) })
      .parse(entrada);
    const pagina = await feedDaComunidade(m, e);
    if (!pagina) throw new ErroDeNegocio("Canal não encontrado.");
    return pagina;
  });
}
