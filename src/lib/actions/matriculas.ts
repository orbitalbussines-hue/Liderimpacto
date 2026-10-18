"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { produtos_matriculas } from "@/lib/db/schema";
import { MSG_COLISAO, vivos } from "@/lib/db/soft-delete";
import { buscarMembros } from "@/lib/matriculas/consultas";
import { notificarMatriculas } from "@/lib/notificacoes/gerar";
import { MSG_EXPIRACAO_PASSADA, expiracaoValida } from "@/lib/matriculas/regras";
import {
  alterarExpiracao,
  cancelarMatricula,
  contagemVazia,
  matricular,
  matricularGrupo,
  somar,
  type ContagemMatriculas,
} from "@/lib/matriculas/servico";
import { violouUnico } from "@/lib/membros/vinculos";
import { webhookMatriculas } from "@/lib/webhooks/emitir";
import { alterarExpiracaoSchema, cancelarMatriculaSchema, expiracaoOpcional, matricularSchema } from "@/lib/validators/matriculas";
import { idSchema, versaoSchema } from "@/lib/validators/membros";

/**
 * Matriculas do criador do HOST (RN-116). DONO e ADMIN (ALUNO: "Sem permissão" em todas). A
 * regra mora em src/lib/matriculas/servico.ts; aqui so sessao, Zod e transacao. A trilha de cada
 * matricula e gravada pelo servico, na mesma transacao.
 */

const concorrencia = (erro: unknown): never => {
  if (violouUnico(erro)) throw new ErroDeNegocio("Outra pessoa matriculou ao mesmo tempo. Nada foi gravado; tente de novo.");
  throw erro;
};

export interface ResultadoMatricular extends ContagemMatriculas {
  pessoas: number;
  produtos: number;
}

/** Pessoas escolhidas OU um grupo inteiro, em um ou mais produtos, numa transacao so. */
export async function acaoMatricular(entrada: unknown) {
  return executar(async (): Promise<ResultadoMatricular> => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = matricularSchema.parse(entrada);
    const agora = new Date();
    if (!expiracaoValida(e.expiraEm, agora)) throw new ErroDeNegocio(MSG_EXPIRACAO_PASSADA);
    // Ordem fixa dos pares: os locks saem sempre na mesma ordem.
    const produtoIds = [...new Set(e.produtoIds)].sort();
    const membroIds = [...new Set(e.membroIds)].sort();
    const base = { criadorId: criador.id, origem: "MANUAL" as const, expiraEm: e.expiraEm, autor: usuario.id, agora };

    const novas: string[] = [];
    const r = await db
      .transaction(async (tx) => {
        const c = contagemVazia();
        let pessoas = membroIds.length;
        for (const produtoId of produtoIds) {
          if (e.grupoId) {
            const g = await matricularGrupo(tx, { ...base, produtoId, grupoId: e.grupoId }, novas);
            if (g.membros === 0) throw new ErroDeNegocio("Este grupo não tem membros.");
            pessoas = g.membros;
            c.criadas += g.criadas;
            c.reativadas += g.reativadas;
            c.jaExistiam += g.jaExistiam;
            continue;
          }
          for (const membroId of membroIds) {
            const m = await matricular(tx, { ...base, membroId, produtoId });
            somar(c, m.resultado);
            if (m.resultado !== "ja-existia") novas.push(m.matriculaId);
          }
        }
        return { ...c, pessoas, produtos: produtoIds.length };
      })
      .catch(concorrencia);
    // Depois do commit; nunca lançam (RN-134, RN-204).
    await notificarMatriculas(criador.id, novas, usuario.id);
    await webhookMatriculas(criador.id, novas, "MATRICULA_CRIADA", usuario.id);
    return r;
  });
}

export async function acaoCancelarMatricula(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = cancelarMatriculaSchema.parse(entrada);
    await db.transaction((tx) => cancelarMatricula(tx, { criadorId: criador.id, matriculaId: e.matriculaId, versao: e.versao, motivo: e.motivo, autor: usuario.id }));
    await webhookMatriculas(criador.id, [e.matriculaId], "MATRICULA_CANCELADA", usuario.id);
    return null;
  });
}

export async function acaoAlterarExpiracao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = alterarExpiracaoSchema.parse(entrada);
    await db.transaction((tx) => alterarExpiracao(tx, { criadorId: criador.id, matriculaId: e.matriculaId, versao: e.versao, expiraEm: e.expiraEm, autor: usuario.id }));
    return null;
  });
}

/** Reativa cancelada, pendente ou expirada (nova expiracao opcional), com a trava da versao aberta. */
export async function acaoReativarMatricula(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ matriculaId: idSchema, versao: versaoSchema, expiraEm: expiracaoOpcional }).parse(entrada);
    await db
      .transaction(async (tx) => {
        const [m] = await tx
          .select({ membroId: produtos_matriculas.membro_id, produtoId: produtos_matriculas.produto_id })
          .from(produtos_matriculas)
          .where(and(eq(produtos_matriculas.id, e.matriculaId), eq(produtos_matriculas.criador_id, criador.id), vivos(produtos_matriculas)));
        if (!m) throw new ErroDeNegocio(MSG_COLISAO);
        const r = await matricular(tx, { criadorId: criador.id, ...m, origem: "MANUAL", expiraEm: e.expiraEm, autor: usuario.id, versao: e.versao });
        if (r.resultado === "ja-existia") throw new ErroDeNegocio("Esta matrícula já está ativa.");
      })
      .catch(concorrencia);
    await notificarMatriculas(criador.id, [e.matriculaId], usuario.id);
    await webhookMatriculas(criador.id, [e.matriculaId], "MATRICULA_CRIADA", usuario.id);
    return null;
  });
}

/** Busca de membros DESTE criador para o dialogo "Matricular" (leitura; so a equipe). */
export async function acaoBuscarMembros(entrada: unknown) {
  return executar(async () => {
    const { criador } = await exigirMembro(EQUIPE);
    const { busca } = z.strictObject({ busca: z.string().trim().min(2, "Digite ao menos 2 letras.").max(100) }).parse(entrada);
    return buscarMembros(criador.id, busca);
  });
}
