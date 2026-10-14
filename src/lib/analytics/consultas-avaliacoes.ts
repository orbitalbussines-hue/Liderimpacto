import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { limites } from "@/lib/painel/consultas";
import type { Intervalo } from "@/lib/painel/periodo";

/**
 * Aba Avaliações do Analytics: tentativas FINALIZADAS por alunos no período `de..ate` (`finalizada_em`),
 * por avaliação viva de produto vivo do criador (e do curso, se filtrado). Duas instruções
 * agregadas (avaliações + top 3 questões), sem N+1. Definições: docs/back.md (Analytics).
 */

export interface QuestaoComErro {
  questaoId: string;
  /** Nulo = a questão foi removida depois da tentativa (a correção congelada continua contando). */
  ordem: number | null;
  enunciado: string | null;
  erros: number;
  /** Vezes que a questão foi corrigida (tentativas que a continham). */
  respostas: number;
}

export interface AvaliacaoAnalytics {
  avaliacaoId: string;
  titulo: string;
  curso: string;
  notaMinima: number;
  tentativas: number;
  /** Alunos distintos com tentativa finalizada no período. */
  alunos: number;
  /** Desses, quantos têm ao menos uma tentativa aprovada no período. */
  aprovados: number;
  /** Média das notas (0–100) das tentativas do período. Nula sem tentativa. */
  notaMedia: number | null;
  questoes: QuestaoComErro[];
}

export async function avaliacoesAnalytics(criadorId: string, periodo: Intervalo, curso: string | null): Promise<AvaliacaoAnalytics[]> {
  const c = sql`${criadorId}::uuid`;
  const filtroCurso = curso ? sql`and av.produto_id = ${curso}::uuid` : sql``;
  const tentativas = sql`
    tent as (
      select te.avaliacao_id, te.membro_id, te.nota, te.aprovada, te.correcao
      from t, produtos_avaliacoes_tentativas te
      join criadores_membros m on m.id = te.membro_id and m.papel = 'ALUNO' and m.is_deleted = false
      where te.criador_id = ${c} and te.is_deleted = false and te.finalizada_em >= t.t_ini and te.finalizada_em < t.t_fim
    )`;
  const [avs, qs] = await Promise.all([
    db.execute<Omit<AvaliacaoAnalytics, "questoes"> & Record<string, unknown>>(sql`
      with ${limites(periodo)}, ${tentativas}
      select av.id as "avaliacaoId", av.titulo, p.titulo as curso, av.nota_minima::int as "notaMinima",
        count(te.membro_id)::int as tentativas,
        count(distinct te.membro_id)::int as alunos,
        count(distinct te.membro_id) filter (where te.aprovada)::int as aprovados,
        round(avg(te.nota), 1)::float8 as "notaMedia"
      from produtos_avaliacoes av
      join produtos p on p.id = av.produto_id and p.is_deleted = false
      left join tent te on te.avaliacao_id = av.id
      where av.criador_id = ${c} and av.is_deleted = false ${filtroCurso}
      group by av.id, av.titulo, p.titulo, av.nota_minima, av.status
      having av.status = 'PUBLICADA' or count(te.membro_id) > 0
      order by count(te.membro_id) desc, p.titulo, av.titulo
    `),
    db.execute<QuestaoComErro & { avaliacaoId: string } & Record<string, unknown>>(sql`
      with ${limites(periodo)}, ${tentativas},
      por_questao as (
        select te.avaliacao_id, e ->> 'q' as q,
          count(*) filter (where not (e ->> 'correta')::boolean)::int as erros, count(*)::int as respostas
        from tent te cross join jsonb_array_elements(te.correcao) e
        group by 1, 2
      ),
      top as (
        select pq.*, row_number() over (partition by pq.avaliacao_id order by pq.erros desc, pq.erros::float8 / pq.respostas desc, pq.q) as r
        from por_questao pq where pq.erros > 0
      )
      select top.avaliacao_id as "avaliacaoId", top.q as "questaoId", qq.ordem, qq.enunciado, top.erros, top.respostas
      from top
      join produtos_avaliacoes av on av.id = top.avaliacao_id and av.criador_id = ${c} and av.is_deleted = false ${filtroCurso}
      left join produtos_avaliacoes_questoes qq on qq.id::text = top.q and qq.avaliacao_id = top.avaliacao_id and qq.is_deleted = false
      where top.r <= 3
      order by top.avaliacao_id, top.r
    `),
  ]);
  const porAvaliacao = new Map<string, QuestaoComErro[]>();
  for (const { avaliacaoId, ...q } of qs.rows) porAvaliacao.set(avaliacaoId, [...(porAvaliacao.get(avaliacaoId) ?? []), q]);
  return avs.rows.map((a) => ({ ...a, questoes: porAvaliacao.get(a.avaliacaoId) ?? [] }));
}
