import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import type { SituacaoDenuncia } from "@/lib/db/schema/_enums";
import {
  criadores_canais_posts as posts,
  criadores_comentarios as comentarios,
  criadores_denuncias as denuncias,
  criadores_membros as membros,
  criadores_membros_silenciamentos as silencios,
  usuarios,
} from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { violouUnico } from "@/lib/membros/vinculos";
import { notificarCanal, notificarDenuncia } from "@/lib/notificacoes/gerar";
import { comentarioVisivel, postVisivel } from "./publicacoes";
import { primeiroNome, resumo } from "./regras";
import type { Moderador, Participante } from "./sql";

/**
 * MODERAÇÃO (RN-132): a equipe fixa, oculta (com motivo) e reexibe, resolve denúncias e silencia
 * membros; qualquer membro denuncia. Quem chama já conferiu EQUIPE (actions). Tudo na trilha.
 */

const ator = (m: Moderador) => ({ usuarioId: m.usuarioId, membroId: m.membroId, nome: primeiroNome(m.nome) });

/** Fixar/desfixar (com trava). Fixar notifica quem vê o canal (uma vez por post). */
export async function fixarPublicacao(m: Moderador, postId: string, versao: Date, fixar: boolean, agora = new Date()): Promise<{ versao: string }> {
  const r = await db.transaction(async (tx) => {
    const alvo = and(travaDeColisao(posts, postId, versao), eq(posts.criador_id, m.criadorId));
    const [n] = await tx
      .update(posts)
      .set({ fixado_em: fixar ? agora : null, updated_at: agora, modified_by: m.usuarioId })
      .where(alvo)
      .returning({ updated_at: posts.updated_at });
    if (!n) throw new ErroDeNegocio(MSG_COLISAO);
    await registrarAuditoria(tx, {
      userId: m.usuarioId,
      criadorId: m.criadorId,
      acao: "atualizar",
      tabela: "criadores_canais_posts",
      registroId: postId,
      detalhes: fixar ? "Fixou a publicação" : "Desfixou a publicação",
      dadosNovos: { fixado: fixar },
    });
    return { versao: n.updated_at.toISOString() };
  });
  if (fixar) await notificarCanal(m.criadorId, postId, "POST_FIXADO", ator(m), agora);
  return r;
}

/** Ocultar (motivo obrigatório, 3+ letras) ou reexibir um post ou comentário, com trava. */
export async function ocultar(
  m: Moderador,
  alvo: { postId: string } | { comentarioId: string },
  versao: Date,
  o: { ocultar: true; motivo: string } | { ocultar: false },
  agora = new Date(),
): Promise<{ versao: string }> {
  const t = "postId" in alvo ? posts : comentarios;
  const id = "postId" in alvo ? alvo.postId : alvo.comentarioId;
  return db.transaction(async (tx) => {
    const onde = and(travaDeColisao(t, id, versao), eq(t.criador_id, m.criadorId));
    const [n] = await tx
      .update(t)
      .set({ oculto_em: o.ocultar ? agora : null, motivo_ocultacao: o.ocultar ? o.motivo : null, updated_at: agora, modified_by: m.usuarioId })
      .where(onde)
      .returning({ updated_at: t.updated_at });
    if (!n) throw new ErroDeNegocio(MSG_COLISAO);
    await registrarAuditoria(tx, {
      userId: m.usuarioId,
      criadorId: m.criadorId,
      acao: "atualizar",
      tabela: "postId" in alvo ? "criadores_canais_posts" : "criadores_comentarios",
      registroId: id,
      detalhes: o.ocultar ? `Ocultou pela moderação: ${o.motivo}` : "Reexibiu (moderação)",
      dadosNovos: o.ocultar ? { oculto: true, motivo: o.motivo } : { oculto: false },
    });
    return { versao: n.updated_at.toISOString() };
  });
}

/** Qualquer membro denuncia post/comentário que vê (não o próprio; uma vez por alvo). Notifica a equipe. */
export async function denunciar(p: Participante, alvo: { postId: string } | { comentarioId: string }, motivo: string, agora = new Date()): Promise<{ id: string }> {
  const ehPost = "postId" in alvo;
  const visto = ehPost ? await postVisivel(p, alvo.postId, agora) : await comentarioVisivel(p, alvo.comentarioId, agora);
  if (!visto) throw new ErroDeNegocio(ehPost ? "Publicação não encontrada." : "Comentário não encontrado.");
  if (visto.autor === p.membroId) throw new ErroDeNegocio("Você não pode denunciar o que você mesmo escreveu.");
  const r = await db
    .transaction(async (tx) => {
      const [d] = await tx
        .insert(denuncias)
        .values({
          criador_id: p.criadorId,
          denunciante_membro_id: p.membroId,
          post_id: ehPost ? alvo.postId : null,
          comentario_id: ehPost ? null : alvo.comentarioId,
          motivo,
          modified_by: p.usuarioId,
        })
        .returning({ id: denuncias.id });
      await registrarAuditoria(tx, {
        userId: p.usuarioId,
        criadorId: p.criadorId,
        acao: "criar",
        tabela: "criadores_denuncias",
        registroId: d.id,
        detalhes: `Denunciou ${ehPost ? `o post ${alvo.postId}` : `o comentário ${alvo.comentarioId}`}`,
        dadosNovos: { ...alvo, motivo },
      });
      return d;
    })
    .catch((e: unknown) => {
      if (violouUnico(e)) throw new ErroDeNegocio("Você já denunciou isto. A equipe vai analisar.");
      throw e;
    });
  await notificarDenuncia(p.criadorId, r.id, { usuarioId: p.usuarioId, membroId: p.membroId, nome: primeiroNome(p.nome) });
  return r;
}

/** Fecha a denúncia (RESOLVIDA = agiu; DESCARTADA = sem problema), com trava e decisão opcional. */
export async function resolverDenuncia(m: Moderador, denunciaId: string, versao: Date, situacao: Exclude<SituacaoDenuncia, "ABERTA">, decisao: string | null, agora = new Date()) {
  return db.transaction(async (tx) => {
    const onde = and(travaDeColisao(denuncias, denunciaId, versao), eq(denuncias.criador_id, m.criadorId), eq(denuncias.situacao, "ABERTA"));
    const [n] = await tx
      .update(denuncias)
      .set({ situacao, decisao, resolvida_em: agora, updated_at: agora, modified_by: m.usuarioId })
      .where(onde)
      .returning({ updated_at: denuncias.updated_at });
    if (!n) throw new ErroDeNegocio(MSG_COLISAO);
    await registrarAuditoria(tx, {
      userId: m.usuarioId,
      criadorId: m.criadorId,
      acao: "atualizar",
      tabela: "criadores_denuncias",
      registroId: denunciaId,
      detalhes: `Denúncia ${situacao === "RESOLVIDA" ? "resolvida" : "descartada"}${decisao ? `: ${decisao}` : ""}`,
      dadosAnteriores: { situacao: "ABERTA" },
      dadosNovos: { situacao, decisao },
    });
    return { versao: n.updated_at.toISOString() };
  });
}

/** Silencia um ALUNO deste criador por N dias (refaz o prazo se já estava). Equipe não é silenciada. */
export async function silenciar(m: Moderador, membroId: string, dias: number, motivo: string, agora = new Date()): Promise<{ ate: Date }> {
  const ate = new Date(agora.getTime() + dias * 86_400_000);
  await db.transaction(async (tx) => {
    const [alvo] = await tx
      .select({ papel: membros.papel })
      .from(membros)
      .where(and(eq(membros.id, membroId), eq(membros.criador_id, m.criadorId), vivos(membros)))
      .for("update");
    if (!alvo) throw new ErroDeNegocio("Membro não encontrado.");
    if (alvo.papel !== "ALUNO") throw new ErroDeNegocio("Só alunos podem ser silenciados.");
    const [antes] = await tx
      .update(silencios)
      .set({ ate, motivo, updated_at: agora, modified_by: m.usuarioId })
      .where(and(eq(silencios.membro_id, membroId), eq(silencios.criador_id, m.criadorId), vivos(silencios)))
      .returning({ id: silencios.id });
    const id = antes?.id ?? (await tx.insert(silencios).values({ criador_id: m.criadorId, membro_id: membroId, ate, motivo, modified_by: m.usuarioId }).returning({ id: silencios.id }))[0].id;
    await registrarAuditoria(tx, {
      userId: m.usuarioId,
      criadorId: m.criadorId,
      acao: antes ? "atualizar" : "criar",
      tabela: "criadores_membros_silenciamentos",
      registroId: id,
      detalhes: `Silenciou o membro ${membroId} na comunidade por ${dias} dia(s): ${motivo}`,
      dadosNovos: { membro_id: membroId, ate: ate.toISOString(), motivo },
    });
  });
  return { ate };
}

/** Tira o silêncio antes do prazo (soft delete da linha). */
export async function dessilenciar(m: Moderador, membroId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [l] = await tx
      .update(silencios)
      .set(marcaDeExclusao(m.usuarioId))
      .where(and(eq(silencios.membro_id, membroId), eq(silencios.criador_id, m.criadorId), vivos(silencios)))
      .returning({ id: silencios.id });
    if (!l) throw new ErroDeNegocio("Este membro não está silenciado.");
    await registrarAuditoria(tx, {
      userId: m.usuarioId,
      criadorId: m.criadorId,
      acao: "excluir",
      tabela: "criadores_membros_silenciamentos",
      registroId: l.id,
      detalhes: `Tirou o silêncio do membro ${membroId}`,
    });
  });
}

// ---------------------------------------------------------------- leituras da equipe

export interface DenunciaDaFila {
  id: string;
  situacao: SituacaoDenuncia;
  motivo: string;
  decisao: string | null;
  criadaEm: Date;
  denunciante: { membroId: string; nome: string };
  alvo: {
    tipo: "POST" | "COMENTARIO";
    id: string;
    /** Post do alvo (o do comentário, se for comentário): abre `/comunidade?post=<id>`. Nulo = comentário de aula. */
    postId: string | null;
    aulaId: string | null;
    /** DONO/ADMIN: a tela esconde "Silenciar autor" (o serviço recusa). */
    autor: { membroId: string; nome: string; equipe: boolean };
    trecho: string;
    oculto: boolean;
    removido: boolean;
    /** `updated_at` ISO do post/comentário: a trava de `acaoOcultar`/remover. */
    versao: string;
  };
  /** Trava da DENÚNCIA (`acaoResolverDenuncia`). */
  versao: string;
}

const autores = alias(membros, "autores");
const autoresUsuarios = alias(usuarios, "autores_usuarios");

/** Fila de denúncias (padrão: ABERTAS, mais recentes primeiro; até 100). Só para a equipe. */
export async function filaDeDenuncias(criadorId: string, situacao: SituacaoDenuncia = "ABERTA"): Promise<DenunciaDaFila[]> {
  const linhas = await db
    .select({
      id: denuncias.id,
      situacao: denuncias.situacao,
      motivo: denuncias.motivo,
      decisao: denuncias.decisao,
      criadaEm: denuncias.created_at,
      updatedAt: denuncias.updated_at,
      denuncianteId: membros.id,
      denuncianteNome: usuarios.nome,
      postId: denuncias.post_id,
      comentarioId: denuncias.comentario_id,
      autorId: autores.id,
      autorNome: autoresUsuarios.nome,
      autorPapel: autores.papel,
      alvoAtualizadoEm: sql<Date>`coalesce(${posts.updated_at}, ${comentarios.updated_at})`.mapWith(posts.updated_at),
      texto: sql<string>`coalesce(${posts.texto}, ${comentarios.texto})`,
      oculto: sql<boolean>`coalesce(${posts.oculto_em}, ${comentarios.oculto_em}) is not null`,
      removido: sql<boolean>`coalesce(${posts.is_deleted}, ${comentarios.is_deleted})`,
      postDoComentario: comentarios.post_id,
      aulaDoComentario: comentarios.aula_id,
    })
    .from(denuncias)
    .innerJoin(membros, eq(membros.id, denuncias.denunciante_membro_id))
    .innerJoin(usuarios, eq(usuarios.id, membros.usuario_id))
    .leftJoin(posts, eq(posts.id, denuncias.post_id))
    .leftJoin(comentarios, eq(comentarios.id, denuncias.comentario_id))
    .innerJoin(autores, eq(autores.id, sql`coalesce(${posts.autor_membro_id}, ${comentarios.autor_membro_id})`))
    .innerJoin(autoresUsuarios, eq(autoresUsuarios.id, autores.usuario_id))
    .where(and(eq(denuncias.criador_id, criadorId), vivos(denuncias), eq(denuncias.situacao, situacao)))
    .orderBy(desc(denuncias.created_at))
    .limit(100);
  return linhas.map((l) => ({
    id: l.id,
    situacao: l.situacao,
    motivo: l.motivo,
    decisao: l.decisao,
    criadaEm: l.criadaEm,
    denunciante: { membroId: l.denuncianteId, nome: l.denuncianteNome },
    alvo: {
      tipo: l.postId ? "POST" : "COMENTARIO",
      id: (l.postId ?? l.comentarioId)!,
      postId: l.postId ?? l.postDoComentario,
      aulaId: l.aulaDoComentario,
      autor: { membroId: l.autorId, nome: l.autorNome, equipe: l.autorPapel !== "ALUNO" },
      trecho: resumo(l.texto, 140),
      oculto: l.oculto,
      removido: l.removido,
      versao: l.alvoAtualizadoEm.toISOString(),
    },
    versao: l.updatedAt.toISOString(),
  }));
}

/** Membros silenciados AGORA (prazo no futuro). */
export async function membrosSilenciados(criadorId: string, agora = new Date()) {
  return db
    .select({ membroId: silencios.membro_id, nome: usuarios.nome, ate: silencios.ate, motivo: silencios.motivo })
    .from(silencios)
    .innerJoin(membros, eq(membros.id, silencios.membro_id))
    .innerJoin(usuarios, eq(usuarios.id, membros.usuario_id))
    .where(and(eq(silencios.criador_id, criadorId), vivos(silencios), gt(silencios.ate, agora)))
    .orderBy(silencios.ate);
}
