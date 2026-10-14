"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { criadores_grupos, criadores_grupos_membros } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { violouUnico } from "@/lib/membros/vinculos";
import { idSchema, nomeGrupo, tipoGrupoSchema, versaoSchema } from "@/lib/validators/membros";

/**
 * Grupos de acesso/turmas do criador do HOST. DONO e ADMIN. Nome unico por criador (indice do
 * banco); renomear com trava de colisao; remover = soft delete, recusado com membros dentro.
 */

const MSG_NOME_REPETIDO = "Já existe um grupo com este nome nesta área.";
const nomeRepetido = (erro: unknown) => {
  if (violouUnico(erro)) throw new ErroDeNegocio(MSG_NOME_REPETIDO);
  throw erro;
};

/** Filtro do grupo-alvo: DESTE criador, na versao que a tela abriu. */
const doCriador = (criadorId: string, grupoId: string, versao: Date) =>
  and(travaDeColisao(criadores_grupos, grupoId, versao), eq(criadores_grupos.criador_id, criadorId));

export async function acaoCriarGrupo(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ nome: nomeGrupo, tipo: tipoGrupoSchema }).parse(entrada);
    return db
      .transaction(async (tx) => {
        const [g] = await tx
          .insert(criadores_grupos)
          .values({ criador_id: criador.id, nome: e.nome, tipo: e.tipo, modified_by: usuario.id })
          .returning({ id: criadores_grupos.id });
        await registrarAuditoria(tx, {
          userId: usuario.id,
          criadorId: criador.id,
          acao: "criar",
          tabela: "criadores_grupos",
          registroId: g.id,
          detalhes: `Criou o grupo "${e.nome}" (${e.tipo})`,
          dadosNovos: { nome: e.nome, tipo: e.tipo },
        });
        return { id: g.id };
      })
      .catch(nomeRepetido);
  });
}

export async function acaoRenomearGrupo(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ grupoId: idSchema, nome: nomeGrupo, versao: versaoSchema }).parse(entrada);
    await db
      .transaction(async (tx) => {
        const [antes] = await tx.select({ nome: criadores_grupos.nome }).from(criadores_grupos).where(doCriador(criador.id, e.grupoId, e.versao));
        if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
        const [g] = await tx
          .update(criadores_grupos)
          .set({ nome: e.nome, updated_at: new Date(), modified_by: usuario.id })
          .where(doCriador(criador.id, e.grupoId, e.versao))
          .returning({ id: criadores_grupos.id });
        if (!g) throw new ErroDeNegocio(MSG_COLISAO);
        await registrarAuditoria(tx, {
          userId: usuario.id,
          criadorId: criador.id,
          acao: "atualizar",
          tabela: "criadores_grupos",
          registroId: g.id,
          detalhes: `Renomeou o grupo "${antes.nome}" → "${e.nome}"`,
          dadosAnteriores: { nome: antes.nome },
          dadosNovos: { nome: e.nome },
        });
      })
      .catch(nomeRepetido);
    return null;
  });
}

/** Soft delete. Com membros dentro, recusa: tire-os antes (nada some sem a equipe ver). */
export async function acaoRemoverGrupo(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ grupoId: idSchema, versao: versaoSchema }).parse(entrada);
    await db.transaction(async (tx) => {
      // Trava o grupo primeiro: ninguem entra nele enquanto a contagem e feita.
      const [g] = await tx.select({ nome: criadores_grupos.nome }).from(criadores_grupos).where(doCriador(criador.id, e.grupoId, e.versao)).for("update");
      if (!g) throw new ErroDeNegocio(MSG_COLISAO);
      const [{ total }] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(criadores_grupos_membros)
        .where(and(eq(criadores_grupos_membros.grupo_id, e.grupoId), eq(criadores_grupos_membros.criador_id, criador.id), vivos(criadores_grupos_membros)));
      if (total > 0) {
        throw new ErroDeNegocio(`O grupo "${g.nome}" tem ${total} ${total === 1 ? "membro" : "membros"}. Retire-os do grupo antes de remover.`);
      }
      await tx.update(criadores_grupos).set(marcaDeExclusao(usuario.id)).where(doCriador(criador.id, e.grupoId, e.versao));
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "excluir",
        tabela: "criadores_grupos",
        registroId: e.grupoId,
        detalhes: `Removeu o grupo "${g.nome}" (exclusão lógica)`,
        dadosAnteriores: { nome: g.nome },
      });
    });
    return null;
  });
}
