"use server";

import { ErroDeNegocio, executar } from "@/lib/acao";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { darFeedback, removerFeedback } from "@/lib/feedbacks/servico";
import { darFeedbackSchema, removerFeedbackSchema } from "@/lib/validators/feedbacks";

/**
 * Feedback de conteúdo do ALUNO (RN-202): sempre o membro da sessão no criador do HOST (nenhum id
 * de pessoa no corpo). A regra (só ALUNO, só aula que pode assistir) mora em src/lib/feedbacks/servico.ts.
 */

async function quem() {
  const { usuario, criador, membro } = await exigirMembro(TODOS_OS_MEMBROS);
  if (!membro.id) throw new ErroDeNegocio("Avaliações valem só para quem é membro desta área.");
  return { criadorId: criador.id, membroId: membro.id, usuarioId: usuario.id, papel: membro.papel };
}

export async function acaoDarFeedback(entrada: unknown) {
  return executar(async () => {
    const q = await quem();
    const e = darFeedbackSchema.parse(entrada);
    const f = await darFeedback(q, { aulaId: e.aulaId, util: e.util, comentario: e.comentario ?? null });
    return { id: f.id, versao: f.versao.toISOString() };
  });
}

export async function acaoRemoverFeedback(entrada: unknown) {
  return executar(async () => {
    const q = await quem();
    const { aulaId } = removerFeedbackSchema.parse(entrada);
    return { removido: await removerFeedback(q, aulaId) };
  });
}
