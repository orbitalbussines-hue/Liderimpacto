"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { avaliarMembro, exigirMembro, exigirSessao, MSG_SEM_PERMISSAO } from "@/lib/auth/autorizacao";
import { agenteDe, ipDoCliente } from "@/lib/auth/ip";
import { EQUIPE, TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { acessoDaAula } from "@/lib/video/acesso-aula";
import { esquemaPedidoEnvio, provedorVideo } from "@/lib/video/provedor-proprio";
import { videoVivoDaAula } from "@/lib/video/registro";

/**
 * Vídeo da aula (ADR-0005). Envio: iniciar -> partes (URLs sob demanda) -> concluir (HEAD +
 * fila depois do commit). DONO e ADMIN, criador do HOST. Reprodução: qualquer membro chama, mas
 * só passa quem `podeAssistir` (equipe, ou ALUNO matriculado com a aula liberada).
 */

const id = z.uuid("Identificador inválido.");

export async function acaoIniciarEnvioVideo(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const pedido = esquemaPedidoEnvio.parse(entrada); // a allowlist de vídeo é conferida no provedor
    return provedorVideo.criarEnvio({ criadorId: criador.id, usuarioId: usuario.id }, pedido);
  });
}

export async function acaoAssinarPartesVideo(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ videoId: id, partes: z.array(z.number()) }).parse(entrada);
    return provedorVideo.assinarPartes({ criadorId: criador.id, usuarioId: usuario.id }, e.videoId, e.partes);
  });
}

export async function acaoConcluirEnvioVideo(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ videoId: id, partes: z.array(z.unknown()) }).parse(entrada);
    return provedorVideo.concluirEnvio({ criadorId: criador.id, usuarioId: usuario.id }, e.videoId, { partes: e.partes });
  });
}

export async function acaoCancelarEnvioVideo(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const { videoId } = z.strictObject({ videoId: id }).parse(entrada);
    await provedorVideo.cancelarEnvio({ criadorId: criador.id, usuarioId: usuario.id }, videoId);
    return null;
  });
}

export async function acaoReprocessarVideo(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const { videoId } = z.strictObject({ videoId: id }).parse(entrada);
    return provedorVideo.reprocessar({ criadorId: criador.id, usuarioId: usuario.id }, videoId);
  });
}

/** Membro do host que `podeAssistir` a aula: devolve o contexto da reprodução. */
async function quemAssiste(aulaId: string) {
  const s = await exigirSessao();
  const m = await avaliarMembro(s, TODOS_OS_MEMBROS);
  if (!m) throw new ErroDeNegocio(MSG_SEM_PERMISSAO);
  const acesso = await acessoDaAula(m.criador.id, aulaId, { papel: m.membro.papel, membroId: m.membro.id });
  if (!acesso) throw new ErroDeNegocio("Aula não encontrada.");
  if (!acesso.pode) throw new ErroDeNegocio(MSG_SEM_PERMISSAO);
  return { s, m };
}

export async function acaoIniciarReproducao(entrada: unknown) {
  return executar(async () => {
    const { aulaId } = z.strictObject({ aulaId: id }).parse(entrada);
    const { s, m } = await quemAssiste(aulaId);
    const h = await headers();
    return provedorVideo.tokenDeReproducao(
      { criadorId: m.criador.id, usuarioId: m.usuario.id, sessaoLoginId: s.sessaoId, ip: ipDoCliente(h), userAgent: agenteDe(h) },
      aulaId,
    );
  });
}

export async function acaoRenovarReproducao(entrada: unknown) {
  return executar(async () => {
    const e = z.strictObject({ aulaId: id, videoId: id, sessaoId: id }).parse(entrada);
    const { m } = await quemAssiste(e.aulaId);
    // O vídeo tem de ser o vivo DESTA aula (a permissão foi conferida na aula).
    if ((await videoVivoDaAula(m.criador.id, e.aulaId))?.id !== e.videoId) throw new ErroDeNegocio("Vídeo trocado. Recarregue a página.");
    return provedorVideo.renovarReproducao({ criadorId: m.criador.id, usuarioId: m.usuario.id }, e.videoId, e.sessaoId);
  });
}
