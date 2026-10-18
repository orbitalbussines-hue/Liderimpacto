"use server";

import { executar } from "@/lib/acao";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { pedirReindexacao } from "@/lib/conhecimento/pedir";
import { db } from "@/lib/db";
import { aplicarSugestao, descartarSugestao, gerarSugestao } from "@/lib/estudio-ia/servico";
import { aplicarSugestaoSchema, descartarSugestaoSchema, gerarSugestaoSchema } from "@/lib/validators/estudio-ia";

/**
 * Aba "IA" do Estúdio de vídeo (RN-206), criador do HOST. DONO e ADMIN (ALUNO: "Sem permissão").
 * Gerar chama o Claude (segundos; a tela mostra "gerando…"). Nada é aplicado sem a equipe pedir.
 */

export async function acaoGerarSugestao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const { aulaId } = gerarSugestaoSchema.parse(entrada);
    const s = await gerarSugestao({ criadorId: criador.id, autorId: usuario.id, aulaId });
    return { id: s.id, versao: s.versao.toISOString() };
  });
}

export async function acaoAplicarSugestao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = aplicarSugestaoSchema.parse(entrada);
    const r = await db.transaction((tx) => aplicarSugestao(tx, { criadorId: criador.id, autor: usuario.id, ...e }));
    // Descrição da aula é fonte da base do assistente (ADR-0014): reindexa depois do commit.
    if (e.parte === "DESCRICAO") await pedirReindexacao(criador.id, { tipo: "AULA", aulaId: r.aulaId }, usuario.id);
    return { versao: r.versao.toISOString(), aulaVersao: r.aulaVersao?.toISOString() ?? null, questoes: r.questoes };
  });
}

export async function acaoDescartarSugestao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = descartarSugestaoSchema.parse(entrada);
    await db.transaction((tx) => descartarSugestao(tx, { criadorId: criador.id, autor: usuario.id, sugestaoId: e.sugestaoId, versao: e.versao }));
    return null;
  });
}
