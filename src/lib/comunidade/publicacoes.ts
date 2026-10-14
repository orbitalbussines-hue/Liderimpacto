import "server-only";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { apagarObjetosDescartados, descartarArquivo, MSG_ARQUIVO_INVALIDO } from "@/lib/armazenamento/arquivos";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db, type Transacao } from "@/lib/db";
import type { FinalidadeArquivo } from "@/lib/db/schema/_enums";
import {
  arquivos,
  criadores_canais as canais,
  criadores_canais_posts as posts,
  criadores_canais_posts_anexos as anexos,
  criadores_canais_posts_votos as votos,
  criadores_comentarios as comentarios,
  criadores_curtidas as curtidas,
} from "@/lib/db/schema";
import { FINALIDADES_ARQUIVO_COMUNIDADE } from "@/lib/db/schema/_enums";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { notificarCanal, notificarCurtidaNoPost } from "@/lib/notificacoes/gerar";
import { acessoDaAula } from "@/lib/video/acesso-aula";
import { canalVisivel } from "./canais";
import { enqueteAberta, JANELA_LIMITE_MIN, LIMITE_POSTS_JANELA, MSG_LIMITE, primeiroNome, problemaDosAnexos } from "./regras";
import { canalVisivelSql, ocultoVisivelSql, quemPedeDe, silenciadoAte, travarMembro, type Participante } from "./sql";

/**
 * ESCRITAS de publicações (RN-131, RN-133): publicar, editar, remover, votar na enquete e curtir.
 * A notificação sai DEPOIS do commit e nunca derruba a ação (src/lib/notificacoes/gerar.ts).
 */

export const MSG_POST_NAO_ENCONTRADO = "Publicação não encontrada.";
const formatarData = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Silenciado não publica nem comenta (nem edita). */
export async function exigirNaoSilenciado(p: Participante, agora: Date, tx?: Transacao): Promise<void> {
  const ate = await silenciadoAte(p.criadorId, p.membroId, agora, tx);
  if (ate) throw new ErroDeNegocio(`Você está silenciado na comunidade até ${formatarData(ate)}.`);
}

/** Janela deslizante contada no banco (todas as linhas, inclusive apagadas: apagar não devolve a cota). */
export async function exigirDentroDoLimite(tx: Transacao, tabela: typeof posts | typeof comentarios, membroId: string, limite: number, agora: Date) {
  const desde = new Date(agora.getTime() - JANELA_LIMITE_MIN * 60_000);
  const [r] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(tabela)
    .where(and(eq(tabela.autor_membro_id, membroId), gt(tabela.created_at, desde)));
  if ((r?.total ?? 0) >= limite) throw new ErroDeNegocio(MSG_LIMITE);
}

/** Post vivo que quem pede vê (canal visível; oculto só equipe/autor). `null` = não encontrado. */
export async function postVisivel(p: Participante, postId: string, agora: Date) {
  const q = quemPedeDe(p);
  const [l] = await db
    .select({
      id: posts.id,
      autor: posts.autor_membro_id,
      canalId: posts.canal_id,
      opcoes: posts.enquete_opcoes,
      encerraEm: posts.enquete_encerra_em,
    })
    .from(posts)
    .innerJoin(canais, eq(canais.id, posts.canal_id))
    .where(and(eq(posts.id, postId), eq(posts.criador_id, p.criadorId), vivos(posts), canalVisivelSql(q, agora), ocultoVisivelSql(q, posts)));
  return l ?? null;
}

export interface NovaPublicacao {
  canalId: string;
  texto: string;
  aulaId: string | null;
  anexoIds: string[];
  enquete: { pergunta: string; opcoes: string[]; encerraEm: Date | null } | null;
}

/**
 * Anexos do post: arquivos da COMUNIDADE, deste criador, DISPONÍVEIS, enviados por quem publica e
 * ainda sem uso (o índice único do anexo garante de novo). Fora disso: "Arquivo inválido".
 */
async function anexar(tx: Transacao, p: Participante, postId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const unicos = [...new Set(ids)];
  const achados = await tx
    .select({ id: arquivos.id, finalidade: arquivos.finalidade })
    .from(arquivos)
    .where(
      and(
        inArray(arquivos.id, unicos),
        eq(arquivos.criador_id, p.criadorId),
        inArray(arquivos.finalidade, [...FINALIDADES_ARQUIVO_COMUNIDADE]),
        eq(arquivos.status, "DISPONIVEL"),
        eq(arquivos.modified_by, p.usuarioId),
        vivos(arquivos),
      ),
    )
    .for("update");
  if (achados.length !== unicos.length) throw new ErroDeNegocio(MSG_ARQUIVO_INVALIDO);
  const problema = problemaDosAnexos(achados.map((a) => a.finalidade as FinalidadeArquivo));
  if (problema) throw new ErroDeNegocio(problema);
  const [emUso] = await tx.select({ id: anexos.id }).from(anexos).where(and(inArray(anexos.arquivo_id, unicos), vivos(anexos))).limit(1);
  if (emUso) throw new ErroDeNegocio(MSG_ARQUIVO_INVALIDO);
  await tx.insert(anexos).values(unicos.map((arquivoId, i) => ({ criador_id: p.criadorId, post_id: postId, arquivo_id: arquivoId, ordem: i + 1, modified_by: p.usuarioId })));
}

export async function publicar(p: Participante, d: NovaPublicacao, agora = new Date()): Promise<{ id: string; versao: string }> {
  if (d.enquete?.encerraEm && d.enquete.encerraEm.getTime() <= agora.getTime()) throw new ErroDeNegocio("O encerramento da enquete precisa ser no futuro.");
  if (d.aulaId) {
    const acesso = await acessoDaAula(p.criadorId, d.aulaId, { papel: p.papel, membroId: p.membroId }, agora);
    if (!acesso?.pode) throw new ErroDeNegocio("Aula não encontrada.");
  }
  const r = await db.transaction(async (tx) => {
    await travarMembro(tx, p.membroId);
    await exigirNaoSilenciado(p, agora, tx);
    const canal = await canalVisivel(quemPedeDe(p), d.canalId, agora, tx);
    if (!canal) throw new ErroDeNegocio("Canal não encontrado.");
    if (canal.quemPosta === "EQUIPE" && p.papel === "ALUNO") throw new ErroDeNegocio("Só a equipe publica neste canal.");
    await exigirDentroDoLimite(tx, posts, p.membroId, LIMITE_POSTS_JANELA, agora);
    const [post] = await tx
      .insert(posts)
      .values({
        criador_id: p.criadorId,
        canal_id: canal.id,
        autor_membro_id: p.membroId,
        aula_id: d.aulaId,
        texto: d.texto,
        enquete_pergunta: d.enquete?.pergunta ?? null,
        enquete_opcoes: d.enquete?.opcoes ?? null,
        enquete_encerra_em: d.enquete?.encerraEm ?? null,
        modified_by: p.usuarioId,
      })
      .returning({ id: posts.id, updated_at: posts.updated_at });
    await anexar(tx, p, post.id, d.anexoIds);
    await registrarAuditoria(tx, {
      userId: p.usuarioId,
      criadorId: p.criadorId,
      acao: "criar",
      tabela: "criadores_canais_posts",
      registroId: post.id,
      detalhes: `Publicou em #${canal.nome}${d.enquete ? " (com enquete)" : ""}${d.anexoIds.length ? ` com ${d.anexoIds.length} anexo(s)` : ""}`,
      dadosNovos: { canal_id: canal.id, aula_id: d.aulaId, texto: d.texto, enquete: d.enquete, anexos: d.anexoIds },
    });
    return { id: post.id, versao: post.updated_at.toISOString(), aviso: canal.quemPosta === "EQUIPE" };
  });
  if (r.aviso) await notificarCanal(p.criadorId, r.id, "AVISO", { usuarioId: p.usuarioId, membroId: p.membroId, nome: primeiroNome(p.nome) }, agora);
  return { id: r.id, versao: r.versao };
}

/** Só o autor edita o texto (anexos e enquete não mudam), com trava. Marca `editado_em`. */
export async function editarPublicacao(p: Participante, postId: string, versao: Date, texto: string, agora = new Date()): Promise<{ versao: string }> {
  return db.transaction(async (tx) => {
    await exigirNaoSilenciado(p, agora, tx);
    const doAutor = and(travaDeColisao(posts, postId, versao), eq(posts.criador_id, p.criadorId), eq(posts.autor_membro_id, p.membroId));
    const [antes] = await tx.select({ texto: posts.texto }).from(posts).where(doAutor);
    if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
    const [n] = await tx.update(posts).set({ texto, editado_em: agora, updated_at: agora, modified_by: p.usuarioId }).where(doAutor).returning({ updated_at: posts.updated_at });
    if (!n) throw new ErroDeNegocio(MSG_COLISAO);
    await registrarAuditoria(tx, {
      userId: p.usuarioId,
      criadorId: p.criadorId,
      acao: "atualizar",
      tabela: "criadores_canais_posts",
      registroId: postId,
      detalhes: "Editou a publicação",
      dadosAnteriores: antes,
      dadosNovos: { texto },
    });
    return { versao: n.updated_at.toISOString() };
  });
}

/**
 * Remove (soft delete) o post: o autor ou a equipe (`moderador`). Os anexos saem junto (registro
 * excluído; objeto apagado do storage depois do commit). Comentários ficam sem caminho até ele.
 */
export async function removerPublicacao(quem: { criadorId: string; usuarioId: string; membroId: string | null; equipe: boolean }, postId: string, versao: Date): Promise<void> {
  const chaves = await db.transaction(async (tx) => {
    if (!quem.equipe && !quem.membroId) throw new ErroDeNegocio(MSG_COLISAO);
    const permitido = quem.equipe ? undefined : eq(posts.autor_membro_id, quem.membroId!);
    const alvo = and(travaDeColisao(posts, postId, versao), eq(posts.criador_id, quem.criadorId), permitido);
    const [antes] = await tx.update(posts).set(marcaDeExclusao(quem.usuarioId)).where(alvo).returning({ texto: posts.texto, autor: posts.autor_membro_id, canal: posts.canal_id });
    if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
    const seus = await tx
      .update(anexos)
      .set(marcaDeExclusao(quem.usuarioId))
      .where(and(eq(anexos.post_id, postId), eq(anexos.criador_id, quem.criadorId), vivos(anexos)))
      .returning({ arquivoId: anexos.arquivo_id });
    const descartadas: (string | null)[] = [];
    for (const a of seus) descartadas.push(await descartarArquivo(tx, { criadorId: quem.criadorId, arquivoId: a.arquivoId, autorId: quem.usuarioId, motivo: "publicação removida" }));
    await registrarAuditoria(tx, {
      userId: quem.usuarioId,
      criadorId: quem.criadorId,
      acao: "excluir",
      tabela: "criadores_canais_posts",
      registroId: postId,
      detalhes: antes.autor === quem.membroId ? "Removeu a própria publicação" : `Removeu a publicação do membro ${antes.autor} (moderação)`,
      dadosAnteriores: antes,
    });
    return descartadas;
  });
  await apagarObjetosDescartados(quem.criadorId, chaves);
}

/** Voto único na enquete; votar de novo TROCA o voto, até o encerramento. */
export async function votarNaEnquete(p: Participante, postId: string, opcao: number, agora = new Date()): Promise<{ opcao: number }> {
  const post = await postVisivel(p, postId, agora);
  if (!post) throw new ErroDeNegocio(MSG_POST_NAO_ENCONTRADO);
  if (!post.opcoes) throw new ErroDeNegocio("Esta publicação não tem enquete.");
  if (!enqueteAberta(post.encerraEm, agora)) throw new ErroDeNegocio("A enquete já foi encerrada.");
  if (!Number.isInteger(opcao) || opcao < 0 || opcao >= post.opcoes.length) throw new ErroDeNegocio("Opção inválida.");
  await db.transaction(async (tx) => {
    const [v] = await tx
      .insert(votos)
      .values({ criador_id: p.criadorId, post_id: postId, membro_id: p.membroId, opcao, modified_by: p.usuarioId })
      .onConflictDoUpdate({ target: [votos.post_id, votos.membro_id], targetWhere: sql`is_deleted = false`, set: { opcao, updated_at: agora, modified_by: p.usuarioId } })
      .returning({ id: votos.id });
    await registrarAuditoria(tx, {
      userId: p.usuarioId,
      criadorId: p.criadorId,
      acao: "atualizar",
      tabela: "criadores_canais_posts_votos",
      registroId: v.id,
      detalhes: `Votou na opção ${opcao + 1} da enquete do post ${postId}`,
      dadosNovos: { opcao },
    });
  });
  return { opcao };
}

export type AlvoCurtida = { postId: string } | { comentarioId: string };

/** O comentário vivo e visível para quem pede (alvo: post visível ou aula que ele pode assistir). */
export async function comentarioVisivel(p: Participante, comentarioId: string, agora: Date) {
  const [c] = await db
    .select({ id: comentarios.id, postId: comentarios.post_id, aulaId: comentarios.aula_id, paiId: comentarios.pai_id, autor: comentarios.autor_membro_id })
    .from(comentarios)
    .where(and(eq(comentarios.id, comentarioId), eq(comentarios.criador_id, p.criadorId), vivos(comentarios), ocultoVisivelSql(quemPedeDe(p), comentarios)));
  if (!c) return null;
  if (c.postId) return (await postVisivel(p, c.postId, agora)) ? c : null;
  const acesso = await acessoDaAula(p.criadorId, c.aulaId!, { papel: p.papel, membroId: p.membroId }, agora);
  return acesso?.pode ? c : null;
}

/**
 * Curtir/descurtir (toggle): UMA linha por membro e alvo para sempre (descurtir = soft delete,
 * curtir de novo reativa). Contador do alvo na MESMA transação. Curtida nova em post notifica o
 * autor (agregada por dia).
 */
export async function alternarCurtida(p: Participante, alvo: AlvoCurtida, agora = new Date()): Promise<{ curtiu: boolean; curtidas: number }> {
  const ehPost = "postId" in alvo;
  const visivel = ehPost ? await postVisivel(p, alvo.postId, agora) : await comentarioVisivel(p, alvo.comentarioId, agora);
  if (!visivel) throw new ErroDeNegocio(ehPost ? MSG_POST_NAO_ENCONTRADO : "Comentário não encontrado.");
  const r = await db.transaction(async (tx) => {
    const toggle = {
      is_deleted: sql`not ${curtidas.is_deleted}`,
      deleted_at: sql`case when ${curtidas.is_deleted} then null else ${agora}::timestamptz end`,
      updated_at: agora,
      modified_by: p.usuarioId,
    };
    const base = { criador_id: p.criadorId, membro_id: p.membroId, modified_by: p.usuarioId };
    const [k] = ehPost
      ? await tx
          .insert(curtidas)
          .values({ ...base, post_id: alvo.postId })
          .onConflictDoUpdate({ target: [curtidas.membro_id, curtidas.post_id], targetWhere: sql`post_id is not null`, set: toggle })
          .returning({ id: curtidas.id, apagada: curtidas.is_deleted })
      : await tx
          .insert(curtidas)
          .values({ ...base, comentario_id: alvo.comentarioId })
          .onConflictDoUpdate({ target: [curtidas.membro_id, curtidas.comentario_id], targetWhere: sql`comentario_id is not null`, set: toggle })
          .returning({ id: curtidas.id, apagada: curtidas.is_deleted });
    const delta = k.apagada ? -1 : 1;
    const [contador] = ehPost
      ? await tx.update(posts).set({ curtidas: sql`greatest(${posts.curtidas} + ${delta}, 0)` }).where(eq(posts.id, alvo.postId)).returning({ total: posts.curtidas })
      : await tx
          .update(comentarios)
          .set({ curtidas: sql`greatest(${comentarios.curtidas} + ${delta}, 0)` })
          .where(eq(comentarios.id, alvo.comentarioId))
          .returning({ total: comentarios.curtidas });
    await registrarAuditoria(tx, {
      userId: p.usuarioId,
      criadorId: p.criadorId,
      acao: k.apagada ? "excluir" : "criar",
      tabela: "criadores_curtidas",
      registroId: k.id,
      detalhes: `${k.apagada ? "Descurtiu" : "Curtiu"} ${ehPost ? `o post ${alvo.postId}` : `o comentário ${alvo.comentarioId}`}`,
    });
    return { curtiu: !k.apagada, curtidas: contador.total };
  });
  if (ehPost && r.curtiu) await notificarCurtidaNoPost(p.criadorId, alvo.postId, { usuarioId: p.usuarioId, membroId: p.membroId, nome: primeiroNome(p.nome) }, agora);
  return r;
}
