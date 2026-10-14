"use server";

import { and, desc, eq, ne, type SQL } from "drizzle-orm";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { criadores_membros_favoritos as fav, produtos, produtos_modulos, produtos_modulos_aulas } from "@/lib/db/schema";
import { marcaDeExclusao, vivos } from "@/lib/db/soft-delete";
import { alvoFavoritoSchema } from "@/lib/validators/progresso";

/**
 * "Minha lista" (RN-119): favoritar/desfavoritar um curso ou uma aula. Idempotente (clicar duas
 * vezes não duplica nem erra), sem trava de colisão: o estado final é o pedido. Desfavoritar =
 * soft delete; favoritar de novo REATIVA a linha mais recente. Membro e criador vêm da sessão.
 */

const MSG_NAO_ENCONTRADO = "Curso ou aula não encontrado.";

async function membroComVinculo() {
  const m = await exigirMembro(TODOS_OS_MEMBROS);
  if (!m.membro.id) throw new ErroDeNegocio("A lista vale só para quem é membro desta área.");
  return { ...m, membroId: m.membro.id };
}

/** O alvo existe NESTE criador e aparece para quem pede (aluno: fora de rascunho). */
async function alvoVisivel(criadorId: string, alvo: { produtoId: string } | { aulaId: string }, equipe: boolean): Promise<boolean> {
  const publicado = equipe ? [] : [ne(produtos.status, "RASCUNHO")];
  if ("produtoId" in alvo) {
    const [p] = await db
      .select({ id: produtos.id })
      .from(produtos)
      .where(and(eq(produtos.id, alvo.produtoId), eq(produtos.criador_id, criadorId), vivos(produtos), ...publicado));
    return !!p;
  }
  const [a] = await db
    .select({ id: produtos_modulos_aulas.id })
    .from(produtos_modulos_aulas)
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
    .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id))
    .where(and(eq(produtos_modulos_aulas.id, alvo.aulaId), eq(produtos_modulos_aulas.criador_id, criadorId), vivos(produtos_modulos_aulas), vivos(produtos_modulos), vivos(produtos), ...publicado));
  return !!a;
}

const doAlvo = (membroId: string, alvo: { produtoId: string } | { aulaId: string }): SQL =>
  and(eq(fav.membro_id, membroId), "produtoId" in alvo ? eq(fav.produto_id, alvo.produtoId) : eq(fav.aula_id, alvo.aulaId))!;

export async function acaoFavoritar(entrada: unknown) {
  return executar(async () => {
    const alvo = alvoFavoritoSchema.parse(entrada);
    const { usuario, criador, membro, membroId } = await membroComVinculo();
    if (!(await alvoVisivel(criador.id, alvo, membro.papel !== "ALUNO"))) throw new ErroDeNegocio(MSG_NAO_ENCONTRADO);
    return db.transaction(async (tx) => {
      const [vivo] = await tx.select({ id: fav.id }).from(fav).where(and(doAlvo(membroId, alvo), eq(fav.criador_id, criador.id), vivos(fav)));
      if (vivo) return { favorito: true };
      const agora = new Date();
      const [antigo] = await tx
        .select({ id: fav.id })
        .from(fav)
        .where(and(doAlvo(membroId, alvo), eq(fav.criador_id, criador.id), eq(fav.is_deleted, true)))
        .orderBy(desc(fav.deleted_at))
        .limit(1);
      const [linha] = antigo
        ? await tx
            .update(fav)
            .set({ is_deleted: false, deleted_at: null, updated_at: agora, modified_by: usuario.id })
            .where(and(eq(fav.id, antigo.id), eq(fav.is_deleted, true)))
            .returning({ id: fav.id })
        : await tx
            .insert(fav)
            .values({
              criador_id: criador.id,
              membro_id: membroId,
              produto_id: "produtoId" in alvo ? alvo.produtoId : null,
              aula_id: "aulaId" in alvo ? alvo.aulaId : null,
              modified_by: usuario.id,
            })
            .onConflictDoNothing()
            .returning({ id: fav.id });
      // Sem linha = outro clique simultâneo já favoritou: o estado pedido já vale.
      if (linha) {
        await registrarAuditoria(tx, {
          userId: usuario.id,
          criadorId: criador.id,
          acao: antigo ? "atualizar" : "criar",
          tabela: "criadores_membros_favoritos",
          registroId: linha.id,
          detalhes: `${antigo ? "Favoritou de novo" : "Favoritou"} ${"produtoId" in alvo ? `o curso ${alvo.produtoId}` : `a aula ${alvo.aulaId}`}`,
        });
      }
      return { favorito: true };
    });
  });
}

export async function acaoDesfavoritar(entrada: unknown) {
  return executar(async () => {
    const alvo = alvoFavoritoSchema.parse(entrada);
    const { usuario, criador, membroId } = await membroComVinculo();
    return db.transaction(async (tx) => {
      const [linha] = await tx
        .update(fav)
        .set(marcaDeExclusao(usuario.id))
        .where(and(doAlvo(membroId, alvo), eq(fav.criador_id, criador.id), vivos(fav)))
        .returning({ id: fav.id });
      if (linha) {
        await registrarAuditoria(tx, {
          userId: usuario.id,
          criadorId: criador.id,
          acao: "excluir",
          tabela: "criadores_membros_favoritos",
          registroId: linha.id,
          detalhes: `Tirou da lista ${"produtoId" in alvo ? `o curso ${alvo.produtoId}` : `a aula ${alvo.aulaId}`}`,
        });
      }
      return { favorito: false };
    });
  });
}
