import "server-only";
import { sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import type { QuemPede } from "@/lib/progresso/visao";
import { veEventoSql } from "./sql";

/**
 * "Vou participar" / "Não vou mais" (RN-143). Quem chama (a action) já fez `exigirMembro` e o Zod
 * do id; aqui ficam a regra e a escrita: evento PUBLICADO, visível para o membro (`veEventoSql`) e
 * ainda não terminado. Idempotente pelo índice único (evento, membro) entre as vivas. Escrita +
 * trilha na mesma transação.
 */

export const MSG_EVENTO_INDISPONIVEL = "Este encontro não está disponível para confirmação.";

function exigirVinculo(q: QuemPede): string {
  if (!q.membro.id) throw new ErroDeNegocio("Entre com uma conta de membro desta área para confirmar presença.");
  return q.membro.id;
}

/** `true` = confirmou agora; `false` = já estava confirmado. */
export async function confirmarPresenca(q: QuemPede, eventoId: string, agora: Date): Promise<boolean> {
  const membroId = exigirVinculo(q);
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into criadores_eventos_inscricoes (criador_id, evento_id, membro_id, modified_by)
      select e.criador_id, e.id, ${membroId}::uuid, ${q.usuario.id}::uuid
      from criadores_eventos e
      where e.id = ${eventoId}::uuid and e.criador_id = ${q.criador.id}::uuid and e.is_deleted = false
        and e.situacao = 'PUBLICADO' and e.inicio_em + make_interval(mins => e.duracao_min) > ${agora}
        and ${veEventoSql(sql`${membroId}::uuid`, sql`${q.membro.papel}`, agora)}
      on conflict (evento_id, membro_id) where is_deleted = false do nothing
      returning id
    `);
    if (rows[0]) {
      await registrarAuditoria(tx, {
        userId: q.usuario.id,
        criadorId: q.criador.id,
        acao: "criar",
        tabela: "criadores_eventos_inscricoes",
        registroId: rows[0].id,
        detalhes: `Confirmou presença no evento ${eventoId}`,
      });
      return true;
    }
    // Nada inserido: ou já estava inscrito (ok, idempotente) ou não pode.
    const { rows: ja } = await tx.execute(sql`
      select 1 from criadores_eventos_inscricoes i where i.evento_id = ${eventoId}::uuid and i.membro_id = ${membroId}::uuid and i.is_deleted = false`);
    if (ja.length === 0) throw new ErroDeNegocio(MSG_EVENTO_INDISPONIVEL);
    return false;
  });
}

/** `true` = desconfirmou; `false` = não estava confirmado. Só até o fim do evento. */
export async function cancelarPresenca(q: QuemPede, eventoId: string, agora: Date): Promise<boolean> {
  const membroId = exigirVinculo(q);
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      update criadores_eventos_inscricoes i set is_deleted = true, deleted_at = ${agora}, updated_at = ${agora}, modified_by = ${q.usuario.id}::uuid
      from criadores_eventos e
      where i.evento_id = e.id and e.id = ${eventoId}::uuid and e.criador_id = ${q.criador.id}::uuid
        and i.membro_id = ${membroId}::uuid and i.is_deleted = false
        and e.inicio_em + make_interval(mins => e.duracao_min) > ${agora}
      returning i.id
    `);
    if (!rows[0]) return false;
    await registrarAuditoria(tx, {
      userId: q.usuario.id,
      criadorId: q.criador.id,
      acao: "excluir",
      tabela: "criadores_eventos_inscricoes",
      registroId: rows[0].id,
      detalhes: `Desconfirmou presença no evento ${eventoId}`,
    });
    return true;
  });
}
