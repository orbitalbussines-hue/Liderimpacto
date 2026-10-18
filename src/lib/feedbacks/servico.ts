import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { MSG_SEM_PERMISSAO } from "@/lib/auth/autorizacao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import { produtos_modulos_aulas_feedbacks as fb } from "@/lib/db/schema";
import { marcaDeExclusao, vivos } from "@/lib/db/soft-delete";
import { acessoDaAula } from "@/lib/video/acesso-aula";

/**
 * Feedback de conteúdo (RN-202): SÓ o ALUNO avalia (a prévia da equipe não entra na estatística) e
 * só a aula que pode assistir (`acessoDaAula`, a mesma porta do vídeo). Um vivo por (membro, aula):
 * mudar de ideia regrava a MESMA linha (UPSERT no índice parcial). Sem trava de colisão de propósito:
 * a linha é da própria pessoa e o último clique é a intenção dela (duas abas = vale a última).
 */

export interface QuemAvaliaAula {
  criadorId: string;
  membroId: string;
  usuarioId: string;
  papel: PapelCriador;
}

const TABELA = "produtos_modulos_aulas_feedbacks";

export async function darFeedback(q: QuemAvaliaAula, e: { aulaId: string; util: boolean; comentario: string | null }): Promise<{ id: string; versao: Date }> {
  if (q.papel !== "ALUNO") throw new ErroDeNegocio("Só alunos avaliam as aulas.");
  const acesso = await acessoDaAula(q.criadorId, e.aulaId, { papel: q.papel, membroId: q.membroId });
  if (!acesso) throw new ErroDeNegocio("Aula não encontrada.");
  if (!acesso.pode) throw new ErroDeNegocio(MSG_SEM_PERMISSAO);
  return db.transaction(async (tx) => {
    const [antes] = await tx
      .select({ util: fb.util, comentario: fb.comentario })
      .from(fb)
      .where(and(eq(fb.membro_id, q.membroId), eq(fb.aula_id, e.aulaId), vivos(fb)))
      .for("update");
    const agora = new Date();
    const [l] = await tx
      .insert(fb)
      .values({ criador_id: q.criadorId, aula_id: e.aulaId, membro_id: q.membroId, util: e.util, comentario: e.comentario, modified_by: q.usuarioId })
      .onConflictDoUpdate({
        target: [fb.membro_id, fb.aula_id],
        targetWhere: sql`is_deleted = false`,
        set: { util: e.util, comentario: e.comentario, updated_at: agora, modified_by: q.usuarioId },
      })
      .returning({ id: fb.id, versao: fb.updated_at });
    await registrarAuditoria(tx, {
      userId: q.usuarioId,
      criadorId: q.criadorId,
      acao: antes ? "atualizar" : "criar",
      tabela: TABELA,
      registroId: l.id,
      detalhes: `Avaliou a aula ${e.aulaId} como ${e.util ? "útil" : "não útil"}`,
      dadosAnteriores: antes ?? undefined,
      dadosNovos: { util: e.util, comentario: e.comentario },
    });
    return l;
  });
}

/** Tira a própria avaliação (soft delete). Sem avaliação = nada a fazer. */
export async function removerFeedback(q: QuemAvaliaAula, aulaId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [l] = await tx
      .update(fb)
      .set(marcaDeExclusao(q.usuarioId))
      .where(and(eq(fb.membro_id, q.membroId), eq(fb.aula_id, aulaId), eq(fb.criador_id, q.criadorId), vivos(fb)))
      .returning({ id: fb.id, util: fb.util });
    if (!l) return false;
    await registrarAuditoria(tx, { userId: q.usuarioId, criadorId: q.criadorId, acao: "excluir", tabela: TABELA, registroId: l.id, detalhes: `Tirou a avaliação da aula ${aulaId}`, dadosAnteriores: { util: l.util } });
    return true;
  });
}
