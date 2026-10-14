import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { alias, type SelectedFields } from "drizzle-orm/pg-core";
import { ROTULO_TIPO_PRODUTO } from "@/lib/catalogo/regras";
import { db } from "@/lib/db";
import type { TipoProduto } from "@/lib/db/schema/_enums";
import {
  arquivos,
  criadores_membros_favoritos as fav,
  produtos,
  produtos_certificados,
  produtos_matriculas,
  produtos_modulos,
  produtos_modulos_aulas,
  produtos_modulos_aulas_progressos as pr,
  produtos_modulos_aulas_visualizacoes as vis,
  usuarios,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { dataEmBrasilia } from "@/lib/matriculas/regras";
import { FAIXA_CONTINUAR } from "./regras";
import { aulaNaVitrine, chaveViva, hrefDaAula, hrefDoCurso, matriculaValendoSql, numeroDaAula, numeroDoModulo, type QuemPede, subtituloDaAula } from "./visao";

/**
 * LEITURAS da vitrine e do perfil do aluno (SISTEMA.md §6). Todas filtram o criador do HOST,
 * os vivos e, para o ALUNO, a matrícula valendo. Imagens saem como `imagemChave`; a página
 * assina com `comImagens(criadorId, itens)` (visao.ts), que devolve o formato do `ItemFileira`.
 * Página do curso e player: consultas-curso.ts (reexportadas aqui).
 */

export { aulaParaPlayer, cursoDoAluno } from "./consultas-curso";
export { comImagens, estaNaLista, type QuemPede } from "./visao";

/** Cartão de fileira (forma do `ItemFileira` de src/components/vitrine/tipos.ts, com a imagem ainda como chave). */
export interface ItemCartao {
  id: string;
  /** TRILHA: fileira "Trilhas para você" (`trilhasParaVitrine`, src/lib/trilhas/consultas.ts). */
  tipo: "AULA" | "PRODUTO" | "TRILHA";
  titulo: string;
  subtitulo: string;
  imagemChave: string | null;
  href: string;
}

const thumb = alias(arquivos, "thumb");
const capa16x9 = alias(arquivos, "capa_16x9");
const capa3x4 = alias(arquivos, "capa_3x4");
const DIA_MS = 86_400_000;

/** Campos de um cartão de AULA (imagem: thumb da aula, senão a capa 16:9 do curso). */
const camposAula = {
  id: produtos_modulos_aulas.id,
  titulo: produtos_modulos_aulas.titulo,
  produtoTitulo: produtos.titulo,
  modulo: numeroDoModulo,
  aula: numeroDaAula,
  thumbChave: chaveViva(thumb),
  capaChave: chaveViva(capa16x9),
  criadaEm: produtos_modulos_aulas.created_at,
};

/** Aulas com módulo, produto e imagens ligados; `extra` = colunas a mais (de tabela juntada depois). */
const deAulas = <E extends SelectedFields>(extra: E) =>
  db
    .select({ ...camposAula, ...extra })
    .from(produtos_modulos_aulas)
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
    .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id))
    .leftJoin(thumb, eq(thumb.id, produtos_modulos_aulas.thumb_arquivo_id))
    .leftJoin(capa16x9, eq(capa16x9.id, produtos.capa_16x9_arquivo_id));

const cartaoDeAula = (a: { id: string; titulo: string; modulo: number; aula: number; thumbChave: string | null; capaChave: string | null }): ItemCartao => ({
  id: a.id,
  tipo: "AULA",
  titulo: a.titulo,
  subtitulo: subtituloDaAula(a.modulo, a.aula),
  imagemChave: a.thumbChave ?? a.capaChave,
  href: hrefDaAula(a.id),
});

const cartaoDeProduto = (p: { id: string; titulo: string; slug: string; tipo: TipoProduto; capaChave: string | null }): ItemCartao => ({
  id: p.id,
  tipo: "PRODUTO",
  titulo: p.titulo,
  subtitulo: ROTULO_TIPO_PRODUTO[p.tipo],
  imagemChave: p.capaChave,
  href: hrefDoCurso(p.slug),
});

/**
 * CONTINUAR: aulas com 1% a 94% assistido, mais recentes primeiro. Fica de fora a aula concluída
 * pelo BOTÃO (o aluno disse que terminou) e a que deixou de abrir (matrícula, rascunho, liberação).
 */
export async function continuarAssistindo(q: QuemPede, limite = 10, agora = new Date()): Promise<(ItemCartao & { progresso: number; produtoTitulo: string })[]> {
  if (!q.membro.id) return [];
  const linhas = await deAulas({ percentual: pr.percentual })
    .innerJoin(pr, and(eq(pr.aula_id, produtos_modulos_aulas.id), eq(pr.membro_id, q.membro.id), vivos(pr)))
    .where(
      and(
        aulaNaVitrine(q.criador.id, agora),
        matriculaValendoSql(q, agora),
        sql`${pr.percentual} between ${FAIXA_CONTINUAR.min} and ${FAIXA_CONTINUAR.max}`,
        sql`${pr.concluida_por} is distinct from 'MANUAL'`,
      ),
    )
    .orderBy(desc(pr.updated_at))
    .limit(limite);
  return linhas.map((a) => ({ ...cartaoDeAula(a), progresso: a.percentual, produtoTitulo: a.produtoTitulo }));
}

/**
 * TOP 10 SEM cache: aulas mais vistas nos últimos 7 dias (hoje incluso, calendário de Brasília),
 * só do catálogo PUBLICADO e já liberado. Visualização = membro distinto por aula e dia (ADR-0006).
 * As telas usam `top10` (top10.ts, cacheado por criador); esta é a consulta e o teste.
 */
export async function top10Agora(criadorId: string, limite = 10, agora = new Date()): Promise<(ItemCartao & { posicao: number; visualizacoes: number })[]> {
  const desde = dataEmBrasilia(new Date(agora.getTime() - 6 * DIA_MS));
  const total = sql<number>`sum(${vis.visualizacoes})::int`;
  const linhas = await db
    .select({ ...camposAula, posterChave: chaveViva(capa3x4), total })
    .from(vis)
    .innerJoin(produtos_modulos_aulas, eq(produtos_modulos_aulas.id, vis.aula_id))
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
    .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id))
    .leftJoin(thumb, eq(thumb.id, produtos_modulos_aulas.thumb_arquivo_id))
    .leftJoin(capa16x9, eq(capa16x9.id, produtos.capa_16x9_arquivo_id))
    .leftJoin(capa3x4, eq(capa3x4.id, produtos.capa_3x4_arquivo_id))
    .where(and(eq(vis.criador_id, criadorId), vivos(vis), gte(vis.dia, desde), aulaNaVitrine(criadorId, agora, sql`${produtos.status} = 'PUBLICADO'`)))
    .groupBy(produtos_modulos_aulas.id, produtos_modulos.id, produtos.id, thumb.id, capa16x9.id, capa3x4.id)
    .orderBy(desc(total), asc(produtos_modulos_aulas.titulo))
    .limit(limite);
  // Cartão estreito (pôster): capa 3:4 do curso, senão a thumb.
  return linhas.map((a, i) => ({ ...cartaoDeAula(a), imagemChave: a.posterChave ?? a.thumbChave ?? a.capaChave, posicao: i + 1, visualizacoes: a.total }));
}

/**
 * NOVIDADES (selo "Novo"): cursos publicados pela primeira vez nos últimos 30 dias (todos os
 * membros veem: é vitrine) + aulas criadas nos últimos 30 dias em cursos JÁ publicados antes
 * (aluno: só dos cursos em que tem matrícula valendo). Mais novos primeiro.
 */
export async function novidades(q: QuemPede, limite = 10, agora = new Date()): Promise<(ItemCartao & { publicadoEm: Date })[]> {
  const desde = new Date(agora.getTime() - 30 * DIA_MS);
  const cursos = await db
    .select({ id: produtos.id, titulo: produtos.titulo, slug: produtos.slug, tipo: produtos.tipo, capaChave: chaveViva(capa16x9), publicadoEm: produtos.publicado_em })
    .from(produtos)
    .leftJoin(capa16x9, eq(capa16x9.id, produtos.capa_16x9_arquivo_id))
    .where(and(eq(produtos.criador_id, q.criador.id), vivos(produtos), eq(produtos.status, "PUBLICADO"), gte(produtos.publicado_em, desde)))
    .orderBy(desc(produtos.publicado_em))
    .limit(limite);
  const aulas = await deAulas({})
    .where(
      and(
        aulaNaVitrine(q.criador.id, agora),
        matriculaValendoSql(q, agora),
        gte(produtos_modulos_aulas.created_at, desde),
        sql`${produtos.publicado_em} < ${produtos_modulos_aulas.created_at}`,
      ),
    )
    .orderBy(desc(produtos_modulos_aulas.created_at))
    .limit(limite);
  return [
    ...cursos.map((c) => ({ ...cartaoDeProduto(c), publicadoEm: c.publicadoEm! })),
    ...aulas.map((a) => ({ ...cartaoDeAula(a), publicadoEm: a.criadaEm })),
  ]
    .sort((x, y) => y.publicadoEm.getTime() - x.publicadoEm.getTime())
    .slice(0, limite);
}

/** LISTA ("Minha lista"): cursos e aulas favoritados que ainda aparecem, último favoritado primeiro. */
export async function minhaLista(q: QuemPede, agora = new Date()): Promise<(ItemCartao & { favoritadoEm: Date })[]> {
  if (!q.membro.id) return [];
  const doMembro = and(eq(fav.membro_id, q.membro.id), eq(fav.criador_id, q.criador.id), vivos(fav));
  const cursos = await db
    .select({ id: produtos.id, titulo: produtos.titulo, slug: produtos.slug, tipo: produtos.tipo, capaChave: chaveViva(capa16x9), em: fav.updated_at })
    .from(fav)
    .innerJoin(produtos, eq(produtos.id, fav.produto_id))
    .leftJoin(capa16x9, eq(capa16x9.id, produtos.capa_16x9_arquivo_id))
    .where(and(doMembro, vivos(produtos), sql`${produtos.status} <> 'RASCUNHO'`));
  const aulas = await deAulas({ em: fav.updated_at })
    .innerJoin(fav, eq(fav.aula_id, produtos_modulos_aulas.id))
    .where(and(doMembro, aulaNaVitrine(q.criador.id, agora)));
  return [...cursos.map((c) => ({ ...cartaoDeProduto(c), favoritadoEm: c.em })), ...aulas.map((a) => ({ ...cartaoDeAula(a), favoritadoEm: a.em }))].sort(
    (x, y) => y.favoritadoEm.getTime() - x.favoritadoEm.getTime(),
  );
}

/** MENTORIAS: produtos tipo MENTORIA publicados (vitrine), mais recentes primeiro, com "matriculado". */
export async function mentorias(q: QuemPede, limite = 10, agora = new Date()): Promise<(ItemCartao & { matriculado: boolean })[]> {
  const linhas = await db
    .select({ id: produtos.id, titulo: produtos.titulo, slug: produtos.slug, tipo: produtos.tipo, capaChave: chaveViva(capa16x9), matriculado: matriculaValendoSql(q, agora) })
    .from(produtos)
    .leftJoin(capa16x9, eq(capa16x9.id, produtos.capa_16x9_arquivo_id))
    .where(and(eq(produtos.criador_id, q.criador.id), vivos(produtos), eq(produtos.status, "PUBLICADO"), eq(produtos.tipo, "MENTORIA")))
    .orderBy(desc(produtos.publicado_em), asc(produtos.titulo))
    .limit(limite);
  return linhas.map((p) => ({ ...cartaoDeProduto(p), matriculado: p.matriculado }));
}

/**
 * Fileira MANUAL do construtor (passo 9): os itens escolhidos, NA ORDEM escolhida, só o que quem
 * pede pode ver — curso fora de rascunho; aula pelas mesmas regras da vitrine (publicada, liberada
 * e, para o ALUNO, com matrícula valendo). Item removido ou de outro criador some.
 */
export async function cartoesEscolhidos(q: QuemPede, itens: readonly { tipo: "PRODUTO" | "AULA"; id: string }[], agora = new Date()): Promise<ItemCartao[]> {
  const ids = (t: "PRODUTO" | "AULA") => itens.filter((i) => i.tipo === t).map((i) => i.id);
  const [cursos, aulas] = await Promise.all([
    ids("PRODUTO").length
      ? db
          .select({ id: produtos.id, titulo: produtos.titulo, slug: produtos.slug, tipo: produtos.tipo, capaChave: chaveViva(capa16x9) })
          .from(produtos)
          .leftJoin(capa16x9, eq(capa16x9.id, produtos.capa_16x9_arquivo_id))
          .where(and(eq(produtos.criador_id, q.criador.id), vivos(produtos), sql`${produtos.status} <> 'RASCUNHO'`, inArray(produtos.id, ids("PRODUTO"))))
      : [],
    ids("AULA").length ? deAulas({}).where(and(aulaNaVitrine(q.criador.id, agora), matriculaValendoSql(q, agora), inArray(produtos_modulos_aulas.id, ids("AULA")))) : [],
  ]);
  const porId = new Map<string, ItemCartao>([...cursos.map((c) => [c.id, cartaoDeProduto(c)] as const), ...aulas.map((a) => [a.id, cartaoDeAula(a)] as const)]);
  return itens.flatMap((i) => porId.get(i.id) ?? []);
}

/** Visualizações (membro distinto por aula e dia, ADR-0006) por produto nos últimos `dias`. */
export async function visualizacoesPorProduto(criadorId: string, dias = 30, agora = new Date()): Promise<Map<string, number>> {
  const desde = dataEmBrasilia(new Date(agora.getTime() - (dias - 1) * DIA_MS));
  const linhas = await db
    .select({ produtoId: produtos_modulos.produto_id, total: sql<number>`sum(${vis.visualizacoes})::int` })
    .from(vis)
    .innerJoin(produtos_modulos_aulas, eq(produtos_modulos_aulas.id, vis.aula_id))
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
    .where(and(eq(vis.criador_id, criadorId), vivos(vis), gte(vis.dia, desde)))
    .groupBy(produtos_modulos.produto_id);
  return new Map(linhas.map((l) => [l.produtoId, l.total]));
}

export interface ProgressoDoCurso {
  concluidas: number;
  /** Aulas vivas de módulos PUBLICADOS. */
  total: number;
  /** 0 a 100, inteiro. */
  percentual: number;
}

/** Progresso de vários cursos de uma vez (cartões de /continuar e do perfil). Sem linha = 0 de 0. */
export async function progressoDosCursos(q: QuemPede, produtoIds: readonly string[]): Promise<Map<string, ProgressoDoCurso>> {
  if (produtoIds.length === 0) return new Map();
  const membro = q.membro.id;
  const linhas = await db
    .select({
      produtoId: produtos_modulos.produto_id,
      total: sql<number>`count(*)::int`,
      concluidas: membro
        ? sql<number>`count(*) filter (where exists (select 1 from ${pr} where ${pr.aula_id} = ${produtos_modulos_aulas.id}
            and ${pr.membro_id} = ${membro} and ${pr.concluida} and ${pr.is_deleted} = false))::int`
        : sql<number>`0`,
    })
    .from(produtos_modulos_aulas)
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
    .where(
      and(
        eq(produtos_modulos.criador_id, q.criador.id),
        inArray(produtos_modulos.produto_id, [...produtoIds]),
        vivos(produtos_modulos),
        vivos(produtos_modulos_aulas),
        eq(produtos_modulos.status, "PUBLICADO"),
      ),
    )
    .groupBy(produtos_modulos.produto_id);
  return new Map(linhas.map((l) => [l.produtoId, { total: l.total, concluidas: l.concluidas, percentual: l.total ? Math.floor((l.concluidas * 100) / l.total) : 0 }]));
}

export async function progressoDoCurso(q: QuemPede, produtoId: string): Promise<ProgressoDoCurso> {
  return (await progressoDosCursos(q, [produtoId])).get(produtoId) ?? { concluidas: 0, total: 0, percentual: 0 };
}

/** Números do perfil. Pontos chegam no passo 11 (zero até lá). */
export async function numerosDoPerfil(q: QuemPede) {
  if (!q.membro.id) return { aulasConcluidas: 0, segundosAssistidos: 0, cursosConcluidos: 0, certificados: 0, pontos: 0 };
  const [p] = await db
    .select({
      aulasConcluidas: sql<number>`count(*) filter (where ${pr.concluida})::int`,
      segundosAssistidos: sql<number>`coalesce(sum(${pr.segundos_assistidos}), 0)::int`,
    })
    .from(pr)
    .innerJoin(produtos_modulos_aulas, eq(produtos_modulos_aulas.id, pr.aula_id))
    .where(and(eq(pr.membro_id, q.membro.id), eq(pr.criador_id, q.criador.id), vivos(pr), vivos(produtos_modulos_aulas)));
  const [c] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(produtos_matriculas)
    .where(and(eq(produtos_matriculas.membro_id, q.membro.id), eq(produtos_matriculas.criador_id, q.criador.id), vivos(produtos_matriculas), isNotNull(produtos_matriculas.concluida_em)));
  // Passo 7: certificados EMITIDOS (revogado não conta).
  const [cert] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(produtos_certificados)
    .where(and(eq(produtos_certificados.membro_id, q.membro.id), eq(produtos_certificados.criador_id, q.criador.id), vivos(produtos_certificados), eq(produtos_certificados.situacao, "EMITIDO")));
  return { aulasConcluidas: p?.aulasConcluidas ?? 0, segundosAssistidos: p?.segundosAssistidos ?? 0, cursosConcluidos: c?.n ?? 0, certificados: cert?.n ?? 0, pontos: 0 };
}

/** Preferências da pessoa (Perfil e player). */
export async function preferenciasDoAluno(usuarioId: string): Promise<{ reproducaoAutomatica: boolean; lembretes: boolean }> {
  const [u] = await db.select({ reproducaoAutomatica: usuarios.reproducao_automatica, lembretes: usuarios.lembretes }).from(usuarios).where(eq(usuarios.id, usuarioId));
  return u ?? { reproducaoAutomatica: true, lembretes: true };
}
