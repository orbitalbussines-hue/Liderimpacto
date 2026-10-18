import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import { criadores_membros, criadores_membros_tags, criadores_tags } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { violouUnico } from "@/lib/membros/vinculos";

/**
 * ESCRITA das tags de membros (RN-200). Sempre na transação de quem chama, com o `criadorId` do
 * HOST e o `autor` da sessão. Trilha na mesma transação. Excluir = soft delete (a tag e os vínculos).
 */

export const MSG_TAG_DUPLICADA = "Já existe uma tag com este nome.";
const TABELA = "criadores_tags";

const duplicada = (e: unknown): never => {
  if (violouUnico(e)) throw new ErroDeNegocio(MSG_TAG_DUPLICADA);
  throw e;
};

export async function criarTag(tx: Transacao, p: { criadorId: string; autor: string; nome: string; cor: string }): Promise<{ id: string; versao: Date }> {
  const [t] = await tx
    .insert(criadores_tags)
    .values({ criador_id: p.criadorId, nome: p.nome, cor: p.cor, modified_by: p.autor })
    .returning({ id: criadores_tags.id, versao: criadores_tags.updated_at })
    .catch(duplicada);
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "criar", tabela: TABELA, registroId: t.id, detalhes: `Criou a tag "${p.nome}"`, dadosNovos: { nome: p.nome, cor: p.cor } });
  return t;
}

async function tagTravada(tx: Transacao, criadorId: string, tagId: string, versao: Date) {
  const [t] = await tx
    .select({ nome: criadores_tags.nome, cor: criadores_tags.cor })
    .from(criadores_tags)
    .where(and(travaDeColisao(criadores_tags, tagId, versao), eq(criadores_tags.criador_id, criadorId)))
    .for("update");
  if (!t) throw new ErroDeNegocio(MSG_COLISAO);
  return t;
}

export async function salvarTag(tx: Transacao, p: { criadorId: string; autor: string; tagId: string; versao: Date; nome: string; cor: string }): Promise<{ versao: Date }> {
  const antes = await tagTravada(tx, p.criadorId, p.tagId, p.versao);
  const [t] = await tx
    .update(criadores_tags)
    .set({ nome: p.nome, cor: p.cor, updated_at: new Date(), modified_by: p.autor })
    .where(and(travaDeColisao(criadores_tags, p.tagId, p.versao), eq(criadores_tags.criador_id, p.criadorId)))
    .returning({ versao: criadores_tags.updated_at })
    .catch(duplicada);
  if (!t) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "atualizar", tabela: TABELA, registroId: p.tagId, detalhes: `Editou a tag "${p.nome}"`, dadosAnteriores: antes, dadosNovos: { nome: p.nome, cor: p.cor } });
  return t;
}

/** Remove a tag de todos os membros e exclui a tag (soft delete), numa transação. */
export async function excluirTag(tx: Transacao, p: { criadorId: string; autor: string; tagId: string; versao: Date }): Promise<{ desmarcados: number }> {
  const antes = await tagTravada(tx, p.criadorId, p.tagId, p.versao);
  const vinculos = await tx
    .update(criadores_membros_tags)
    .set(marcaDeExclusao(p.autor))
    .where(and(eq(criadores_membros_tags.tag_id, p.tagId), eq(criadores_membros_tags.criador_id, p.criadorId), vivos(criadores_membros_tags)))
    .returning({ id: criadores_membros_tags.id });
  const [t] = await tx
    .update(criadores_tags)
    .set(marcaDeExclusao(p.autor))
    .where(and(travaDeColisao(criadores_tags, p.tagId, p.versao), eq(criadores_tags.criador_id, p.criadorId)))
    .returning({ id: criadores_tags.id });
  if (!t) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "excluir",
    tabela: TABELA,
    registroId: p.tagId,
    detalhes: `Excluiu a tag "${antes.nome}" (tirada de ${vinculos.length} membro(s))`,
    dadosAnteriores: antes,
  });
  return { desmarcados: vinculos.length };
}

/** Tag viva DESTE criador e os membros vivos DESTE criador entre os pedidos (outro criador = recusa). */
async function conferir(tx: Transacao, criadorId: string, tagId: string, membroIds: readonly string[]) {
  const [tag] = await tx.select({ nome: criadores_tags.nome }).from(criadores_tags).where(and(eq(criadores_tags.id, tagId), eq(criadores_tags.criador_id, criadorId), vivos(criadores_tags)));
  if (!tag) throw new ErroDeNegocio("Tag não encontrada.");
  const ids = [...new Set(membroIds)];
  const membros = await tx
    .select({ id: criadores_membros.id })
    .from(criadores_membros)
    .where(and(inArray(criadores_membros.id, ids), eq(criadores_membros.criador_id, criadorId), vivos(criadores_membros)));
  if (membros.length !== ids.length) throw new ErroDeNegocio("Membro não encontrado.");
  return { tag, ids };
}

/** Marca os membros com a tag. Idempotente: quem já tinha fica como está. */
export async function aplicarTag(tx: Transacao, p: { criadorId: string; autor: string; tagId: string; membroIds: readonly string[] }): Promise<{ aplicadas: number; jaTinham: number }> {
  const { tag, ids } = await conferir(tx, p.criadorId, p.tagId, p.membroIds);
  const novas = await tx
    .insert(criadores_membros_tags)
    .values(ids.map((membroId) => ({ criador_id: p.criadorId, membro_id: membroId, tag_id: p.tagId, modified_by: p.autor })))
    .onConflictDoNothing()
    .returning({ membroId: criadores_membros_tags.membro_id });
  if (novas.length) {
    await registrarAuditoria(tx, {
      userId: p.autor,
      criadorId: p.criadorId,
      acao: "criar",
      tabela: "criadores_membros_tags",
      registroId: p.tagId,
      detalhes: `Marcou ${novas.length} membro(s) com a tag "${tag.nome}"`,
      dadosNovos: { membro_ids: novas.map((n) => n.membroId) },
    });
  }
  return { aplicadas: novas.length, jaTinham: ids.length - novas.length };
}

/** Tira a tag dos membros (soft delete do vínculo). Quem não tinha é ignorado. */
export async function removerTag(tx: Transacao, p: { criadorId: string; autor: string; tagId: string; membroIds: readonly string[] }): Promise<{ removidas: number }> {
  const { tag, ids } = await conferir(tx, p.criadorId, p.tagId, p.membroIds);
  const fora = await tx
    .update(criadores_membros_tags)
    .set(marcaDeExclusao(p.autor))
    .where(and(eq(criadores_membros_tags.tag_id, p.tagId), eq(criadores_membros_tags.criador_id, p.criadorId), inArray(criadores_membros_tags.membro_id, ids), vivos(criadores_membros_tags)))
    .returning({ membroId: criadores_membros_tags.membro_id });
  if (fora.length) {
    await registrarAuditoria(tx, {
      userId: p.autor,
      criadorId: p.criadorId,
      acao: "excluir",
      tabela: "criadores_membros_tags",
      registroId: p.tagId,
      detalhes: `Tirou a tag "${tag.nome}" de ${fora.length} membro(s)`,
      dadosAnteriores: { membro_ids: fora.map((f) => f.membroId) },
    });
  }
  return { removidas: fora.length };
}
