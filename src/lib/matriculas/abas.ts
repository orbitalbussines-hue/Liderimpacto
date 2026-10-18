import "server-only";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  criadores_membros,
  produtos,
  produtos_avaliacoes as av,
  produtos_avaliacoes_concessoes as conc,
  produtos_avaliacoes_tentativas as tent,
  produtos_matriculas as pm,
  usuarios,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

/**
 * Abas "Progresso", "Avaliações" e "Tentativas extras" de Matrículas (RN-205). Só LEITURA sobre
 * tabelas que já existem; `criadorId` do host; tudo filtra criador e vivos. A aba "Correção" vira
 * "Tentativas extras" (ADR-0018 item 6): as avaliações são objetivas e corrigidas no servidor; o que
 * a equipe decide é quem ganha nova chance (`concederTentativa`, já existente).
 */

const curinga = (texto: string) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

interface Pagina {
  pagina: number;
  porPagina: number;
}

export interface FiltrosProgresso extends Pagina {
  produtoId?: string;
  busca?: string;
  /** Só quem não concluiu (padrão: todos). */
  soEmAndamento?: boolean;
}

/** Progresso por aluno × curso: aulas concluídas / aulas publicadas, última atividade, concluída em. */
export async function progressoDasMatriculas(criadorId: string, f: FiltrosProgresso) {
  const condicoes: SQL[] = [eq(pm.criador_id, criadorId), vivos(pm), vivos(criadores_membros), vivos(produtos), eq(pm.status, "ATIVA")];
  if (f.produtoId) condicoes.push(eq(pm.produto_id, f.produtoId));
  if (f.busca?.trim()) condicoes.push(or(ilike(usuarios.nome, curinga(f.busca.trim())), ilike(usuarios.email, curinga(f.busca.trim())))!);
  if (f.soEmAndamento) condicoes.push(sql`${pm.concluida_em} is null`);
  // Aulas que contam: vivas, de módulo PUBLICADO e vivo (mesma regra da conclusão da matrícula).
  const aulasDoCurso = sql`from produtos_modulos_aulas a join produtos_modulos mo on mo.id = a.modulo_id
    where mo.produto_id = ${pm.produto_id} and mo.status = 'PUBLICADO' and mo.is_deleted = false and a.is_deleted = false`;
  const linhas = await db
    .select({
      matriculaId: pm.id,
      membroId: pm.membro_id,
      nome: usuarios.nome,
      email: usuarios.email,
      produtoId: produtos.id,
      produto: produtos.titulo,
      iniciadaEm: pm.iniciada_em,
      concluidaEm: pm.concluida_em,
      expiraEm: pm.expira_em,
      totalAulas: sql<number>`(select count(*)::int ${aulasDoCurso})`,
      concluidas: sql<number>`(select count(*)::int ${aulasDoCurso} and exists (
        select 1 from produtos_modulos_aulas_progressos pr where pr.aula_id = a.id and pr.membro_id = ${pm.membro_id} and pr.concluida and pr.is_deleted = false))`,
      ultimaAtividade: sql<Date | null>`(select max(pr.updated_at) from produtos_modulos_aulas_progressos pr join produtos_modulos_aulas a on a.id = pr.aula_id
        join produtos_modulos mo on mo.id = a.modulo_id where mo.produto_id = ${pm.produto_id} and pr.membro_id = ${pm.membro_id} and pr.is_deleted = false)`,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(pm)
    .innerJoin(criadores_membros, eq(criadores_membros.id, pm.membro_id))
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .innerJoin(produtos, eq(produtos.id, pm.produto_id))
    .where(and(...condicoes))
    .orderBy(desc(pm.iniciada_em), desc(pm.id))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  return {
    total: linhas[0]?.total ?? 0,
    linhas: linhas.map(({ ultimaAtividade, ...l }) => ({
      ...l,
      ultimaAtividade: ultimaAtividade ? new Date(ultimaAtividade) : null,
      percentual: l.totalAulas ? Math.round((l.concluidas * 100) / l.totalAulas) : 0,
    })),
  };
}

export interface FiltrosTentativas extends Pagina {
  produtoId?: string;
  avaliacaoId?: string;
  /** true = aprovadas; false = reprovadas (finalizadas); ausente = todas, inclusive em andamento. */
  aprovada?: boolean;
  busca?: string;
}

/** Aba "Avaliações": tentativas de ALUNOS (a prévia da equipe fica de fora), mais recentes primeiro. */
export async function tentativasDoCriador(criadorId: string, f: FiltrosTentativas) {
  const condicoes: SQL[] = [eq(tent.criador_id, criadorId), vivos(tent), vivos(av), vivos(criadores_membros), eq(criadores_membros.papel, "ALUNO")];
  if (f.produtoId) condicoes.push(eq(av.produto_id, f.produtoId));
  if (f.avaliacaoId) condicoes.push(eq(tent.avaliacao_id, f.avaliacaoId));
  if (f.aprovada !== undefined) condicoes.push(eq(tent.aprovada, f.aprovada));
  if (f.busca?.trim()) condicoes.push(or(ilike(usuarios.nome, curinga(f.busca.trim())), ilike(usuarios.email, curinga(f.busca.trim())))!);
  const linhas = await db
    .select({
      tentativaId: tent.id,
      numero: tent.numero,
      iniciadaEm: tent.iniciada_em,
      finalizadaEm: tent.finalizada_em,
      finalizadaPor: tent.finalizada_por,
      nota: tent.nota,
      aprovada: tent.aprovada,
      avaliacaoId: av.id,
      avaliacao: av.titulo,
      notaMinima: av.nota_minima,
      produtoId: produtos.id,
      produto: produtos.titulo,
      membroId: criadores_membros.id,
      nome: usuarios.nome,
      email: usuarios.email,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(tent)
    .innerJoin(av, eq(av.id, tent.avaliacao_id))
    .innerJoin(produtos, eq(produtos.id, av.produto_id))
    .innerJoin(criadores_membros, eq(criadores_membros.id, tent.membro_id))
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(and(...condicoes))
    .orderBy(desc(tent.iniciada_em), desc(tent.id))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  return { total: linhas[0]?.total ?? 0, linhas: linhas.map((l) => ({ ...l, emAndamento: l.finalizadaEm === null })) };
}

/**
 * Aba "Tentativas extras", parte 1: quem ESGOTOU as tentativas sem aprovar (avaliações com limite) —
 * a fila de decisão da equipe. Conceder = `acaoConcederTentativa` (já existe).
 */
export async function esgotaramSemAprovar(criadorId: string) {
  const { rows } = await db.execute<{
    membro_id: string;
    nome: string;
    email: string;
    avaliacao_id: string;
    avaliacao: string;
    produto: string;
    finalizadas: number;
    extras: number;
    melhor_nota: number | null;
    ultima_em: string;
  }>(sql`
    select m.id as membro_id, u.nome, u.email, a.id as avaliacao_id, a.titulo as avaliacao, p.titulo as produto,
      count(*) filter (where t.finalizada_em is not null)::int as finalizadas,
      coalesce((select sum(c.quantidade) from produtos_avaliacoes_concessoes c where c.avaliacao_id = a.id and c.membro_id = m.id and c.is_deleted = false), 0)::int as extras,
      max(t.nota)::float8 as melhor_nota, max(t.finalizada_em)::text as ultima_em
    from produtos_avaliacoes_tentativas t
    join produtos_avaliacoes a on a.id = t.avaliacao_id and a.is_deleted = false
    join produtos p on p.id = a.produto_id and p.is_deleted = false
    join criadores_membros m on m.id = t.membro_id and m.is_deleted = false and m.papel = 'ALUNO'
    join usuarios u on u.id = m.usuario_id
    where t.criador_id = ${criadorId}::uuid and t.is_deleted = false and a.tentativas_max > 0
    group by m.id, u.id, a.id, p.id
    having not coalesce(bool_or(t.aprovada), false) and bool_and(t.finalizada_em is not null)
      and count(*) filter (where t.finalizada_em is not null) >= max(a.tentativas_max)
        + coalesce((select sum(c.quantidade) from produtos_avaliacoes_concessoes c where c.avaliacao_id = a.id and c.membro_id = m.id and c.is_deleted = false), 0)
    order by max(t.finalizada_em) desc
    limit 200`);
  return rows.map((r) => ({
    membroId: r.membro_id,
    nome: r.nome,
    email: r.email,
    avaliacaoId: r.avaliacao_id,
    avaliacao: r.avaliacao,
    produto: r.produto,
    finalizadas: r.finalizadas,
    extras: r.extras,
    melhorNota: r.melhor_nota,
    ultimaEm: new Date(r.ultima_em),
  }));
}

const quemConcedeu = alias(usuarios, "quem_concedeu");

/** Aba "Tentativas extras", parte 2: histórico das concessões (quem, quanto, por quê, quem deu). */
export async function concessoesDoCriador(criadorId: string, f: Pagina & { avaliacaoId?: string }) {
  const condicoes: SQL[] = [eq(conc.criador_id, criadorId), vivos(conc), vivos(av)];
  if (f.avaliacaoId) condicoes.push(eq(conc.avaliacao_id, f.avaliacaoId));
  const linhas = await db
    .select({
      id: conc.id,
      quantidade: conc.quantidade,
      motivo: conc.motivo,
      quando: conc.created_at,
      avaliacaoId: av.id,
      avaliacao: av.titulo,
      membroId: criadores_membros.id,
      nome: usuarios.nome,
      email: usuarios.email,
      concedidaPor: quemConcedeu.nome,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(conc)
    .innerJoin(av, eq(av.id, conc.avaliacao_id))
    .innerJoin(criadores_membros, eq(criadores_membros.id, conc.membro_id))
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .leftJoin(quemConcedeu, eq(quemConcedeu.id, conc.modified_by))
    .where(and(...condicoes))
    .orderBy(desc(conc.created_at), desc(conc.id))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  return { total: linhas[0]?.total ?? 0, linhas };
}
