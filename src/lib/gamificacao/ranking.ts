import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { configDaGamificacao } from "./pontos";
import { nivelDoMembro, type NivelDoMembro, type PeriodoRanking } from "./regras";

/**
 * LEITURAS de pontos e ranking (ADR-0012, RN-146): tudo é SOMA do razão (nada de saldo gravado).
 * Período pelo `ocorrido_em` (quando o fato aconteceu): semana = desde segunda 00:00 de Brasília,
 * mês = desde o dia 1 00:00 de Brasília, total = tudo. No ranking só entram ALUNOS com vínculo vivo
 * e ATIVO que não saíram do ranking (`usuarios.aparecer_no_ranking`) e com saldo > 0.
 * ponytail: soma por requisição (índice (criador, ocorrido_em, membro, pontos)); a tela cacheia com
 * "use cache" de minutos. Se um criador passar de ~1 milhão de lançamentos, agregar por dia.
 */

const BRT = "America/Sao_Paulo";
const inicioSql = (unidade: "week" | "month", agora: Date): SQL =>
  sql`(date_trunc(${unidade}, ${agora}::timestamptz at time zone ${BRT}) at time zone ${BRT})`;

const desdeSql = (periodo: PeriodoRanking, agora: Date): SQL =>
  periodo === "total" ? sql`true` : sql`p.ocorrido_em >= ${inicioSql(periodo === "semana" ? "week" : "month", agora)}`;

export interface LinhaRanking {
  posicao: number;
  membroId: string;
  nome: string;
  imagem: string | null;
  pontos: number;
}

/** Top `limite` do criador no período. Empate = mesma posição (rank). */
export async function rankingDoCriador(criadorId: string, periodo: PeriodoRanking, agora: Date, limite = 50): Promise<LinhaRanking[]> {
  const { rows } = await db.execute<LinhaRanking & Record<string, unknown>>(sql`
    select (rank() over (order by sum(p.pontos) desc))::int as posicao, m.id as "membroId", u.nome, u.imagem, sum(p.pontos)::int as pontos
    from criadores_membros_pontos p
    join criadores_membros m on m.id = p.membro_id and m.is_deleted = false and m.papel = 'ALUNO' and m.status = 'ATIVO'
    join usuarios u on u.id = m.usuario_id and u.is_deleted = false and u.aparecer_no_ranking
    where p.criador_id = ${criadorId}::uuid and p.ocorrido_em <= ${agora} and ${desdeSql(periodo, agora)}
    group by m.id, u.nome, u.imagem
    having sum(p.pontos) > 0
    order by pontos desc, u.nome, m.id
    limit ${limite}
  `);
  return rows;
}

export interface ResumoDePontos {
  total: number;
  semana: number;
  mes: number;
  nivel: NivelDoMembro;
  /** Posição em cada período; nulo = não aparece (saiu do ranking, não é aluno ou saldo ≤ 0). */
  posicao: Record<PeriodoRanking, number | null>;
  aparecerNoRanking: boolean;
}

/** Saldo, nível (pelos níveis do criador) e posição do membro — perfil, cabeçalho do ranking. */
export async function resumoDoMembro(criadorId: string, membroId: string, agora: Date): Promise<ResumoDePontos> {
  const semana = inicioSql("week", agora);
  const mes = inicioSql("month", agora);
  const [config, { rows }] = await Promise.all([
    configDaGamificacao(criadorId),
    db.execute<{ membro_id: string; total: number; semana: number; mes: number; visivel: boolean } & Record<string, unknown>>(sql`
      select p.membro_id, sum(p.pontos)::int as total,
        coalesce(sum(p.pontos) filter (where p.ocorrido_em >= ${semana}), 0)::int as semana,
        coalesce(sum(p.pontos) filter (where p.ocorrido_em >= ${mes}), 0)::int as mes,
        bool_and(m.papel = 'ALUNO' and m.status = 'ATIVO' and u.aparecer_no_ranking) as visivel
      from criadores_membros_pontos p
      join criadores_membros m on m.id = p.membro_id and m.is_deleted = false
      join usuarios u on u.id = m.usuario_id and u.is_deleted = false
      where p.criador_id = ${criadorId}::uuid and p.ocorrido_em <= ${agora}
      group by p.membro_id
    `),
  ]);
  const meu = rows.find((r) => r.membro_id === membroId);
  const [eu] = (await db.execute<{ aparecer: boolean }>(sql`
    select u.aparecer_no_ranking as aparecer from criadores_membros m join usuarios u on u.id = m.usuario_id
    where m.id = ${membroId}::uuid and m.criador_id = ${criadorId}::uuid and m.is_deleted = false`)).rows;
  const posicaoEm = (k: PeriodoRanking): number | null => {
    if (!meu?.visivel || meu[k] <= 0) return null;
    return 1 + rows.filter((r) => r.visivel && r[k] > meu[k]).length;
  };
  const total = meu?.total ?? 0;
  return {
    total,
    semana: meu?.semana ?? 0,
    mes: meu?.mes ?? 0,
    nivel: nivelDoMembro(total, config.niveis),
    posicao: { semana: posicaoEm("semana"), mes: posicaoEm("mes"), total: posicaoEm("total") },
    aparecerNoRanking: eu?.aparecer ?? true,
  };
}

export interface LancamentoDoMembro {
  id: string;
  motivo: string;
  pontos: number;
  referencia: string;
  ocorridoEm: Date;
  justificativa: string | null;
}

/** Extrato do membro (mais recentes primeiro). A tela traduz o motivo por `ROTULO_DO_MOTIVO`. */
export async function extratoDoMembro(criadorId: string, membroId: string, limite = 50): Promise<LancamentoDoMembro[]> {
  const { rows } = await db.execute<{ id: string; motivo: string; pontos: number; referencia: string; ocorrido_em: string | Date; justificativa: string | null }>(sql`
    select id, motivo, pontos, referencia, ocorrido_em, justificativa from criadores_membros_pontos
    where criador_id = ${criadorId}::uuid and membro_id = ${membroId}::uuid
    order by ocorrido_em desc, id desc limit ${limite}
  `);
  return rows.map((r) => ({ id: r.id, motivo: r.motivo, pontos: r.pontos, referencia: r.referencia, ocorridoEm: new Date(r.ocorrido_em), justificativa: r.justificativa }));
}

/** Saldo TOTAL (soma do razão) de cada membro pedido — o nível nas listas do ranking por período. */
export async function saldosDosMembros(criadorId: string, membroIds: readonly string[]): Promise<Map<string, number>> {
  if (membroIds.length === 0) return new Map();
  const { rows } = await db.execute<{ membro_id: string; total: number }>(sql`
    select membro_id, sum(pontos)::int as total from criadores_membros_pontos
    where criador_id = ${criadorId}::uuid and membro_id in (${sql.join(membroIds.map((id) => sql`${id}::uuid`), sql`, `)})
    group by membro_id
  `);
  return new Map(rows.map((r) => [r.membro_id, r.total]));
}
