import "server-only";
import { and, asc, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { criadores_grupos, criadores_grupos_membros, produtos, produtos_modulos, produtos_modulos_aulas, produtos_modulos_aulas_anotacoes as nota } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { ehEquipe, type QuemPede } from "./visao";

/**
 * Abas "Anotações" e "Turmas" de Aluno › Continuar (RN-205). Só as do PRÓPRIO membro da sessão
 * (`membroDaPagina(TODOS_OS_MEMBROS)`; nenhum id de pessoa na URL). SUPER_ADMIN sem vínculo = vazio.
 */

/** Todas as anotações do membro, por curso e aula, com o tempo (link `?t=` no player). */
export async function anotacoesDoAluno(q: QuemPede, f: { produtoId?: string; limite?: number } = {}) {
  if (!q.membro.id) return [];
  const condicoes: SQL[] = [
    eq(nota.criador_id, q.criador.id),
    eq(nota.membro_id, q.membro.id),
    vivos(nota),
    vivos(produtos_modulos_aulas),
    vivos(produtos_modulos),
    vivos(produtos),
  ];
  // Curso que voltou a rascunho some para o aluno (a nota continua no banco).
  if (!ehEquipe(q)) condicoes.push(ne(produtos.status, "RASCUNHO"));
  if (f.produtoId) condicoes.push(eq(produtos.id, f.produtoId));
  return db
    .select({
      id: nota.id,
      texto: nota.texto,
      tempoSeg: nota.tempo_seg,
      criadaEm: nota.created_at,
      versao: nota.updated_at,
      aulaId: produtos_modulos_aulas.id,
      aula: produtos_modulos_aulas.titulo,
      produtoId: produtos.id,
      produto: produtos.titulo,
      produtoSlug: produtos.slug,
    })
    .from(nota)
    .innerJoin(produtos_modulos_aulas, eq(produtos_modulos_aulas.id, nota.aula_id))
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
    .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id))
    .where(and(...condicoes))
    .orderBy(asc(produtos.titulo), asc(produtos_modulos.ordem), asc(produtos_modulos_aulas.ordem), asc(nota.tempo_seg))
    .limit(Math.min(f.limite ?? 500, 2000));
}

/** Grupos (turmas e grupos de acesso) em que o membro está, com o tamanho de cada um. */
export async function turmasDoAluno(q: QuemPede) {
  if (!q.membro.id) return [];
  return db
    .select({
      id: criadores_grupos.id,
      nome: criadores_grupos.nome,
      tipo: criadores_grupos.tipo,
      entrouEm: criadores_grupos_membros.created_at,
      membros: sql<number>`(select count(*)::int from criadores_grupos_membros gm join criadores_membros m on m.id = gm.membro_id and m.is_deleted = false
        where gm.grupo_id = "criadores_grupos"."id" and gm.is_deleted = false)`,
    })
    .from(criadores_grupos_membros)
    .innerJoin(criadores_grupos, eq(criadores_grupos.id, criadores_grupos_membros.grupo_id))
    .where(
      and(
        eq(criadores_grupos_membros.criador_id, q.criador.id),
        eq(criadores_grupos_membros.membro_id, q.membro.id),
        vivos(criadores_grupos_membros),
        vivos(criadores_grupos),
      ),
    )
    .orderBy(desc(criadores_grupos.tipo), asc(sql`lower(${criadores_grupos.nome})`));
}
