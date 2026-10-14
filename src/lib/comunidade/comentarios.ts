import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import { criadores_canais_posts as posts, criadores_comentarios as comentarios } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { notificarComentario } from "@/lib/notificacoes/gerar";
import { acessoDaAula } from "@/lib/video/acesso-aula";
import { comentarioVisivel, exigirDentroDoLimite, exigirNaoSilenciado, MSG_POST_NAO_ENCONTRADO, postVisivel } from "./publicacoes";
import { LIMITE_COMENTARIOS_JANELA, primeiroNome } from "./regras";
import { travarMembro, type Participante } from "./sql";

/**
 * Comentários (RN-132) em POST ou em AULA (aba "Comentários" do player: só quem pode assistir a
 * aula). Uma resposta de nível só: responder a uma resposta pendura no comentário principal dela.
 */

export const MSG_COMENTARIO_NAO_ENCONTRADO = "Comentário não encontrado.";

export type AlvoComentario = { postId: string } | { aulaId: string };

export async function comentar(p: Participante, alvo: AlvoComentario, texto: string, paiId: string | null, agora = new Date()): Promise<{ id: string; versao: string }> {
  if ("postId" in alvo) {
    if (!(await postVisivel(p, alvo.postId, agora))) throw new ErroDeNegocio(MSG_POST_NAO_ENCONTRADO);
  } else {
    const acesso = await acessoDaAula(p.criadorId, alvo.aulaId, { papel: p.papel, membroId: p.membroId }, agora);
    if (!acesso?.pode) throw new ErroDeNegocio("Aula não encontrada.");
  }
  let pai: string | null = null;
  if (paiId) {
    const c = await comentarioVisivel(p, paiId, agora);
    const mesmoAlvo = c && ("postId" in alvo ? c.postId === alvo.postId : c.aulaId === alvo.aulaId);
    if (!c || !mesmoAlvo) throw new ErroDeNegocio(MSG_COMENTARIO_NAO_ENCONTRADO);
    pai = c.paiId ?? c.id;
  }
  const r = await db.transaction(async (tx) => {
    await travarMembro(tx, p.membroId);
    await exigirNaoSilenciado(p, agora, tx);
    await exigirDentroDoLimite(tx, comentarios, p.membroId, LIMITE_COMENTARIOS_JANELA, agora);
    const [c] = await tx
      .insert(comentarios)
      .values({
        criador_id: p.criadorId,
        post_id: "postId" in alvo ? alvo.postId : null,
        aula_id: "aulaId" in alvo ? alvo.aulaId : null,
        pai_id: pai,
        autor_membro_id: p.membroId,
        texto,
        modified_by: p.usuarioId,
      })
      .returning({ id: comentarios.id, updated_at: comentarios.updated_at });
    if ("postId" in alvo) await tx.update(posts).set({ comentarios: sql`${posts.comentarios} + 1` }).where(eq(posts.id, alvo.postId));
    await registrarAuditoria(tx, {
      userId: p.usuarioId,
      criadorId: p.criadorId,
      acao: "criar",
      tabela: "criadores_comentarios",
      registroId: c.id,
      detalhes: `${pai ? "Respondeu a um comentário" : "Comentou"} ${"postId" in alvo ? `no post ${alvo.postId}` : `na aula ${alvo.aulaId}`}`,
      dadosNovos: { ...alvo, pai_id: pai, texto },
    });
    return { id: c.id, versao: c.updated_at.toISOString() };
  });
  await notificarComentario(p.criadorId, r.id, { usuarioId: p.usuarioId, membroId: p.membroId, nome: primeiroNome(p.nome) });
  return r;
}

/** Só o autor edita, com trava. Marca `editado_em`. */
export async function editarComentario(p: Participante, comentarioId: string, versao: Date, texto: string, agora = new Date()): Promise<{ versao: string }> {
  return db.transaction(async (tx) => {
    await exigirNaoSilenciado(p, agora, tx);
    const doAutor = and(travaDeColisao(comentarios, comentarioId, versao), eq(comentarios.criador_id, p.criadorId), eq(comentarios.autor_membro_id, p.membroId));
    const [antes] = await tx.select({ texto: comentarios.texto }).from(comentarios).where(doAutor);
    if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
    const [n] = await tx
      .update(comentarios)
      .set({ texto, editado_em: agora, updated_at: agora, modified_by: p.usuarioId })
      .where(doAutor)
      .returning({ updated_at: comentarios.updated_at });
    if (!n) throw new ErroDeNegocio(MSG_COLISAO);
    await registrarAuditoria(tx, {
      userId: p.usuarioId,
      criadorId: p.criadorId,
      acao: "atualizar",
      tabela: "criadores_comentarios",
      registroId: comentarioId,
      detalhes: "Editou o comentário",
      dadosAnteriores: antes,
      dadosNovos: { texto },
    });
    return { versao: n.updated_at.toISOString() };
  });
}

/** Remove (soft delete) o comentário e as respostas dele: o autor ou a equipe. Desconta do post. */
export async function removerComentario(quem: { criadorId: string; usuarioId: string; membroId: string | null; equipe: boolean }, comentarioId: string, versao: Date): Promise<void> {
  await db.transaction(async (tx) => {
    if (!quem.equipe && !quem.membroId) throw new ErroDeNegocio(MSG_COLISAO);
    const permitido = quem.equipe ? undefined : eq(comentarios.autor_membro_id, quem.membroId!);
    const alvo = and(travaDeColisao(comentarios, comentarioId, versao), eq(comentarios.criador_id, quem.criadorId), permitido);
    const [antes] = await tx.update(comentarios).set(marcaDeExclusao(quem.usuarioId)).where(alvo).returning({ texto: comentarios.texto, autor: comentarios.autor_membro_id, postId: comentarios.post_id });
    if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
    const respostas = await tx
      .update(comentarios)
      .set(marcaDeExclusao(quem.usuarioId))
      .where(and(eq(comentarios.pai_id, comentarioId), eq(comentarios.criador_id, quem.criadorId), vivos(comentarios)))
      .returning({ id: comentarios.id });
    if (antes.postId) {
      await tx
        .update(posts)
        .set({ comentarios: sql`greatest(${posts.comentarios} - ${1 + respostas.length}, 0)` })
        .where(eq(posts.id, antes.postId));
    }
    await registrarAuditoria(tx, {
      userId: quem.usuarioId,
      criadorId: quem.criadorId,
      acao: "excluir",
      tabela: "criadores_comentarios",
      registroId: comentarioId,
      detalhes: `${antes.autor === quem.membroId ? "Removeu o próprio comentário" : `Removeu o comentário do membro ${antes.autor} (moderação)`}${respostas.length ? ` e ${respostas.length} resposta(s)` : ""}`,
      dadosAnteriores: antes,
    });
  });
}
