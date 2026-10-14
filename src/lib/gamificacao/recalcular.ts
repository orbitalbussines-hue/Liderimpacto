import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db, type Transacao } from "@/lib/db";
import { concluirDesafiosCumpridos } from "./desafios";

/**
 * RECÁLCULO retroativo (ADR-0012, RN-145): gera, para um criador, os lançamentos que os fatos JÁ
 * existentes valem — aulas concluídas, cursos concluídos, avaliações aprovadas (a 1ª aprovação),
 * a 1ª publicação de cada dia, desafios cumpridos e o bônus dos já concluídos. Conjunto (INSERT ...
 * SELECT por motivo), ON CONFLICT DO NOTHING: rodar duas vezes não muda nada. `ocorrido_em` = a data
 * do fato (o ranking por período fica certo). Gamificação desligada = só conclui desafios.
 * Usado por `npm run gamificacao:recalcular -- <slug>` e ao LIGAR a gamificação.
 */

export interface ResultadoRecalculo {
  AULA_CONCLUIDA: number;
  CURSO_CONCLUIDO: number;
  AVALIACAO_APROVADA: number;
  PUBLICACAO_COMUNIDADE: number;
  DESAFIO_CONCLUIDO: number;
  desafiosConcluidos: number;
}

/** Fatos de um motivo: linhas (membro_id, referencia, ocorrido_em) do criador `c`. */
const FATOS: Record<Exclude<keyof ResultadoRecalculo, "desafiosConcluidos">, { coluna: string; fatos: (c: SQL) => SQL }> = {
  AULA_CONCLUIDA: {
    coluna: "g.pontos_aula_concluida",
    fatos: (c) => sql`select pr.membro_id, pr.aula_id::text as referencia, pr.concluida_em as ocorrido_em from produtos_modulos_aulas_progressos pr
      where pr.criador_id = ${c} and pr.concluida and pr.is_deleted = false`,
  },
  CURSO_CONCLUIDO: {
    coluna: "g.pontos_curso_concluido",
    fatos: (c) => sql`select pm.membro_id, pm.produto_id::text, pm.concluida_em from produtos_matriculas pm
      where pm.criador_id = ${c} and pm.concluida_em is not null and pm.is_deleted = false`,
  },
  AVALIACAO_APROVADA: {
    coluna: "g.pontos_avaliacao_aprovada",
    fatos: (c) => sql`select te.membro_id, te.avaliacao_id::text, min(te.finalizada_em) from produtos_avaliacoes_tentativas te
      where te.criador_id = ${c} and te.aprovada and te.finalizada_em is not null and te.is_deleted = false group by 1, 2`,
  },
  PUBLICACAO_COMUNIDADE: {
    coluna: "g.pontos_publicacao_comunidade",
    fatos: (c) => sql`select po.autor_membro_id, to_char((po.created_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'), min(po.created_at)
      from criadores_canais_posts po where po.criador_id = ${c} and po.is_deleted = false group by 1, 2`,
  },
  DESAFIO_CONCLUIDO: {
    coluna: "d.pontos_bonus",
    fatos: (c) => sql`select dp.membro_id, dp.desafio_id::text, least(dp.concluido_em, d.fim_em) from criadores_desafios_participacoes dp
      join criadores_desafios d on d.id = dp.desafio_id where dp.criador_id = ${c} and dp.concluido_em is not null and dp.is_deleted = false`,
  },
};

async function lancar(tx: Transacao, c: SQL, motivo: keyof typeof FATOS): Promise<number> {
  const { coluna, fatos } = FATOS[motivo];
  const valor = sql.raw(coluna);
  // O bônus vem do desafio (`d`); os outros, da configuração (`g`).
  const deDesafio = motivo === "DESAFIO_CONCLUIDO" ? sql`join criadores_desafios d on d.id::text = f.referencia` : sql``;
  const r = await tx.execute(sql`
    insert into criadores_membros_pontos (criador_id, membro_id, motivo, pontos, referencia, ocorrido_em, modified_by)
    select m.criador_id, m.id, ${motivo}, ${valor}, f.referencia, f.ocorrido_em, m.usuario_id
    from (${fatos(c)}) as f (membro_id, referencia, ocorrido_em)
    join criadores_membros m on m.id = f.membro_id and m.is_deleted = false and m.papel = 'ALUNO'
    join criadores_gamificacao g on g.criador_id = m.criador_id and g.ligada and g.is_deleted = false
    ${deDesafio}
    where ${valor} > 0
    on conflict (membro_id, motivo, referencia) do nothing
  `);
  return r.rowCount ?? 0;
}

export async function recalcularPontos(criadorId: string, agora = new Date()): Promise<ResultadoRecalculo> {
  const c = sql`${criadorId}::uuid`;
  return db.transaction(async (tx) => {
    // Desafios primeiro (o bônus dos concluídos AGORA já sai junto); o passo DESAFIO_CONCLUIDO cobre
    // os concluídos antes, com a gamificação desligada na hora.
    const desafiosConcluidos = await concluirDesafiosCumpridos(tx, criadorId, null, agora);
    const r: ResultadoRecalculo = {
      AULA_CONCLUIDA: await lancar(tx, c, "AULA_CONCLUIDA"),
      CURSO_CONCLUIDO: await lancar(tx, c, "CURSO_CONCLUIDO"),
      AVALIACAO_APROVADA: await lancar(tx, c, "AVALIACAO_APROVADA"),
      PUBLICACAO_COMUNIDADE: await lancar(tx, c, "PUBLICACAO_COMUNIDADE"),
      DESAFIO_CONCLUIDO: await lancar(tx, c, "DESAFIO_CONCLUIDO"),
      desafiosConcluidos,
    };
    const novos = r.AULA_CONCLUIDA + r.CURSO_CONCLUIDO + r.AVALIACAO_APROVADA + r.PUBLICACAO_COMUNIDADE + r.DESAFIO_CONCLUIDO;
    if (novos > 0 || desafiosConcluidos > 0) {
      await registrarAuditoria(tx, {
        userId: null,
        criadorId,
        acao: "criar",
        tabela: "criadores_membros_pontos",
        registroId: null,
        detalhes: `Recálculo de pontos: ${novos} lançamento(s) novo(s), ${desafiosConcluidos} desafio(s) concluído(s)`,
        dadosNovos: r,
      });
    }
    return r;
  });
}
