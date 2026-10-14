import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { MetaDesafio, PublicoDesafio, SituacaoDesafio } from "@/lib/db/schema/_enums";
import { progressoDoDesafioSql } from "./desafios";
import { configDaGamificacao } from "./pontos";
import { momentoDoDesafio, nivelDoMembro, type MomentoDoDesafio } from "./regras";

/**
 * LEITURAS das telas da equipe (Admin > Desafios e Membros > Gamificação), sempre do criador do
 * HOST e só registros vivos. Progresso e saldo são CALCULADOS (ADR-0012), nunca lidos de contador.
 */

const data = (v: string | Date) => new Date(v);
const dataOuNula = (v: string | Date | null) => (v === null ? null : new Date(v));
const curinga = (texto: string) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export interface DesafioDoAdmin {
  id: string;
  titulo: string;
  inicioEm: Date;
  fimEm: Date;
  situacao: SituacaoDesafio;
  momento: MomentoDoDesafio | "RASCUNHO";
  metaTipo: MetaDesafio;
  meta: number;
  participantes: number;
  concluidos: number;
  recompensa: string | null;
  versao: Date;
}

/** Lista do admin: rascunhos e ativos primeiro (pelo fim), encerrados depois. */
export async function desafiosDoAdmin(criadorId: string, agora: Date): Promise<DesafioDoAdmin[]> {
  const { rows } = await db.execute<Record<string, unknown> & {
    id: string; titulo: string; inicio_em: string; fim_em: string; situacao: SituacaoDesafio; meta_tipo: MetaDesafio; meta: number;
    participantes: number; concluidos: number; recompensa: string | null; updated_at: string;
  }>(sql`
    select d.id, d.titulo, d.inicio_em, d.fim_em, d.situacao, d.meta_tipo, coalesce(d.meta_quantidade, 1)::int as meta, d.recompensa, d.updated_at,
      (select count(*)::int from criadores_desafios_participacoes dp where dp.desafio_id = d.id and dp.is_deleted = false) as participantes,
      (select count(*)::int from criadores_desafios_participacoes dp where dp.desafio_id = d.id and dp.is_deleted = false and dp.concluido_em is not null) as concluidos
    from criadores_desafios d
    where d.criador_id = ${criadorId}::uuid and d.is_deleted = false
    order by (d.situacao = 'ENCERRADO' or d.fim_em <= ${agora}), d.fim_em, d.id
    limit 200
  `);
  return rows.map((l) => {
    const inicioEm = data(l.inicio_em);
    const fimEm = data(l.fim_em);
    return {
      id: l.id,
      titulo: l.titulo,
      inicioEm,
      fimEm,
      situacao: l.situacao,
      momento: l.situacao === "RASCUNHO" ? "RASCUNHO" : momentoDoDesafio({ inicioEm, fimEm, situacao: l.situacao }, agora),
      metaTipo: l.meta_tipo,
      meta: l.meta,
      participantes: l.participantes,
      concluidos: l.concluidos,
      recompensa: l.recompensa,
      versao: data(l.updated_at),
    };
  });
}

export interface ParticipanteDoDesafio {
  participacaoId: string;
  membroId: string;
  nome: string;
  email: string;
  imagem: string | null;
  entrouEm: Date;
  atual: number;
  concluidoEm: Date | null;
  recompensaEntregueEm: Date | null;
  versao: Date;
}

export interface DesafioParaEditar {
  id: string;
  versao: Date;
  situacao: SituacaoDesafio;
  momento: MomentoDoDesafio | "RASCUNHO";
  campos: {
    titulo: string; descricao: string; inicioEm: Date; fimEm: Date; metaTipo: MetaDesafio; metaQuantidade: number | null;
    metaProdutoId: string | null; metaAvaliacaoId: string | null; pontosBonus: number; recompensa: string | null; publico: PublicoDesafio; grupoIds: string[];
  };
  meta: number;
  participantes: ParticipanteDoDesafio[];
}

/** Editor: campos, grupos vivos do público e participantes com o progresso calculado na janela. */
export async function desafioParaEditar(criadorId: string, desafioId: string, agora: Date): Promise<DesafioParaEditar | null> {
  const { rows } = await db.execute<Record<string, unknown> & {
    id: string; titulo: string; descricao: string; inicio_em: string; fim_em: string; meta_tipo: MetaDesafio; meta_quantidade: number | null;
    meta_produto_id: string | null; meta_avaliacao_id: string | null; pontos_bonus: number; recompensa: string | null; situacao: SituacaoDesafio;
    publico: PublicoDesafio; updated_at: string; grupos: string[];
  }>(sql`
    select d.*, coalesce((select array_agg(dg.grupo_id::text) from criadores_desafios_grupos dg
      join criadores_grupos g on g.id = dg.grupo_id and g.is_deleted = false
      where dg.desafio_id = d.id and dg.is_deleted = false), '{}') as grupos
    from criadores_desafios d where d.id = ${desafioId}::uuid and d.criador_id = ${criadorId}::uuid and d.is_deleted = false
  `);
  const d = rows[0];
  if (!d) return null;
  const meta = d.meta_quantidade ?? 1;
  const { rows: ps } = await db.execute<Record<string, unknown> & {
    id: string; membro_id: string; nome: string; email: string; imagem: string | null; created_at: string; atual: number;
    concluido_em: string | null; recompensa_entregue_em: string | null; updated_at: string;
  }>(sql`
    select dp.id, dp.membro_id, u.nome, u.email, u.imagem, dp.created_at, dp.concluido_em, dp.recompensa_entregue_em, dp.updated_at,
      least(${progressoDoDesafioSql(sql`dp.membro_id`)}, coalesce(d.meta_quantidade, 1))::int as atual
    from criadores_desafios_participacoes dp
    join criadores_desafios d on d.id = dp.desafio_id
    join criadores_membros m on m.id = dp.membro_id
    join usuarios u on u.id = m.usuario_id
    where dp.desafio_id = ${desafioId}::uuid and dp.criador_id = ${criadorId}::uuid and dp.is_deleted = false
    order by dp.concluido_em is null, dp.concluido_em, atual desc, lower(u.nome)
    limit 500
  `);
  const inicioEm = data(d.inicio_em);
  const fimEm = data(d.fim_em);
  return {
    id: d.id,
    versao: data(d.updated_at),
    situacao: d.situacao,
    momento: d.situacao === "RASCUNHO" ? "RASCUNHO" : momentoDoDesafio({ inicioEm, fimEm, situacao: d.situacao }, agora),
    campos: {
      titulo: d.titulo, descricao: d.descricao, inicioEm, fimEm, metaTipo: d.meta_tipo, metaQuantidade: d.meta_quantidade, metaProdutoId: d.meta_produto_id,
      metaAvaliacaoId: d.meta_avaliacao_id, pontosBonus: d.pontos_bonus, recompensa: d.recompensa, publico: d.publico, grupoIds: d.grupos,
    },
    meta,
    participantes: ps.map((p) => ({
      participacaoId: p.id, membroId: p.membro_id, nome: p.nome, email: p.email, imagem: p.imagem, entrouEm: data(p.created_at), atual: p.atual,
      concluidoEm: dataOuNula(p.concluido_em), recompensaEntregueEm: dataOuNula(p.recompensa_entregue_em), versao: data(p.updated_at),
    })),
  };
}

/** Cursos e avaliações vivos do criador (metas do desafio). */
export async function opcoesDeMeta(criadorId: string) {
  const [produtos, avaliacoes] = await Promise.all([
    db.execute<{ id: string; titulo: string }>(sql`select id, titulo from produtos where criador_id = ${criadorId}::uuid and is_deleted = false order by lower(titulo) limit 500`),
    db.execute<{ id: string; titulo: string; curso: string }>(sql`
      select a.id, a.titulo, p.titulo as curso from produtos_avaliacoes a join produtos p on p.id = a.produto_id and p.is_deleted = false
      where a.criador_id = ${criadorId}::uuid and a.is_deleted = false order by lower(p.titulo), lower(a.titulo) limit 500`),
  ]);
  return { produtos: produtos.rows, avaliacoes: avaliacoes.rows };
}

export interface RecompensaDoAdmin {
  participacaoId: string;
  desafioId: string;
  desafio: string;
  recompensa: string;
  nome: string;
  email: string;
  imagem: string | null;
  concluidoEm: Date;
  entregueEm: Date | null;
  entreguePor: string | null;
  versao: Date;
}

/** Quem concluiu desafio com recompensa: pendentes primeiro (mais antigas), depois as entregues. */
export async function recompensasDoAdmin(criadorId: string): Promise<RecompensaDoAdmin[]> {
  const { rows } = await db.execute<Record<string, unknown> & {
    id: string; desafio_id: string; titulo: string; recompensa: string; nome: string; email: string; imagem: string | null;
    concluido_em: string; recompensa_entregue_em: string | null; por: string | null; updated_at: string;
  }>(sql`
    select dp.id, d.id as desafio_id, d.titulo, d.recompensa, u.nome, u.email, u.imagem, dp.concluido_em, dp.recompensa_entregue_em, ue.nome as por, dp.updated_at
    from criadores_desafios_participacoes dp
    join criadores_desafios d on d.id = dp.desafio_id and d.is_deleted = false and d.recompensa is not null
    join criadores_membros m on m.id = dp.membro_id
    join usuarios u on u.id = m.usuario_id
    left join usuarios ue on ue.id = dp.recompensa_entregue_por
    where dp.criador_id = ${criadorId}::uuid and dp.is_deleted = false and dp.concluido_em is not null
    order by dp.recompensa_entregue_em is not null, coalesce(dp.recompensa_entregue_em, dp.concluido_em), dp.id
    limit 500
  `);
  return rows.map((r) => ({
    participacaoId: r.id, desafioId: r.desafio_id, desafio: r.titulo, recompensa: r.recompensa, nome: r.nome, email: r.email, imagem: r.imagem,
    concluidoEm: data(r.concluido_em), entregueEm: dataOuNula(r.recompensa_entregue_em), entreguePor: r.por, versao: data(r.updated_at),
  }));
}

export interface AlunoComPontos {
  membroId: string;
  nome: string;
  email: string;
  imagem: string | null;
  inativo: boolean;
  pontos: number;
  nivel: string;
  ultimoLancamento: Date | null;
}

/** Aba Membros > Gamificação: ALUNOS vivos com saldo (soma do razão) e nível; maior saldo primeiro. */
export async function alunosComPontos(criadorId: string, f: { busca?: string; pagina: number; porPagina: number }) {
  const busca = f.busca ? sql`and (u.nome ilike ${curinga(f.busca)} or u.email ilike ${curinga(f.busca)})` : sql``;
  const onde = sql`where m.criador_id = ${criadorId}::uuid and m.is_deleted = false and m.papel = 'ALUNO' ${busca}`;
  const [config, total, { rows }] = await Promise.all([
    configDaGamificacao(criadorId),
    db.execute<{ n: number }>(sql`select count(*)::int as n from criadores_membros m join usuarios u on u.id = m.usuario_id and u.is_deleted = false ${onde}`),
    db.execute<Record<string, unknown> & { id: string; nome: string; email: string; imagem: string | null; status: string; pontos: number; ultimo: string | null }>(sql`
      select m.id, u.nome, u.email, u.imagem, m.status, coalesce(p.pontos, 0)::int as pontos, p.ultimo
      from criadores_membros m join usuarios u on u.id = m.usuario_id and u.is_deleted = false
      left join lateral (select sum(x.pontos) as pontos, max(x.ocorrido_em) as ultimo from criadores_membros_pontos x where x.membro_id = m.id) p on true
      ${onde}
      order by coalesce(p.pontos, 0) desc, lower(u.nome), m.id
      limit ${f.porPagina} offset ${(f.pagina - 1) * f.porPagina}
    `),
  ]);
  const linhas: AlunoComPontos[] = rows.map((r) => ({
    membroId: r.id, nome: r.nome, email: r.email, imagem: r.imagem, inativo: r.status !== "ATIVO", pontos: r.pontos,
    nivel: nivelDoMembro(r.pontos, config.niveis).atual.nome, ultimoLancamento: dataOuNula(r.ultimo),
  }));
  return { total: total.rows[0]?.n ?? 0, linhas, ligada: config.ligada };
}
