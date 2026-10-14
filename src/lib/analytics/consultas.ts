import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { HOJE, limites } from "@/lib/painel/consultas";
import { agrupamentoDaSerie, type Intervalo } from "@/lib/painel/periodo";
import { SEMANAS_COORTE, type AulaAnalytics, type LinhaCoorte } from "./regras";

/**
 * LEITURAS do Analytics (/admin/analytics). `criadorId` vem SEMPRE do host; `curso` (produto) é
 * opcional e só filtra DENTRO do criador (toda tabela é filtrada por `criador_id`: id de outro
 * criador devolve vazio). Uma instrução agregada por bloco (sem N+1), vivos em tudo, e só
 * vínculos vivos com papel ALUNO contam. Período e limites = os do painel (`de..ate`, dias de
 * Brasília; nada depois de `ate` conta).
 * Definições: docs/back.md (Analytics) e RN-139.
 */

const ALUNO = (col: SQL) => sql`join criadores_membros m on m.id = ${col} and m.papel = 'ALUNO' and m.is_deleted = false`;
const doCurso = (col: SQL, curso: string | null) => (curso ? sql`and ${col} = ${curso}::uuid` : sql``);

/** CTE `aulas_c`: aulas vivas de módulo e produto vivos do criador (e do curso, se filtrado). */
const aulasDoEscopo = (c: SQL, curso: string | null) => sql`
  aulas_c as (
    select a.id from produtos_modulos_aulas a
    join produtos_modulos mo on mo.id = a.modulo_id and mo.is_deleted = false
    join produtos p on p.id = mo.produto_id and p.is_deleted = false
    where a.criador_id = ${c} and a.is_deleted = false ${doCurso(sql`p.id`, curso)}
  )`;

export interface CursoOpcao {
  id: string;
  titulo: string;
}

/** Cursos vivos do criador para o filtro (qualquer situação: arquivado também tem histórico). */
export async function cursosDoCriador(criadorId: string): Promise<CursoOpcao[]> {
  const { rows } = await db.execute<{ id: string; titulo: string }>(sql`
    select id, titulo from produtos where criador_id = ${criadorId}::uuid and is_deleted = false order by titulo, id
  `);
  return rows;
}

export interface KpisAnalytics {
  ativos: number;
  /** Nulo com filtro de curso: o progresso só guarda a ÚLTIMA batida (o anterior seria subcontado). */
  ativosAnt: number | null;
  aulas: number;
  aulasAnt: number;
  /** Matrículas valendo agora (ATIVA, não expirada) e quantas concluídas. */
  validas: number;
  validasConcluidas: number;
  /** Matrículas com `concluida_em` no período / no anterior. */
  cursosConcluidos: number;
  cursosConcluidosAnt: number;
  /** Pares (aluno, avaliação) com tentativa finalizada no período, e quantos com ao menos uma aprovada. */
  avaliados: number;
  aprovados: number;
  avaliadosAnt: number;
  aprovadosAnt: number;
}

export async function kpisAnalytics(criadorId: string, periodo: Intervalo, curso: string | null): Promise<KpisAnalytics> {
  const c = sql`${criadorId}::uuid`;
  const ativos = curso
    ? sql`
      (select count(distinct pr.membro_id) from produtos_modulos_aulas_progressos pr ${ALUNO(sql`pr.membro_id`)}
        where pr.criador_id = ${c} and pr.is_deleted = false and pr.aula_id in (select id from aulas_c)
          and (pr.segundos_assistidos > 0 or pr.concluida) and pr.updated_at >= t.t_ini and pr.updated_at < t.t_fim)::int as "ativos",
      null::int as "ativosAnt",`
    : sql`
      (select count(distinct a.membro_id) filter (where a.dia >= t.ini) from criadores_membros_atividades a ${ALUNO(sql`a.membro_id`)}
        where a.criador_id = ${c} and a.is_deleted = false and a.dia between t.ini_ant and t.fim)::int as "ativos",
      (select count(distinct a.membro_id) filter (where a.dia < t.ini) from criadores_membros_atividades a ${ALUNO(sql`a.membro_id`)}
        where a.criador_id = ${c} and a.is_deleted = false and a.dia between t.ini_ant and t.fim)::int as "ativosAnt",`;
  const { rows } = await db.execute<Record<string, number | null>>(sql`
    with ${limites(periodo)}, ${aulasDoEscopo(c, curso)},
    mat as (
      select pm.status, pm.expira_em, pm.concluida_em from produtos_matriculas pm ${ALUNO(sql`pm.membro_id`)}
      join produtos p on p.id = pm.produto_id and p.is_deleted = false
      where pm.criador_id = ${c} and pm.is_deleted = false ${doCurso(sql`pm.produto_id`, curso)}
    ),
    pares as (
      select te.membro_id, te.avaliacao_id, te.finalizada_em >= t.t_ini as atual, bool_or(te.aprovada) as aprovado
      from t, produtos_avaliacoes_tentativas te ${ALUNO(sql`te.membro_id`)}
      join produtos_avaliacoes av on av.id = te.avaliacao_id and av.is_deleted = false ${doCurso(sql`av.produto_id`, curso)}
      join produtos p on p.id = av.produto_id and p.is_deleted = false
      where te.criador_id = ${c} and te.is_deleted = false and te.finalizada_em >= t.t_ini_ant and te.finalizada_em < t.t_fim
      group by 1, 2, 3
    )
    select
      ${ativos}
      (select count(*) filter (where pr.concluida_em >= t.t_ini) from produtos_modulos_aulas_progressos pr ${ALUNO(sql`pr.membro_id`)}
        where pr.criador_id = ${c} and pr.concluida and pr.is_deleted = false and pr.concluida_em >= t.t_ini_ant and pr.concluida_em < t.t_fim
          and pr.aula_id in (select id from aulas_c))::int as "aulas",
      (select count(*) filter (where pr.concluida_em < t.t_ini) from produtos_modulos_aulas_progressos pr ${ALUNO(sql`pr.membro_id`)}
        where pr.criador_id = ${c} and pr.concluida and pr.is_deleted = false and pr.concluida_em >= t.t_ini_ant and pr.concluida_em < t.t_fim
          and pr.aula_id in (select id from aulas_c))::int as "aulasAnt",
      (select count(*) from mat where status = 'ATIVA' and (expira_em is null or expira_em > now()))::int as "validas",
      (select count(*) from mat where status = 'ATIVA' and (expira_em is null or expira_em > now()) and concluida_em is not null)::int as "validasConcluidas",
      (select count(*) from mat where concluida_em >= t.t_ini and concluida_em < t.t_fim)::int as "cursosConcluidos",
      (select count(*) from mat where concluida_em >= t.t_ini_ant and concluida_em < t.t_ini)::int as "cursosConcluidosAnt",
      (select count(*) from pares where atual)::int as "avaliados",
      (select count(*) from pares where atual and aprovado)::int as "aprovados",
      (select count(*) from pares where not atual)::int as "avaliadosAnt",
      (select count(*) from pares where not atual and aprovado)::int as "aprovadosAnt"
    from t
  `);
  return rows[0] as unknown as KpisAnalytics;
}

export interface HorasAssistidas {
  segundos: number;
  segundosAnt: number | null;
  /** "acumulado" = desde sempre (hoje); "periodo" = só quando existir segundos por dia. */
  recorte: "acumulado" | "periodo";
}

/**
 * Horas assistidas = soma dos segundos ÚNICOS assistidos (bitmap do progresso) pelos alunos.
 * ponytail: o progresso guarda só o total acumulado por (aluno, aula) e nenhuma tabela tem
 * segundos por dia, então hoje sai ACUMULADO, sem período nem comparação. TODO (próxima migração):
 * coluna `segundos` em `criadores_membros_atividades` somada no upsert do progresso → trocar esta
 * função por `sum(segundos)` no período e no anterior e devolver `recorte: "periodo"` (a tela já
 * trata os dois casos). Com curso, a coluna precisaria também da aula (ou do produto).
 */
export async function horasAssistidas(criadorId: string, _periodo: Intervalo, curso: string | null): Promise<HorasAssistidas> {
  const c = sql`${criadorId}::uuid`;
  const { rows } = await db.execute<{ segundos: number }>(sql`
    with ${aulasDoEscopo(c, curso)}
    select coalesce(sum(pr.segundos_assistidos), 0)::bigint::float8 as segundos
    from produtos_modulos_aulas_progressos pr ${ALUNO(sql`pr.membro_id`)}
    where pr.criador_id = ${c} and pr.is_deleted = false and pr.aula_id in (select id from aulas_c)
  `);
  return { segundos: Number(rows[0].segundos), segundosAnt: null, recorte: "acumulado" };
}

export interface DiaAnalytics {
  /** AAAA-MM-DD (Brasília). Agrupado por semana: o 1º dia da semana DENTRO do período. */
  dia: string;
  /** Alunos distintos com atividade de aula no dia/semana (TODOS os cursos: o registro diário não guarda o curso). */
  alunos: number;
  /** Visualizações (aluno × aula por dia) nas aulas do escopo — respeita o filtro de curso. */
  visualizacoes: number;
}

/**
 * Série do período `de..ate` (zeros por `generate_series`): um ponto por dia até 92 dias; acima
 * disso um por semana (segunda a domingo, recortada no período) — `agrupamentoDaSerie`.
 */
export async function serieDiaria(criadorId: string, periodo: Intervalo, curso: string | null): Promise<DiaAnalytics[]> {
  const c = sql`${criadorId}::uuid`;
  const grupo = (col: SQL) => (agrupamentoDaSerie(periodo.dias) === "semana" ? sql`date_trunc('week', ${col})::date` : col);
  const { rows } = await db.execute<DiaAnalytics & Record<string, unknown>>(sql`
    with ${aulasDoEscopo(c, curso)},
    d as (select g::date as dia from generate_series(${periodo.de}::date, ${periodo.ate}::date, interval '1 day') g),
    b as (select ${grupo(sql`d.dia`)} as grupo, min(d.dia) as dia from d group by 1),
    al as (
      select ${grupo(sql`a.dia`)} as grupo, count(distinct a.membro_id)::int as n from criadores_membros_atividades a ${ALUNO(sql`a.membro_id`)}
      where a.criador_id = ${c} and a.is_deleted = false and a.dia between ${periodo.de}::date and ${periodo.ate}::date
      group by 1
    ),
    vi as (
      select ${grupo(sql`v.dia`)} as grupo, sum(v.visualizacoes)::int as n from produtos_modulos_aulas_visualizacoes v
      where v.criador_id = ${c} and v.is_deleted = false and v.dia between ${periodo.de}::date and ${periodo.ate}::date
        and v.aula_id in (select id from aulas_c)
      group by 1
    )
    select to_char(b.dia, 'YYYY-MM-DD') as dia, coalesce(al.n, 0) as alunos, coalesce(vi.n, 0) as visualizacoes
    from b left join al on al.grupo = b.grupo left join vi on vi.grupo = b.grupo
    order by b.dia
  `);
  return rows;
}

export interface CursoConteudo {
  produtoId: string;
  curso: string;
  /** Alunos distintos que começaram ao menos uma aula (de módulo publicado) do curso. */
  iniciaram: number;
  /** Matrículas de alunos com o curso concluído (`concluida_em`). */
  concluiram: number;
  /** Segundos únicos assistidos no curso ÷ alunos que começaram. */
  tempoMedioSeg: number;
}

/**
 * Conteúdo, SITUAÇÃO DE HOJE (acumulado, não depende do período): por aula de módulo PUBLICADO
 * (como o aluno vê) e por curso. "Começou" = progresso com segundo assistido ou concluído.
 */
export async function conteudo(criadorId: string, curso: string | null): Promise<{ cursos: CursoConteudo[]; aulas: AulaAnalytics[] }> {
  const c = sql`${criadorId}::uuid`;
  const prAluno = sql`
    select pr.* from produtos_modulos_aulas_progressos pr ${ALUNO(sql`pr.membro_id`)}
    where pr.criador_id = ${c} and pr.is_deleted = false and (pr.segundos_assistidos > 0 or pr.concluida)`;
  const [aulas, cursos] = await Promise.all([
    db.execute<AulaAnalytics & Record<string, unknown>>(sql`
      with aulas as (
        select p.id as produto_id, p.titulo as curso, a.id, a.titulo,
          dense_rank() over (partition by p.id order by mo.ordem, mo.id) as nm,
          row_number() over (partition by mo.id order by a.ordem, a.id) as na,
          row_number() over (partition by p.id order by mo.ordem, mo.id, a.ordem, a.id) as posicao
        from produtos p
        join produtos_modulos mo on mo.produto_id = p.id and mo.is_deleted = false and mo.status = 'PUBLICADO'
        join produtos_modulos_aulas a on a.modulo_id = mo.id and a.is_deleted = false
        where p.criador_id = ${c} and p.is_deleted = false ${doCurso(sql`p.id`, curso)}
      )
      select a.id as "aulaId", a.produto_id as "produtoId", a.curso, a.nm || '.' || a.na as numero, a.titulo, a.posicao::int as posicao,
        count(pr.id)::int as iniciaram,
        count(pr.id) filter (where pr.concluida)::int as concluiram,
        count(pr.id) filter (where not pr.concluida)::int as pararam,
        coalesce(avg(pr.segundos_assistidos), 0)::float8 as "tempoMedioSeg"
      from aulas a left join (${prAluno}) pr on pr.aula_id = a.id
      group by a.id, a.produto_id, a.curso, a.nm, a.na, a.titulo, a.posicao
    `),
    db.execute<CursoConteudo & Record<string, unknown>>(sql`
      select p.id as "produtoId", p.titulo as curso,
        (select count(distinct pr.membro_id) from (${prAluno}) pr
          join produtos_modulos_aulas a on a.id = pr.aula_id and a.is_deleted = false
          join produtos_modulos mo on mo.id = a.modulo_id and mo.is_deleted = false and mo.status = 'PUBLICADO' and mo.produto_id = p.id)::int as iniciaram,
        (select count(*) from produtos_matriculas pm ${ALUNO(sql`pm.membro_id`)}
          where pm.criador_id = ${c} and pm.is_deleted = false and pm.produto_id = p.id and pm.concluida_em is not null)::int as concluiram,
        coalesce((select sum(pr.segundos_assistidos)::float8 / nullif(count(distinct pr.membro_id), 0) from (${prAluno}) pr
          join produtos_modulos_aulas a on a.id = pr.aula_id and a.is_deleted = false
          join produtos_modulos mo on mo.id = a.modulo_id and mo.is_deleted = false and mo.status = 'PUBLICADO' and mo.produto_id = p.id), 0) as "tempoMedioSeg"
      from produtos p
      where p.criador_id = ${c} and p.is_deleted = false ${doCurso(sql`p.id`, curso)}
      order by p.titulo, p.id
    `),
  ]);
  return { cursos: cursos.rows, aulas: aulas.rows };
}

/**
 * Coortes das últimas 8 semanas: cada aluno entra na semana (segunda a domingo, Brasília) da sua
 * PRIMEIRA matrícula viva (no curso, se filtrado); `ativosPorSemana[k]` = alunos da coorte com
 * dia de atividade de aula k semanas depois. Atividade = qualquer aula do criador (o registro
 * diário não guarda o curso). Sempre 8 linhas, a mais antiga primeiro.
 */
export async function coortes(criadorId: string, curso: string | null): Promise<LinhaCoorte[]> {
  const c = sql`${criadorId}::uuid`;
  const { rows } = await db.execute<{ semana: string; tamanho: number; semanas: { k: number; n: number }[] }>(sql`
    with s as (
      select g::date as semana from generate_series(
        date_trunc('week', ${HOJE}) - make_interval(weeks => ${SEMANAS_COORTE - 1}::int), date_trunc('week', ${HOJE}), interval '1 week') g
    ),
    entrada as (
      select pm.membro_id, date_trunc('week', min(pm.iniciada_em at time zone 'America/Sao_Paulo'))::date as semana
      from produtos_matriculas pm ${ALUNO(sql`pm.membro_id`)}
      join produtos p on p.id = pm.produto_id and p.is_deleted = false
      where pm.criador_id = ${c} and pm.is_deleted = false ${doCurso(sql`pm.produto_id`, curso)}
      group by pm.membro_id
    ),
    coorte as (select e.* from entrada e where e.semana >= (select min(semana) from s)),
    ativ as (
      select distinct co.membro_id, co.semana, (date_trunc('week', a.dia)::date - co.semana) / 7 as k
      from coorte co join criadores_membros_atividades a
        on a.membro_id = co.membro_id and a.criador_id = ${c} and a.is_deleted = false and a.dia >= co.semana
    )
    select to_char(s.semana, 'YYYY-MM-DD') as semana,
      (select count(*) from coorte co where co.semana = s.semana)::int as tamanho,
      coalesce((select json_agg(json_build_object('k', x.k, 'n', x.n)) from (
        select k, count(*)::int as n from ativ where ativ.semana = s.semana group by k
      ) x), '[]'::json) as semanas
    from s order by s.semana
  `);
  return rows.map((r) => ({ semana: r.semana, tamanho: r.tamanho, ativosPorSemana: Object.fromEntries(r.semanas.map((x) => [x.k, x.n])) }));
}
