import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db, type Transacao } from "@/lib/db";
import type { MetaDesafio } from "@/lib/db/schema/_enums";
import { veDesafioSql } from "@/lib/eventos/sql";
import type { QuemPede } from "@/lib/progresso/visao";
import { momentoDoDesafio, type MomentoDoDesafio } from "./regras";

/**
 * Desafios (ADR-0012, RN-147). O PROGRESSO é calculado dos dados que já existem DENTRO da janela
 * `inicio_em`..`fim_em` (nenhum contador gravado que possa divergir): aulas concluídas, matrícula
 * do curso concluída, tentativa aprovada da avaliação, publicações vivas e não ocultas. A conclusão
 * grava `concluido_em` e o bônus DESAFIO_CONCLUIDO numa instrução só, idempotente.
 */

type Executor = Transacao | typeof db;

/** Quanto o membro (`membro`, expressão SQL) já fez no desafio `d` (linha de `criadores_desafios d`). */
export const progressoDoDesafioSql = (membro: SQL): SQL<number> => sql<number>`(case d.meta_tipo
  when 'AULAS_CONCLUIDAS' then (select count(*) from produtos_modulos_aulas_progressos pr
    where pr.membro_id = ${membro} and pr.concluida and pr.is_deleted = false and pr.concluida_em >= d.inicio_em and pr.concluida_em < d.fim_em)
  when 'CURSO_CONCLUIDO' then (select count(*) from produtos_matriculas pm
    where pm.membro_id = ${membro} and pm.produto_id = d.meta_produto_id and pm.is_deleted = false and pm.concluida_em >= d.inicio_em and pm.concluida_em < d.fim_em)
  when 'AVALIACAO_APROVADA' then (select count(*) from (select 1 from produtos_avaliacoes_tentativas te
    where te.membro_id = ${membro} and te.avaliacao_id = d.meta_avaliacao_id and te.aprovada and te.is_deleted = false
      and te.finalizada_em >= d.inicio_em and te.finalizada_em < d.fim_em limit 1) x)
  when 'PUBLICACOES_COMUNIDADE' then (select count(*) from criadores_canais_posts po
    where po.autor_membro_id = ${membro} and po.is_deleted = false and po.oculto_em is null and po.created_at >= d.inicio_em and po.created_at < d.fim_em)
  else 0 end)::int`;

/** Meta numérica: a quantidade, ou 1 (curso concluído / avaliação aprovada). */
const META = sql`coalesce(d.meta_quantidade, 1)`;

/**
 * Conclui as participações vivas e abertas cujo progresso alcançou a meta (desafio PUBLICADO e já
 * começado; o progresso só conta o que aconteceu na janela, então rodar depois do fim é seguro) e
 * lança o bônus (se a gamificação estiver ligada e o bônus > 0). `membroId` nulo = todo o criador
 * (recálculo). Devolve quantas participações concluiu agora.
 */
export async function concluirDesafiosCumpridos(exec: Executor, criadorId: string, membroId: string | null, agora: Date): Promise<number> {
  const doMembro = membroId ? sql`and dp.membro_id = ${membroId}::uuid` : sql``;
  const { rows } = await exec.execute<{ n: number }>(sql`
    with cumpridas as (
      select dp.id from criadores_desafios_participacoes dp
      join criadores_desafios d on d.id = dp.desafio_id and d.is_deleted = false and d.situacao = 'PUBLICADO' and d.inicio_em <= ${agora}
      where dp.criador_id = ${criadorId}::uuid and dp.is_deleted = false and dp.concluido_em is null ${doMembro}
        and ${progressoDoDesafioSql(sql`dp.membro_id`)} >= ${META}
    ),
    feitas as (
      update criadores_desafios_participacoes dp set concluido_em = ${agora}
      where dp.id in (select id from cumpridas) and dp.concluido_em is null
      returning dp.id
    ),
    bonus as (
      insert into criadores_membros_pontos (criador_id, membro_id, motivo, pontos, referencia, ocorrido_em, modified_by)
      select dp.criador_id, dp.membro_id, 'DESAFIO_CONCLUIDO', d.pontos_bonus, d.id::text, least(${agora}::timestamptz, d.fim_em), m.usuario_id
      from criadores_desafios_participacoes dp
      join feitas f on f.id = dp.id
      join criadores_desafios d on d.id = dp.desafio_id
      join criadores_membros m on m.id = dp.membro_id and m.papel = 'ALUNO' and m.is_deleted = false
      join criadores_gamificacao g on g.criador_id = dp.criador_id and g.ligada and g.is_deleted = false
      where d.pontos_bonus > 0
      on conflict (membro_id, motivo, referencia) do nothing
    )
    select count(*)::int as n from feitas
  `);
  return rows[0]?.n ?? 0;
}

export interface DesafioDoMembro {
  id: string;
  titulo: string;
  descricao: string;
  inicioEm: Date;
  fimEm: Date;
  momento: MomentoDoDesafio;
  metaTipo: MetaDesafio;
  /** Quantidade-alvo (1 para curso/avaliação). */
  meta: number;
  /** Feito na janela, limitado à meta. Só faz sentido para quem participa (calculado para todos). */
  atual: number;
  metaProdutoId: string | null;
  metaAvaliacaoId: string | null;
  pontosBonus: number;
  recompensa: string | null;
  participando: boolean;
  concluidoEm: Date | null;
  recompensaEntregueEm: Date | null;
}

interface Linha extends Record<string, unknown> {
  id: string;
  titulo: string;
  descricao: string;
  inicio_em: string | Date;
  fim_em: string | Date;
  situacao: string;
  meta_tipo: MetaDesafio;
  meta: number;
  atual: number;
  meta_produto_id: string | null;
  meta_avaliacao_id: string | null;
  pontos_bonus: number;
  recompensa: string | null;
  participacao_id: string | null;
  concluido_em: string | Date | null;
  recompensa_entregue_em: string | Date | null;
}

const data = (v: string | Date | null) => (v === null ? null : new Date(v));

/**
 * Desafios PUBLICADOS ou ENCERRADOS que quem pede vê (`veDesafioSql`), com a participação e o
 * progresso dele. Ordem: ativos e em breve primeiro (pelo fim), depois os encerrados mais recentes.
 */
export async function desafiosDoMembro(q: QuemPede, agora: Date, desafioId?: string): Promise<DesafioDoMembro[]> {
  const m = q.membro.id ? sql`${q.membro.id}::uuid` : sql`null::uuid`;
  const { rows } = await db.execute<Linha>(sql`
    select d.id, d.titulo, d.descricao, d.inicio_em, d.fim_em, d.situacao, d.meta_tipo, ${META}::int as meta,
      least(${progressoDoDesafioSql(m)}, ${META})::int as atual, d.meta_produto_id, d.meta_avaliacao_id, d.pontos_bonus, d.recompensa,
      dp.id as participacao_id, dp.concluido_em, dp.recompensa_entregue_em
    from criadores_desafios d
    left join criadores_desafios_participacoes dp on dp.desafio_id = d.id and dp.membro_id = ${m} and dp.is_deleted = false
    where d.criador_id = ${q.criador.id}::uuid and d.is_deleted = false and d.situacao in ('PUBLICADO', 'ENCERRADO')
      and ${veDesafioSql(m, sql`${q.membro.papel}`, agora)}
      ${desafioId ? sql`and d.id = ${desafioId}::uuid` : sql``}
    order by (d.situacao = 'ENCERRADO' or d.fim_em <= ${agora}), case when d.situacao = 'ENCERRADO' or d.fim_em <= ${agora} then -extract(epoch from d.fim_em) else extract(epoch from d.fim_em) end, d.id
    limit 100
  `);
  return rows.map((l) => {
    const inicioEm = new Date(l.inicio_em);
    const fimEm = new Date(l.fim_em);
    return {
      id: l.id,
      titulo: l.titulo,
      descricao: l.descricao,
      inicioEm,
      fimEm,
      momento: momentoDoDesafio({ inicioEm, fimEm, situacao: l.situacao }, agora),
      metaTipo: l.meta_tipo,
      meta: l.meta,
      atual: l.atual,
      metaProdutoId: l.meta_produto_id,
      metaAvaliacaoId: l.meta_avaliacao_id,
      pontosBonus: l.pontos_bonus,
      recompensa: l.recompensa,
      participando: l.participacao_id !== null,
      concluidoEm: data(l.concluido_em),
      recompensaEntregueEm: data(l.recompensa_entregue_em),
    };
  });
}

export const MSG_DESAFIO_INDISPONIVEL = "Este desafio não está aberto para participação.";

/**
 * "Participar" (opt-in): desafio PUBLICADO, visível e ainda não terminado. Idempotente (`false` =
 * já participava). Entrar já cumprido conclui na hora (o progresso é da janela, não da entrada).
 */
export async function participarDoDesafio(q: QuemPede, desafioId: string, agora: Date): Promise<boolean> {
  const membroId = q.membro.id;
  if (!membroId) throw new ErroDeNegocio("Entre com uma conta de membro desta área para participar.");
  const entrou = await db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into criadores_desafios_participacoes (criador_id, desafio_id, membro_id, modified_by)
      select d.criador_id, d.id, ${membroId}::uuid, ${q.usuario.id}::uuid
      from criadores_desafios d
      where d.id = ${desafioId}::uuid and d.criador_id = ${q.criador.id}::uuid and d.is_deleted = false
        and d.situacao = 'PUBLICADO' and d.fim_em > ${agora}
        and ${veDesafioSql(sql`${membroId}::uuid`, sql`${q.membro.papel}`, agora)}
      on conflict (desafio_id, membro_id) where is_deleted = false do nothing
      returning id
    `);
    if (!rows[0]) {
      const { rows: ja } = await tx.execute(sql`
        select 1 from criadores_desafios_participacoes where desafio_id = ${desafioId}::uuid and membro_id = ${membroId}::uuid and is_deleted = false`);
      if (ja.length === 0) throw new ErroDeNegocio(MSG_DESAFIO_INDISPONIVEL);
      return false;
    }
    await registrarAuditoria(tx, {
      userId: q.usuario.id,
      criadorId: q.criador.id,
      acao: "criar",
      tabela: "criadores_desafios_participacoes",
      registroId: rows[0].id,
      detalhes: `Entrou no desafio ${desafioId}`,
    });
    return true;
  });
  if (entrou) await concluirDesafiosCumpridos(db, q.criador.id, membroId, agora);
  return entrou;
}
