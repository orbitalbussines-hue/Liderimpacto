import "server-only";
import { and, desc, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { criadores_membros, produtos, produtos_modulos, produtos_modulos_aulas, produtos_modulos_aulas_feedbacks as fb, usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

/**
 * Leituras do feedback de conteúdo (RN-202). Aluno: só o PRÓPRIO (`meuFeedback`). Equipe: lista com
 * filtros e resumo por aula. "Média" da aula = % de "útil" entre as avaliações vivas.
 */

export async function meuFeedback(criadorId: string, membroId: string, aulaId: string) {
  const [f] = await db
    .select({ util: fb.util, comentario: fb.comentario, versao: fb.updated_at })
    .from(fb)
    .where(and(eq(fb.criador_id, criadorId), eq(fb.membro_id, membroId), eq(fb.aula_id, aulaId), vivos(fb)));
  return f ?? null;
}

export interface FiltrosFeedbacks {
  produtoId?: string;
  aulaId?: string;
  /** true = só "útil"; false = só "não útil". */
  util?: boolean;
  soComComentario?: boolean;
  pagina: number;
  porPagina: number;
}

/** Aba "Feedbacks de conteúdo": mais recentes primeiro, com aluno, aula e curso. */
export async function feedbacksDoCriador(criadorId: string, f: FiltrosFeedbacks) {
  const condicoes: SQL[] = [eq(fb.criador_id, criadorId), vivos(fb), vivos(produtos_modulos_aulas), vivos(produtos_modulos), vivos(produtos)];
  if (f.produtoId) condicoes.push(eq(produtos.id, f.produtoId));
  if (f.aulaId) condicoes.push(eq(fb.aula_id, f.aulaId));
  if (f.util !== undefined) condicoes.push(eq(fb.util, f.util));
  if (f.soComComentario) condicoes.push(isNotNull(fb.comentario));
  const onde = and(...condicoes);
  const base = () =>
    db
      .select({
        id: fb.id,
        util: fb.util,
        comentario: fb.comentario,
        quando: fb.updated_at,
        aulaId: produtos_modulos_aulas.id,
        aula: produtos_modulos_aulas.titulo,
        produtoId: produtos.id,
        produto: produtos.titulo,
        membroId: criadores_membros.id,
        nome: usuarios.nome,
        email: usuarios.email,
        total: sql<number>`count(*) over ()::int`,
      })
      .from(fb)
      .innerJoin(produtos_modulos_aulas, eq(produtos_modulos_aulas.id, fb.aula_id))
      .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
      .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id))
      .innerJoin(criadores_membros, eq(criadores_membros.id, fb.membro_id))
      .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id));
  const linhas = await base()
    .where(onde)
    .orderBy(desc(fb.updated_at), desc(fb.id))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  return { total: linhas[0]?.total ?? 0, linhas };
}

export interface ResumoFeedbackAula {
  aulaId: string;
  aula: string;
  produtoId: string;
  produto: string;
  avaliacoes: number;
  uteis: number;
  /** 0 a 100 (inteiro). */
  percentualUtil: number;
  comentarios: number;
}

/** Uma linha por aula com avaliação; piores primeiro (o que a equipe precisa olhar). */
export async function resumoFeedbackPorAula(criadorId: string, produtoId?: string): Promise<ResumoFeedbackAula[]> {
  const condicoes: SQL[] = [eq(fb.criador_id, criadorId), vivos(fb), vivos(produtos_modulos_aulas), vivos(produtos_modulos), vivos(produtos)];
  if (produtoId) condicoes.push(eq(produtos.id, produtoId));
  const linhas = await db
    .select({
      aulaId: produtos_modulos_aulas.id,
      aula: produtos_modulos_aulas.titulo,
      produtoId: produtos.id,
      produto: produtos.titulo,
      avaliacoes: sql<number>`count(*)::int`,
      uteis: sql<number>`count(*) filter (where ${fb.util})::int`,
      comentarios: sql<number>`count(${fb.comentario})::int`,
    })
    .from(fb)
    .innerJoin(produtos_modulos_aulas, eq(produtos_modulos_aulas.id, fb.aula_id))
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
    .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id))
    .where(and(...condicoes))
    .groupBy(produtos_modulos_aulas.id, produtos.id);
  return linhas
    .map((l) => ({ ...l, percentualUtil: Math.round((l.uteis * 100) / l.avaliacoes) }))
    .sort((a, b) => a.percentualUtil - b.percentualUtil || b.avaliacoes - a.avaliacoes);
}
