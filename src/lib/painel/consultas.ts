import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Intervalo } from "./periodo";
import type { EventoPainel } from "./regras";

/**
 * LEITURAS do painel do admin (passo 6). `criadorId` vem SEMPRE do host. Cada bloco = UMA
 * instrução agregada (sem N+1). Dias no calendário de Brasília: o período é `de..ate` (inclusivos,
 * `src/lib/painel/periodo.ts`); o anterior equivalente são os mesmos N dias antes de `de`. Nada
 * depois de `ate` conta. Coluna `instante` é comparada com a MEIA-NOITE de Brasília convertida
 * (usa índice; nada de `::date` em UTC). Só membros com papel ALUNO entram nas métricas de aluno.
 * Definições: docs/back.md (Painel).
 */

export const HOJE = sql.raw(`(now() at time zone 'America/Sao_Paulo')::date`);
/**
 * CTE `t` com os limites do período (`ini`..`fim`, dias) e do anterior (`ini_ant`..`ini - 1`).
 * `t_ini`, `t_ini_ant` = meia-noite de Brasília do dia; `t_fim` = meia-noite do dia SEGUINTE a
 * `fim` (exclusivo): instante entra se `>= t_ini and < t_fim`.
 */
export const limites = (p: Pick<Intervalo, "de" | "ate">) => sql`
  t0 as (
    select ${p.de}::date as ini, ${p.ate}::date as fim, ${p.de}::date - (${p.ate}::date - ${p.de}::date + 1) as ini_ant
  ),
  t as (
    select t0.*, (t0.ini::timestamp at time zone 'America/Sao_Paulo') as t_ini,
      ((t0.fim + 1)::timestamp at time zone 'America/Sao_Paulo') as t_fim,
      (t0.ini_ant::timestamp at time zone 'America/Sao_Paulo') as t_ini_ant
    from t0
  )`;

export interface KpisPainel {
  ativos: number;
  ativosAnt: number;
  novos: number;
  novosAnt: number;
  matriculas: number;
  matriculasAnt: number;
  /** Matrículas valendo AGORA (ATIVA e não expirada) de alunos, e quantas delas concluídas. */
  validas: number;
  validasConcluidas: number;
  aulas: number;
  aulasAnt: number;
}

export async function kpisDoPainel(criadorId: string, periodo: Intervalo): Promise<KpisPainel> {
  const c = sql`${criadorId}::uuid`;
  const { rows } = await db.execute<Record<string, number>>(sql`
    with ${limites(periodo)}
    select
      (select count(distinct a.membro_id) filter (where a.dia >= t.ini) from criadores_membros_atividades a
        join criadores_membros m on m.id = a.membro_id and m.papel = 'ALUNO' and m.is_deleted = false
        where a.criador_id = ${c} and a.is_deleted = false and a.dia between t.ini_ant and t.fim)::int as "ativos",
      (select count(distinct a.membro_id) filter (where a.dia < t.ini) from criadores_membros_atividades a
        join criadores_membros m on m.id = a.membro_id and m.papel = 'ALUNO' and m.is_deleted = false
        where a.criador_id = ${c} and a.is_deleted = false and a.dia between t.ini_ant and t.fim)::int as "ativosAnt",
      (select count(*) filter (where m.created_at >= t.t_ini) from criadores_membros m
        where m.criador_id = ${c} and m.is_deleted = false and m.papel = 'ALUNO' and m.created_at >= t.t_ini_ant and m.created_at < t.t_fim)::int as "novos",
      (select count(*) filter (where m.created_at < t.t_ini) from criadores_membros m
        where m.criador_id = ${c} and m.is_deleted = false and m.papel = 'ALUNO' and m.created_at >= t.t_ini_ant and m.created_at < t.t_fim)::int as "novosAnt",
      (select count(*) filter (where pm.iniciada_em >= t.t_ini) from produtos_matriculas pm
        join criadores_membros m on m.id = pm.membro_id and m.papel = 'ALUNO' and m.is_deleted = false
        where pm.criador_id = ${c} and pm.is_deleted = false and pm.iniciada_em >= t.t_ini_ant and pm.iniciada_em < t.t_fim)::int as "matriculas",
      (select count(*) filter (where pm.iniciada_em < t.t_ini) from produtos_matriculas pm
        join criadores_membros m on m.id = pm.membro_id and m.papel = 'ALUNO' and m.is_deleted = false
        where pm.criador_id = ${c} and pm.is_deleted = false and pm.iniciada_em >= t.t_ini_ant and pm.iniciada_em < t.t_fim)::int as "matriculasAnt",
      (select count(*) from produtos_matriculas pm
        join criadores_membros m on m.id = pm.membro_id and m.papel = 'ALUNO' and m.is_deleted = false
        where pm.criador_id = ${c} and pm.is_deleted = false and pm.status = 'ATIVA' and (pm.expira_em is null or pm.expira_em > now()))::int as "validas",
      (select count(*) from produtos_matriculas pm
        join criadores_membros m on m.id = pm.membro_id and m.papel = 'ALUNO' and m.is_deleted = false
        where pm.criador_id = ${c} and pm.is_deleted = false and pm.status = 'ATIVA' and (pm.expira_em is null or pm.expira_em > now())
          and pm.concluida_em is not null)::int as "validasConcluidas",
      (select count(*) filter (where p.concluida_em >= t.t_ini) from produtos_modulos_aulas_progressos p
        join criadores_membros m on m.id = p.membro_id and m.papel = 'ALUNO' and m.is_deleted = false
        where p.criador_id = ${c} and p.concluida and p.is_deleted = false and p.concluida_em >= t.t_ini_ant and p.concluida_em < t.t_fim)::int as "aulas",
      (select count(*) filter (where p.concluida_em < t.t_ini) from produtos_modulos_aulas_progressos p
        join criadores_membros m on m.id = p.membro_id and m.papel = 'ALUNO' and m.is_deleted = false
        where p.criador_id = ${c} and p.concluida and p.is_deleted = false and p.concluida_em >= t.t_ini_ant and p.concluida_em < t.t_fim)::int as "aulasAnt"
    from t
  `);
  return rows[0] as unknown as KpisPainel;
}

export interface AcessoDoDia {
  /** AAAA-MM-DD (Brasília). */
  dia: string;
  alunos: number;
}

/** Últimos 14 dias (sempre 14, hoje por último): alunos DISTINTOS com atividade de aula no dia. */
export async function acessosPorDia(criadorId: string): Promise<AcessoDoDia[]> {
  const { rows } = await db.execute<{ dia: string; alunos: number }>(sql`
    select to_char(d.dia, 'YYYY-MM-DD') as dia, count(a.membro_id)::int as alunos
    from generate_series(${HOJE} - 13, ${HOJE}, interval '1 day') as d(dia)
    left join (
      criadores_membros_atividades a
      join criadores_membros m on m.id = a.membro_id and m.papel = 'ALUNO' and m.is_deleted = false
    ) on a.dia = d.dia::date and a.criador_id = ${criadorId}::uuid and a.is_deleted = false
    group by d.dia
    order by d.dia
  `);
  return rows;
}

export interface AulaMaisAssistida {
  aulaId: string;
  titulo: string;
  curso: string;
  visualizacoes: number;
}

/** Aulas com mais visualizações (agregado do Top 10: 1 por membro/aula/dia) no período `de..ate`. */
export async function maisAssistidas(criadorId: string, periodo: Intervalo, limite = 5): Promise<AulaMaisAssistida[]> {
  const { rows } = await db.execute<{ aulaId: string; titulo: string; curso: string; visualizacoes: number }>(sql`
    with ${limites(periodo)}
    select a.id as "aulaId", a.titulo, p.titulo as curso, sum(v.visualizacoes)::int as visualizacoes
    from t, produtos_modulos_aulas_visualizacoes v
    join produtos_modulos_aulas a on a.id = v.aula_id and a.is_deleted = false
    join produtos_modulos mo on mo.id = a.modulo_id and mo.is_deleted = false
    join produtos p on p.id = mo.produto_id and p.is_deleted = false
    where v.criador_id = ${criadorId}::uuid and v.is_deleted = false and v.dia between t.ini and t.fim
    group by a.id, a.titulo, p.titulo
    having sum(v.visualizacoes) > 0
    order by visualizacoes desc, a.titulo
    limit ${limite}
  `);
  return rows;
}

export interface SaudeProdutos {
  publicados: number;
  /** Média, entre os produtos PUBLICADOS com matrícula valendo, de (concluídas ÷ valendo). Nula sem nenhum. */
  taxaMedia: number | null;
  /** Alunos distintos com ao menos uma matrícula valendo. */
  alunosComMatricula: number;
}

export async function saudeDosProdutos(criadorId: string): Promise<SaudeProdutos> {
  const c = sql`${criadorId}::uuid`;
  const { rows } = await db.execute<{ publicados: number; taxaMedia: string | null; alunosComMatricula: number }>(sql`
    with validas as (
      select pm.produto_id, pm.membro_id, pm.concluida_em from produtos_matriculas pm
      join criadores_membros m on m.id = pm.membro_id and m.papel = 'ALUNO' and m.is_deleted = false
      join produtos p on p.id = pm.produto_id and p.is_deleted = false
      where pm.criador_id = ${c} and pm.is_deleted = false and pm.status = 'ATIVA' and (pm.expira_em is null or pm.expira_em > now())
    )
    select
      (select count(*) from produtos where criador_id = ${c} and is_deleted = false and status = 'PUBLICADO')::int as "publicados",
      (select avg(x.taxa) from (
        select count(*) filter (where v.concluida_em is not null)::numeric / count(*) as taxa
        from validas v join produtos p on p.id = v.produto_id and p.status = 'PUBLICADO'
        group by v.produto_id
      ) x)::text as "taxaMedia",
      (select count(distinct membro_id) from validas)::int as "alunosComMatricula"
  `);
  const r = rows[0];
  return { publicados: r.publicados, alunosComMatricula: r.alunosComMatricula, taxaMedia: r.taxaMedia === null ? null : Number(r.taxaMedia) };
}

interface LinhaEvento extends Record<string, unknown> {
  tipo: EventoPainel["tipo"];
  quando: Date | string;
  pessoa: string | null;
  produto: string | null;
  aula: string | null;
  numero: string | null;
  papel: "DONO" | "ADMIN" | "ALUNO" | null;
}

/**
 * "Acontecendo agora": os últimos eventos do criador, das fontes:
 * - trilha (`auditoria`): matrícula criada/reativada, membro vinculado, produto publicado, vídeo
 *   pronto (worker). Lê SÓ ids da linha e junta nome/título nas tabelas; `detalhes` nunca sai.
 * - progresso: aula concluída por ALUNO (`concluida_em`, botão ou 90%). A conclusão automática não
 *   grava trilha (hot path, ADR-0006), então a fonte das duas formas é o próprio progresso.
 * Número "3.2" da aula = posição entre os módulos PUBLICADOS e as aulas vivas (como o aluno vê).
 * Sem cache: é o "agora".
 */
export async function acontecendoAgora(criadorId: string, limite = 8): Promise<EventoPainel[]> {
  const c = sql`${criadorId}::uuid`;
  const { rows } = await db.execute<LinhaEvento>(sql`
    with numeradas as (
      select a.id,
        dense_rank() over (partition by mo.produto_id order by mo.ordem, mo.id) || '.' || row_number() over (partition by mo.id order by a.ordem, a.id) as numero
      from produtos_modulos mo join produtos_modulos_aulas a on a.modulo_id = mo.id and a.is_deleted = false
      where mo.criador_id = ${c} and mo.is_deleted = false and mo.status = 'PUBLICADO'
    ),
    eventos as (
      (select case when au.acao = 'criar' then 'matricula' else 'reativacao' end as tipo, au.created_at as quando,
         u.nome as pessoa, p.titulo as produto, null as aula, null as numero, null as papel
       from auditoria au
       join produtos_matriculas pm on pm.id = au.registro_id and pm.criador_id = ${c}
       join criadores_membros m on m.id = pm.membro_id
       join usuarios u on u.id = m.usuario_id
       join produtos p on p.id = pm.produto_id and p.is_deleted = false
       where au.criador_id = ${c} and au.tabela = 'produtos_matriculas'
         and (au.acao = 'criar' or (au.acao = 'atualizar' and au.dados_novos ? 'iniciada_em'))
       order by au.created_at desc limit ${limite})
      union all
      (select 'membro', au.created_at, u.nome, null, null, null, m.papel
       from auditoria au
       join criadores_membros m on m.id = au.registro_id and m.criador_id = ${c} and m.is_deleted = false
       join usuarios u on u.id = m.usuario_id
       where au.criador_id = ${c} and au.tabela = 'criadores_membros' and au.acao = 'criar'
       order by au.created_at desc limit ${limite})
      union all
      (select 'publicacao', au.created_at, u.nome, p.titulo, null, null, null
       from auditoria au
       join produtos p on p.id = au.registro_id and p.criador_id = ${c} and p.is_deleted = false
       left join usuarios u on u.id = au.user_id
       where au.criador_id = ${c} and au.tabela = 'produtos' and au.acao = 'publicar' and au.dados_novos ->> 'status' = 'PUBLICADO'
       order by au.created_at desc limit ${limite})
      union all
      (select 'video', au.created_at, null, null, a.titulo, null, null
       from auditoria au
       join produtos_modulos_aulas_videos v on v.id = au.registro_id and v.criador_id = ${c}
       join produtos_modulos_aulas a on a.id = v.aula_id and a.is_deleted = false
       where au.criador_id = ${c} and au.tabela = 'produtos_modulos_aulas_videos' and au.dados_novos ->> 'situacao' = 'PRONTO'
       order by au.created_at desc limit ${limite})
      union all
      (select 'conclusao', pr.concluida_em, u.nome, null, a.titulo, n.numero, null
       from produtos_modulos_aulas_progressos pr
       join criadores_membros m on m.id = pr.membro_id and m.papel = 'ALUNO' and m.is_deleted = false
       join usuarios u on u.id = m.usuario_id
       join produtos_modulos_aulas a on a.id = pr.aula_id and a.is_deleted = false
       left join numeradas n on n.id = a.id
       where pr.criador_id = ${c} and pr.concluida and pr.is_deleted = false
       order by pr.concluida_em desc limit ${limite})
    )
    select * from eventos order by quando desc limit ${limite}
  `);
  return rows.map(paraEvento);
}

function paraEvento(l: LinhaEvento): EventoPainel {
  const quando = new Date(l.quando);
  switch (l.tipo) {
    case "matricula":
    case "reativacao":
      return { tipo: l.tipo, quando, pessoa: l.pessoa ?? "", produto: l.produto ?? "" };
    case "membro":
      return { tipo: "membro", quando, pessoa: l.pessoa ?? "", papel: l.papel ?? "ALUNO" };
    case "publicacao":
      return { tipo: "publicacao", quando, pessoa: l.pessoa, produto: l.produto ?? "" };
    case "video":
      return { tipo: "video", quando, aula: l.aula ?? "" };
    case "conclusao":
      return { tipo: "conclusao", quando, pessoa: l.pessoa ?? "", aula: l.aula ?? "", numero: l.numero };
  }
}
