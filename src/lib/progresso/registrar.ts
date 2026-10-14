import "server-only";
import { sql } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import type { ConclusaoAula } from "@/lib/db/schema/_enums";
import { DURACAO_MAXIMA_PROGRESSO_SEG } from "@/lib/db/schema/progresso";
import { esquemaBatida, FOLGA_SEG, PERCENTUAL_CONCLUSAO, prepararBatida, TETO_PRIMEIRA_BATIDA_SEG, VELOCIDADE_MAXIMA, type Intervalo } from "./regras";

/**
 * Escrita do progresso (ADR-0006). Quem chama JÁ conferiu sessão e `acessoDaAula` (batida.ts).
 *
 * `registrarProgresso` é UMA instrução SQL (uma ida ao banco): lê a duração da aula, faz o
 * UPSERT por (membro, aula) com OR bit a bit nos segundos assistidos, recalcula percentual e
 * conclusão, soma a visualização do dia no agregado do Top 10 e marca o dia de atividade do membro
 * (painel, `criadores_membros_atividades`). Duas batidas simultâneas se
 * enfileiram na trava de linha do ON CONFLICT: a segunda mescla sobre a primeira (nada se perde).
 *
 * A batida é IGNORADA (sem erro) quando a aula não tem duração (vídeo não processado) ou quando
 * declara mais segundos do que o tempo real permite (2× o decorrido desde a última batida aceita
 * + 15 s; 60 s na primeira): "pulei para o fim e marquei tudo" não passa.
 */

export interface EntradaProgresso {
  criadorId: string;
  membroId: string;
  /** Autor (`modified_by`): a pessoa da sessão. */
  usuarioId: string;
  aulaId: string;
  /** Trechos que REALMENTE tocaram desde a batida anterior, em segundos do vídeo. */
  intervalos: readonly Intervalo[];
  /** Posição atual do player (retomar). */
  posicao: number;
  /** Duração que o player vê (validação); a do banco manda no cálculo. */
  duracaoSeg: number;
}

export interface ProgressoGravado {
  percentual: number;
  concluida: boolean;
  concluidaPor: ConclusaoAula | null;
  /** Concluiu NESTA chamada (a tela comemora / libera a próxima). */
  concluiuAgora: boolean;
  ultimaPosicaoSeg: number;
  segundosAssistidos: number;
}

/** Dia corrente no calendário de Brasília (agregado do Top 10). */
const HOJE = sql.raw(`(now() at time zone 'America/Sao_Paulo')::date`);
const P = sql.raw("produtos_modulos_aulas_progressos");
// Bitmap guardado ajustado ao comprimento novo (vídeo trocado por outro de outra duração) OR o novo.
const MESCLADO_SQL = `(rpad(p.segundos_bitmap::text, length(excluded.segundos_bitmap), '0')::varbit | excluded.segundos_bitmap)`;
const MESCLADO = sql.raw(MESCLADO_SQL);
const CRUZOU = sql.raw(`bit_count(${MESCLADO_SQL}) * 100 >= length(excluded.segundos_bitmap) * ${PERCENTUAL_CONCLUSAO}`);

interface LinhaGravada extends Record<string, unknown> {
  percentual: number;
  concluida: boolean;
  concluida_por: ConclusaoAula | null;
  concluiu_agora: boolean;
  ultima_posicao_seg: number;
  segundos_assistidos: number;
}

const paraProgresso = (l: LinhaGravada): ProgressoGravado => ({
  percentual: l.percentual,
  concluida: l.concluida,
  concluidaPor: l.concluida_por,
  concluiuAgora: l.concluiu_agora,
  ultimaPosicaoSeg: l.ultima_posicao_seg,
  segundosAssistidos: l.segundos_assistidos,
});

/** `null` = batida ignorada (aula sem duração ou declarou mais do que o tempo permite). */
export async function registrarProgresso(e: EntradaProgresso): Promise<ProgressoGravado | null> {
  const b = esquemaBatida.parse({ aulaId: e.aulaId, intervalos: e.intervalos, posicao: e.posicao, duracaoSeg: e.duracaoSeg });
  const lote = prepararBatida(b);
  const { rows } = await db.execute<LinhaGravada>(sql`
    with aula as (
      select duracao_seg as d from produtos_modulos_aulas
      where id = ${e.aulaId}::uuid and criador_id = ${e.criadorId}::uuid and is_deleted = false
        and duracao_seg between 1 and ${DURACAO_MAXIMA_PROGRESSO_SEG}
    ),
    nova as (
      select d, left(repeat('0', ${lote.inicio}::int) || ${lote.bits}::text || repeat('0', d), d)::varbit as b from aula
    ),
    up as (
      insert into ${P} as p (criador_id, membro_id, aula_id, segundos_bitmap, segundos_assistidos, max_posicao_seg, ultima_posicao_seg,
        percentual, concluida, concluida_em, concluida_por, ultima_visualizacao_dia, visualizacao_nova, modified_by)
      select ${e.criadorId}::uuid, ${e.membroId}::uuid, ${e.aulaId}::uuid, b, bit_count(b), least(${lote.maiorFim}::int, d), least(${lote.posicao}::int, d),
        (bit_count(b) * 100 / d)::smallint,
        bit_count(b) * 100 >= d * ${PERCENTUAL_CONCLUSAO},
        case when bit_count(b) * 100 >= d * ${PERCENTUAL_CONCLUSAO} then now() end,
        case when bit_count(b) * 100 >= d * ${PERCENTUAL_CONCLUSAO} then 'ASSISTIU' end,
        case when ${lote.segundos}::int > 0 then ${HOJE} end,
        ${lote.segundos}::int > 0,
        ${e.usuarioId}::uuid
      from nova
      where ${lote.segundos}::int <= ${TETO_PRIMEIRA_BATIDA_SEG}
        or exists (select 1 from ${P} x where x.membro_id = ${e.membroId}::uuid and x.aula_id = ${e.aulaId}::uuid and x.is_deleted = false)
      on conflict (membro_id, aula_id) where is_deleted = false do update set
        segundos_bitmap = ${MESCLADO},
        segundos_assistidos = bit_count(${MESCLADO}),
        max_posicao_seg = least(greatest(p.max_posicao_seg, excluded.max_posicao_seg), length(excluded.segundos_bitmap)),
        ultima_posicao_seg = excluded.ultima_posicao_seg,
        percentual = (bit_count(${MESCLADO}) * 100 / length(excluded.segundos_bitmap))::smallint,
        concluida = p.concluida or ${CRUZOU},
        concluida_em = case when p.concluida then p.concluida_em when ${CRUZOU} then now() end,
        concluida_por = case when p.concluida then p.concluida_por when ${CRUZOU} then 'ASSISTIU' end,
        ultima_visualizacao_dia = case when ${lote.segundos}::int > 0 then ${HOJE} else p.ultima_visualizacao_dia end,
        visualizacao_nova = ${lote.segundos}::int > 0 and p.ultima_visualizacao_dia is distinct from ${HOJE},
        updated_at = now(),
        modified_by = excluded.modified_by
      where ${lote.segundos}::int <= ${VELOCIDADE_MAXIMA} * extract(epoch from now() - p.updated_at) + ${FOLGA_SEG}
      returning percentual, concluida, concluida_por, ultima_posicao_seg, segundos_assistidos, visualizacao_nova,
        coalesce(concluida_em > now() - interval '1 millisecond', false) as concluiu_agora
    ),
    vis as (
      insert into produtos_modulos_aulas_visualizacoes as v (criador_id, aula_id, dia, visualizacoes, modified_by)
      select ${e.criadorId}::uuid, ${e.aulaId}::uuid, ${HOJE}, 1, ${e.usuarioId}::uuid from up where up.visualizacao_nova
      on conflict (aula_id, dia) where is_deleted = false do update set visualizacoes = v.visualizacoes + 1, updated_at = now()
    ),
    ativ as (
      insert into criadores_membros_atividades (criador_id, membro_id, dia, modified_by)
      select ${e.criadorId}::uuid, ${e.membroId}::uuid, ${HOJE}, ${e.usuarioId}::uuid from up where up.visualizacao_nova
      on conflict (membro_id, dia) where is_deleted = false do nothing
    )
    select * from up
  `);
  const linha = rows[0];
  if (!linha) return null;
  if (linha.concluiu_agora) await concluirMatriculaSeCompleta(e.criadorId, e.membroId, e.aulaId);
  return paraProgresso(linha);
}

export interface EntradaConclusaoManual {
  criadorId: string;
  membroId: string;
  usuarioId: string;
  aulaId: string;
}

/**
 * Botão "Concluir e avançar" (quem chama conferiu acesso e `podeConcluirManual`). Idempotente:
 * aula já concluída fica como está (data e forma originais). Mutação + trilha na mesma transação.
 * `null` = aula não existe neste criador.
 */
export async function concluirManualmente(e: EntradaConclusaoManual): Promise<ProgressoGravado | null> {
  const linha = await db.transaction(async (tx) => {
    const { rows } = await tx.execute<LinhaGravada>(sql`
      insert into ${P} as p (criador_id, membro_id, aula_id, segundos_bitmap, concluida, concluida_em, concluida_por, modified_by)
      select ${e.criadorId}::uuid, ${e.membroId}::uuid, a.id, repeat('0', least(coalesce(a.duracao_seg, 0), ${DURACAO_MAXIMA_PROGRESSO_SEG}))::varbit,
        true, now(), 'MANUAL', ${e.usuarioId}::uuid
      from produtos_modulos_aulas a
      where a.id = ${e.aulaId}::uuid and a.criador_id = ${e.criadorId}::uuid and a.is_deleted = false
      on conflict (membro_id, aula_id) where is_deleted = false do update set
        concluida = true,
        concluida_em = coalesce(p.concluida_em, now()),
        concluida_por = coalesce(p.concluida_por, 'MANUAL'),
        updated_at = now(),
        modified_by = excluded.modified_by
      returning id, percentual, concluida, concluida_por, ultima_posicao_seg, segundos_assistidos,
        coalesce(concluida_em > now() - interval '1 millisecond', false) as concluiu_agora
    `);
    const l = rows[0];
    if (l?.concluiu_agora) {
      await tx.execute(sql`
        insert into criadores_membros_atividades (criador_id, membro_id, dia, modified_by)
        values (${e.criadorId}::uuid, ${e.membroId}::uuid, ${HOJE}, ${e.usuarioId}::uuid)
        on conflict (membro_id, dia) where is_deleted = false do nothing
      `);
      await registrarAuditoria(tx, {
        userId: e.usuarioId,
        criadorId: e.criadorId,
        acao: "atualizar",
        tabela: "produtos_modulos_aulas_progressos",
        registroId: String(l.id),
        detalhes: `Concluiu a aula ${e.aulaId} pelo botão (com ${l.percentual}% assistido)`,
        dadosNovos: { concluida: true, concluida_por: "MANUAL", percentual: l.percentual },
      });
    }
    return l;
  });
  if (!linha) return null;
  if (linha.concluiu_agora) await concluirMatriculaSeCompleta(e.criadorId, e.membroId, e.aulaId);
  return paraProgresso(linha);
}

/**
 * Matrícula do produto da aula ganha `concluida_em` quando TODAS as aulas vivas de módulos
 * publicados estão concluídas pelo membro (base do certificado, passo 7). Atualização de
 * sistema: não mexe em `updated_at` (não envelhece a trava da tela de matrículas).
 */
async function concluirMatriculaSeCompleta(criadorId: string, membroId: string, aulaId: string): Promise<void> {
  await db.execute(sql`
    update produtos_matriculas pm set concluida_em = now()
    where pm.criador_id = ${criadorId}::uuid and pm.membro_id = ${membroId}::uuid and pm.is_deleted = false and pm.concluida_em is null
      and pm.produto_id = (select mo.produto_id from produtos_modulos_aulas a join produtos_modulos mo on mo.id = a.modulo_id where a.id = ${aulaId}::uuid)
      and not exists (
        select 1 from produtos_modulos_aulas a join produtos_modulos mo on mo.id = a.modulo_id
        where mo.produto_id = pm.produto_id and mo.status = 'PUBLICADO' and mo.is_deleted = false and a.is_deleted = false
          and not exists (select 1 from ${P} pr where pr.aula_id = a.id and pr.membro_id = ${membroId}::uuid and pr.concluida and pr.is_deleted = false)
      )
  `);
}
