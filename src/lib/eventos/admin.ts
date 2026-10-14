import "server-only";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import type { PublicoEvento, SituacaoEvento } from "@/lib/db/schema/_enums";
import {
  criadores_eventos as eventos,
  criadores_eventos_grupos as eventosGrupos,
  criadores_eventos_inscricoes as inscricoes,
  criadores_grupos as grupos,
  criadores_membros as membros,
  produtos,
  produtos_modulos as modulos,
  produtos_modulos_aulas as aulas,
  usuarios,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

/**
 * LEITURAS dos eventos para a EQUIPE (DONO/ADMIN; quem chama já passou por `membroDaPagina(EQUIPE)`).
 * Sempre pelo criador do HOST. O link da sala aparece aqui (é a equipe que o cadastra).
 */

export const ABAS_EVENTOS = ["proximos", "passados", "rascunhos", "cancelados"] as const;
export type AbaEventos = (typeof ABAS_EVENTOS)[number];
export const lerAbaEventos = (v: unknown): AbaEventos => (ABAS_EVENTOS as readonly unknown[]).includes(v) ? (v as AbaEventos) : "proximos";

const FIM = sql`(${eventos.inicio_em} + make_interval(mins => ${eventos.duracao_min}))`;

function filtroDaAba(aba: AbaEventos, agora: Date): SQL {
  if (aba === "rascunhos") return sql`${eventos.situacao} = 'RASCUNHO'`;
  if (aba === "cancelados") return sql`${eventos.situacao} = 'CANCELADO'`;
  return aba === "proximos" ? sql`${eventos.situacao} = 'PUBLICADO' and ${FIM} > ${agora}` : sql`${eventos.situacao} = 'PUBLICADO' and ${FIM} <= ${agora}`;
}

export interface EventoDoAdmin {
  id: string;
  titulo: string;
  inicioEm: Date;
  duracaoMin: number;
  situacao: SituacaoEvento;
  publico: PublicoEvento;
  produtoTitulo: string | null;
  grupos: number;
  inscritos: number;
  versao: string;
}

/** Lista de uma aba: próximos (mais cedo primeiro) e as demais (mais recente primeiro). */
export async function eventosDoAdmin(criadorId: string, aba: AbaEventos, agora: Date, busca = ""): Promise<EventoDoAdmin[]> {
  const termo = busca.trim();
  const l = await db
    .select({
      id: eventos.id,
      titulo: eventos.titulo,
      inicioEm: eventos.inicio_em,
      duracaoMin: eventos.duracao_min,
      situacao: eventos.situacao,
      publico: eventos.publico,
      produtoTitulo: produtos.titulo,
      grupos: sql<number>`(select count(*)::int from criadores_eventos_grupos g where g.evento_id = "criadores_eventos"."id" and g.is_deleted = false)`,
      inscritos: sql<number>`(select count(*)::int from criadores_eventos_inscricoes i where i.evento_id = "criadores_eventos"."id" and i.is_deleted = false)`,
      versao: eventos.updated_at,
    })
    .from(eventos)
    .leftJoin(produtos, eq(produtos.id, eventos.produto_id))
    .where(and(eq(eventos.criador_id, criadorId), vivos(eventos), filtroDaAba(aba, agora), termo ? sql`${eventos.titulo} ilike ${`%${termo.replace(/[\\%_]/g, "\\$&")}%`}` : undefined))
    .orderBy(aba === "proximos" ? asc(eventos.inicio_em) : sql`${eventos.inicio_em} desc`)
    .limit(200);
  return l.map((e) => ({ ...e, versao: e.versao.toISOString() }));
}

/** Quantos em cada aba (estatística e rótulos das abas). */
export async function contagemDosEventos(criadorId: string, agora: Date): Promise<Record<AbaEventos, number>> {
  const [c] = await db
    .select({
      proximos: sql<number>`count(*) filter (where ${filtroDaAba("proximos", agora)})::int`,
      passados: sql<number>`count(*) filter (where ${filtroDaAba("passados", agora)})::int`,
      rascunhos: sql<number>`count(*) filter (where ${filtroDaAba("rascunhos", agora)})::int`,
      cancelados: sql<number>`count(*) filter (where ${filtroDaAba("cancelados", agora)})::int`,
    })
    .from(eventos)
    .where(and(eq(eventos.criador_id, criadorId), vivos(eventos)));
  return c;
}

/** Evento para o formulário (null = não existe nesta área). */
export async function eventoParaEditar(criadorId: string, eventoId: string) {
  const [e] = await db
    .select()
    .from(eventos)
    .where(and(eq(eventos.id, eventoId), eq(eventos.criador_id, criadorId), vivos(eventos)));
  if (!e) return null;
  const gs = await db
    .select({ id: eventosGrupos.grupo_id })
    .from(eventosGrupos)
    .where(and(eq(eventosGrupos.evento_id, e.id), vivos(eventosGrupos)));
  return {
    id: e.id,
    titulo: e.titulo,
    descricao: e.descricao,
    inicioEm: e.inicio_em,
    duracaoMin: e.duracao_min,
    link: e.link_acesso,
    situacao: e.situacao,
    publico: e.publico,
    produtoId: e.produto_id,
    grupoIds: gs.map((g) => g.id),
    gravacaoAulaId: e.gravacao_aula_id,
    publicadoEm: e.publicado_em,
    canceladoEm: e.cancelado_em,
    versao: e.updated_at.toISOString(),
  };
}

export type EventoParaEditar = NonNullable<Awaited<ReturnType<typeof eventoParaEditar>>>;

/** Quem confirmou presença (vivas), na ordem da confirmação. */
export async function inscritosDoEvento(criadorId: string, eventoId: string) {
  return db
    .select({ id: inscricoes.id, nome: usuarios.nome, email: usuarios.email, imagem: usuarios.imagem, confirmadoEm: inscricoes.created_at })
    .from(inscricoes)
    .innerJoin(membros, eq(membros.id, inscricoes.membro_id))
    .innerJoin(usuarios, eq(usuarios.id, membros.usuario_id))
    .where(and(eq(inscricoes.evento_id, eventoId), eq(inscricoes.criador_id, criadorId), vivos(inscricoes)))
    .orderBy(asc(inscricoes.created_at));
}

/** Escolhas do formulário: cursos (público PRODUTO), grupos (GRUPOS) e aulas (gravação), todos desta área. */
export async function opcoesDoEvento(criadorId: string) {
  const [cursos, gs, as] = await Promise.all([
    db
      .select({ id: produtos.id, titulo: produtos.titulo })
      .from(produtos)
      .where(and(eq(produtos.criador_id, criadorId), vivos(produtos)))
      .orderBy(asc(sql`lower(${produtos.titulo})`)),
    db
      .select({ id: grupos.id, nome: grupos.nome })
      .from(grupos)
      .where(and(eq(grupos.criador_id, criadorId), vivos(grupos)))
      .orderBy(asc(sql`lower(${grupos.nome})`)),
    db
      .select({ id: aulas.id, titulo: aulas.titulo, curso: produtos.titulo })
      .from(aulas)
      .innerJoin(modulos, and(eq(modulos.id, aulas.modulo_id), vivos(modulos)))
      .innerJoin(produtos, and(eq(produtos.id, modulos.produto_id), vivos(produtos)))
      .where(and(eq(aulas.criador_id, criadorId), vivos(aulas)))
      .orderBy(asc(sql`lower(${produtos.titulo})`), asc(modulos.ordem), asc(aulas.ordem)),
  ]);
  return { cursos, grupos: gs, aulas: as };
}
