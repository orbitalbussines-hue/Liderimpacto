"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro, MSG_SEM_PERMISSAO } from "@/lib/auth/autorizacao";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { produtos_modulos_aulas_anotacoes as nota } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao } from "@/lib/db/soft-delete";
import { acessoDaAula } from "@/lib/video/acesso-aula";
import { idSchema, tempoSegSchema, textoAnotacaoSchema, versaoSchema } from "@/lib/validators/progresso";

/**
 * Anotações com tempo (RN-120): só de quem pode assistir a aula; cada membro vê e mexe só nas
 * PRÓPRIAS (o dono vem da sessão, nunca do corpo). Editar/remover com trava de colisão (duas
 * abas abertas) e trilha. Remover = soft delete.
 */

async function membroComVinculo() {
  const m = await exigirMembro(TODOS_OS_MEMBROS);
  if (!m.membro.id) throw new ErroDeNegocio("Anotações valem só para quem é membro desta área.");
  return { ...m, membroId: m.membro.id };
}

const daPessoa = (anotacaoId: string, versao: Date, criadorId: string, membroId: string) =>
  and(travaDeColisao(nota, anotacaoId, versao), eq(nota.criador_id, criadorId), eq(nota.membro_id, membroId));

export async function acaoCriarAnotacao(entrada: unknown) {
  return executar(async () => {
    const e = z.strictObject({ aulaId: idSchema, tempoSeg: tempoSegSchema, texto: textoAnotacaoSchema }).parse(entrada);
    const { usuario, criador, membro, membroId } = await membroComVinculo();
    const acesso = await acessoDaAula(criador.id, e.aulaId, { papel: membro.papel, membroId });
    if (!acesso) throw new ErroDeNegocio("Aula não encontrada.");
    if (!acesso.pode) throw new ErroDeNegocio(MSG_SEM_PERMISSAO);
    return db.transaction(async (tx) => {
      const [n] = await tx
        .insert(nota)
        .values({ criador_id: criador.id, membro_id: membroId, aula_id: e.aulaId, tempo_seg: e.tempoSeg, texto: e.texto, modified_by: usuario.id })
        .returning({ id: nota.id, updated_at: nota.updated_at });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "criar",
        tabela: "produtos_modulos_aulas_anotacoes",
        registroId: n.id,
        detalhes: `Anotação na aula ${e.aulaId} em ${e.tempoSeg} s`,
        dadosNovos: { tempo_seg: e.tempoSeg, texto: e.texto },
      });
      return { id: n.id, versao: n.updated_at.toISOString() };
    });
  });
}

export async function acaoEditarAnotacao(entrada: unknown) {
  return executar(async () => {
    const e = z.strictObject({ anotacaoId: idSchema, versao: versaoSchema, texto: textoAnotacaoSchema, tempoSeg: tempoSegSchema.optional() }).parse(entrada);
    const { usuario, criador, membroId } = await membroComVinculo();
    return db.transaction(async (tx) => {
      const [antes] = await tx.select({ texto: nota.texto, tempo_seg: nota.tempo_seg }).from(nota).where(daPessoa(e.anotacaoId, e.versao, criador.id, membroId));
      if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
      const [n] = await tx
        .update(nota)
        .set({ texto: e.texto, tempo_seg: e.tempoSeg ?? antes.tempo_seg, updated_at: new Date(), modified_by: usuario.id })
        .where(daPessoa(e.anotacaoId, e.versao, criador.id, membroId))
        .returning({ updated_at: nota.updated_at });
      if (!n) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "produtos_modulos_aulas_anotacoes",
        registroId: e.anotacaoId,
        detalhes: "Editou a anotação",
        dadosAnteriores: antes,
        dadosNovos: { texto: e.texto, tempo_seg: e.tempoSeg ?? antes.tempo_seg },
      });
      return { versao: n.updated_at.toISOString() };
    });
  });
}

export async function acaoRemoverAnotacao(entrada: unknown) {
  return executar(async () => {
    const e = z.strictObject({ anotacaoId: idSchema, versao: versaoSchema }).parse(entrada);
    const { usuario, criador, membroId } = await membroComVinculo();
    return db.transaction(async (tx) => {
      const [n] = await tx
        .update(nota)
        .set(marcaDeExclusao(usuario.id))
        .where(daPessoa(e.anotacaoId, e.versao, criador.id, membroId))
        .returning({ texto: nota.texto, tempo_seg: nota.tempo_seg });
      if (!n) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "excluir",
        tabela: "produtos_modulos_aulas_anotacoes",
        registroId: e.anotacaoId,
        detalhes: "Removeu a anotação",
        dadosAnteriores: n,
      });
      return null;
    });
  });
}
