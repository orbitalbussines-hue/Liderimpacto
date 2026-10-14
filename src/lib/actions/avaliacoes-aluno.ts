"use server";

import { ErroDeNegocio, executar } from "@/lib/acao";
import { finalizarTentativa, iniciarTentativa, responder, type QuemFaz } from "@/lib/avaliacoes/tentativas";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { finalizarTentativaSchema, iniciarTentativaSchema, responderSchema } from "@/lib/validators/avaliacoes";

/**
 * Avaliações — quem responde (RN-124): membro com vínculo no criador do HOST (ALUNO dentro da
 * disponibilidade; DONO/ADMIN em prévia). A tentativa é sempre DO membro da sessão: nenhum id de
 * pessoa vem do corpo. Correção e prazo no SERVIDOR.
 */

async function quem(): Promise<QuemFaz> {
  const m = await exigirMembro(TODOS_OS_MEMBROS);
  if (!m.membro.id) throw new ErroDeNegocio("Avaliações valem só para quem é membro desta área.");
  return { criadorId: m.criador.id, membroId: m.membro.id, papel: m.membro.papel, usuarioId: m.usuario.id };
}

/** Inicia ou retoma: `{ tentativaId, retomada }`. Depois a tela lê `tentativaParaResponder`. */
export async function acaoIniciarTentativa(entrada: unknown) {
  return executar(async () => {
    const { avaliacaoId } = iniciarTentativaSchema.parse(entrada);
    return iniciarTentativa(await quem(), avaliacaoId);
  });
}

/** Autosave de uma questão: `{ situacao: "salva" }` ou `{ situacao: "encerrada", tentativaId }` (prazo). */
export async function acaoResponder(entrada: unknown) {
  return executar(async () => {
    const e = responderSchema.parse(entrada);
    return responder(await quem(), { tentativaId: e.tentativaId, questaoId: e.questaoId, opcoes: e.opcoes });
  });
}

/** Finaliza e corrige: `{ tentativaId, nota, aprovada, finalizadaPor }` (idempotente). */
export async function acaoFinalizarTentativa(entrada: unknown) {
  return executar(async () => {
    const { tentativaId } = finalizarTentativaSchema.parse(entrada);
    return finalizarTentativa(await quem(), tentativaId, "ALUNO");
  });
}
