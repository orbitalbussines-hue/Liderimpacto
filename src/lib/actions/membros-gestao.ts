"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro, MSG_SEM_PERMISSAO, type MembroDaRequisicao } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { db, type Transacao } from "@/lib/db";
import { criadores_membros, usuarios } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao } from "@/lib/db/soft-delete";
import { MSG_ULTIMO_DONO, podeGerir, tiraUltimoDono } from "@/lib/membros/regras";
import { definirGruposDoMembro, donosAtivosComTrava, retirarDeTodosOsGrupos } from "@/lib/membros/vinculos";
import { idSchema, papelSchema, statusMembroSchema, versaoSchema } from "@/lib/validators/membros";

/**
 * Gestao de um vinculo do criador do HOST: papel (so DONO), situacao, remocao e grupos.
 * Toda escrita: trava de colisao pelo `updated_at` do vinculo + filtro do criador da
 * requisicao (id de outro criador = "registro alterado", sem revelar nada) + trilha na mesma
 * transacao. O ultimo DONO ativo nunca sai (contagem com trava de linha).
 */

/** Vinculo-alvo DESTE criador, na versao que a tela abriu; senao, colisao. */
async function alvoTravado(tx: Transacao, criadorId: string, membroId: string, versao: Date) {
  const [alvo] = await tx
    .select({ id: criadores_membros.id, papel: criadores_membros.papel, status: criadores_membros.status, usuarioId: criadores_membros.usuario_id, email: usuarios.email })
    .from(criadores_membros)
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(and(travaDeColisao(criadores_membros, membroId, versao), eq(criadores_membros.criador_id, criadorId)));
  if (!alvo) throw new ErroDeNegocio(MSG_COLISAO);
  return alvo;
}

/** UPDATE do vinculo com a mesma trava; zero linhas = outra pessoa mexeu no meio. */
async function gravar(tx: Transacao, criadorId: string, membroId: string, versao: Date, valores: Partial<typeof criadores_membros.$inferInsert>) {
  const [linha] = await tx
    .update(criadores_membros)
    .set(valores)
    .where(and(travaDeColisao(criadores_membros, membroId, versao), eq(criadores_membros.criador_id, criadorId)))
    .returning({ id: criadores_membros.id });
  if (!linha) throw new ErroDeNegocio(MSG_COLISAO);
}

function exigirGestao(ator: MembroDaRequisicao, alvo: { papel: Parameters<typeof podeGerir>[1]; usuarioId: string }) {
  if (!podeGerir(ator.membro.papel, alvo.papel)) throw new ErroDeNegocio(MSG_SEM_PERMISSAO);
  if (alvo.usuarioId === ator.usuario.id) throw new ErroDeNegocio("Você não pode fazer isso com o seu próprio acesso.");
}

/** Promover/rebaixar: so DONO. Trilha ANTES do efeito (promover a DONO concede tudo). */
export async function acaoMudarPapel(entrada: unknown) {
  return executar(async () => {
    const ator = await exigirMembro(["DONO"]);
    const e = z.strictObject({ membroId: idSchema, papel: papelSchema, versao: versaoSchema }).parse(entrada);
    await db.transaction(async (tx) => {
      const donos = await donosAtivosComTrava(tx, ator.criador.id);
      const alvo = await alvoTravado(tx, ator.criador.id, e.membroId, e.versao);
      if (alvo.papel === e.papel) return;
      const eraDonoAtivo = alvo.papel === "DONO" && alvo.status === "ATIVO";
      if (tiraUltimoDono(donos, eraDonoAtivo, e.papel === "DONO")) throw new ErroDeNegocio(MSG_ULTIMO_DONO);
      await registrarAuditoria(tx, {
        userId: ator.usuario.id,
        criadorId: ator.criador.id,
        acao: "atualizar",
        tabela: "criadores_membros",
        registroId: alvo.id,
        detalhes: `Papel de ${alvo.email}: ${alvo.papel} → ${e.papel}`,
        dadosAnteriores: { papel: alvo.papel },
        dadosNovos: { papel: e.papel },
      });
      await gravar(tx, ator.criador.id, alvo.id, e.versao, { papel: e.papel, updated_at: new Date(), modified_by: ator.usuario.id });
    });
    return null;
  });
}

/** Inativar (perde o acesso na proxima requisicao) ou reativar. */
export async function acaoAlterarSituacaoMembro(entrada: unknown) {
  return executar(async () => {
    const ator = await exigirMembro(EQUIPE);
    const e = z.strictObject({ membroId: idSchema, status: statusMembroSchema, versao: versaoSchema }).parse(entrada);
    await db.transaction(async (tx) => {
      const donos = await donosAtivosComTrava(tx, ator.criador.id);
      const alvo = await alvoTravado(tx, ator.criador.id, e.membroId, e.versao);
      exigirGestao(ator, alvo);
      if (alvo.status === e.status) return;
      if (tiraUltimoDono(donos, alvo.papel === "DONO" && alvo.status === "ATIVO", e.status === "ATIVO")) throw new ErroDeNegocio(MSG_ULTIMO_DONO);
      await gravar(tx, ator.criador.id, alvo.id, e.versao, { status: e.status, updated_at: new Date(), modified_by: ator.usuario.id });
      await registrarAuditoria(tx, {
        userId: ator.usuario.id,
        criadorId: ator.criador.id,
        acao: "atualizar",
        tabela: "criadores_membros",
        registroId: alvo.id,
        detalhes: `Situação de ${alvo.email}: ${alvo.status} → ${e.status}`,
        dadosAnteriores: { status: alvo.status },
        dadosNovos: { status: e.status },
      });
    });
    return null;
  });
}

/** Remove o VINCULO (soft delete) e as participacoes em grupos; a conta global continua. */
export async function acaoRemoverMembro(entrada: unknown) {
  return executar(async () => {
    const ator = await exigirMembro(EQUIPE);
    const e = z.strictObject({ membroId: idSchema, versao: versaoSchema }).parse(entrada);
    await db.transaction(async (tx) => {
      const donos = await donosAtivosComTrava(tx, ator.criador.id);
      const alvo = await alvoTravado(tx, ator.criador.id, e.membroId, e.versao);
      exigirGestao(ator, alvo);
      if (tiraUltimoDono(donos, alvo.papel === "DONO" && alvo.status === "ATIVO", false)) throw new ErroDeNegocio(MSG_ULTIMO_DONO);
      await gravar(tx, ator.criador.id, alvo.id, e.versao, marcaDeExclusao(ator.usuario.id));
      await retirarDeTodosOsGrupos(tx, ator.criador.id, alvo.id, ator.usuario.id);
      await registrarAuditoria(tx, {
        userId: ator.usuario.id,
        criadorId: ator.criador.id,
        acao: "excluir",
        tabela: "criadores_membros",
        registroId: alvo.id,
        detalhes: `Removeu ${alvo.email} desta área (exclusão lógica do vínculo; a conta continua)`,
        dadosAnteriores: { papel: alvo.papel, status: alvo.status },
      });
    });
    return null;
  });
}

/** Deixa o membro exatamente nos grupos marcados (adicionar e retirar numa tela so). */
export async function acaoDefinirGruposDoMembro(entrada: unknown) {
  return executar(async () => {
    const ator = await exigirMembro(EQUIPE);
    const e = z
      .strictObject({ membroId: idSchema, grupoIds: z.array(idSchema).max(50, "Grupos demais."), versao: versaoSchema })
      .parse(entrada);
    await db.transaction(async (tx) => {
      const alvo = await alvoTravado(tx, ator.criador.id, e.membroId, e.versao);
      if (!podeGerir(ator.membro.papel, alvo.papel)) throw new ErroDeNegocio(MSG_SEM_PERMISSAO);
      // A versao do vinculo sobe: duas telas editando os grupos do mesmo membro colidem.
      await gravar(tx, ator.criador.id, alvo.id, e.versao, { updated_at: new Date(), modified_by: ator.usuario.id });
      const g = await definirGruposDoMembro(tx, { criadorId: ator.criador.id, membroId: alvo.id, grupoIds: e.grupoIds, autorId: ator.usuario.id });
      await registrarAuditoria(tx, {
        userId: ator.usuario.id,
        criadorId: ator.criador.id,
        acao: "atualizar",
        tabela: "criadores_grupos_membros",
        registroId: alvo.id,
        detalhes: `Grupos de ${alvo.email}: [${g.antes.join(", ")}] → [${g.depois.join(", ")}]`,
        dadosAnteriores: { grupos: g.antes },
        dadosNovos: { grupos: g.depois },
      });
    });
    return null;
  });
}
