import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { situacoesDoMembro, type SituacaoAvaliacao } from "@/lib/avaliacoes/situacao";
import { ROTULO_TIPO_AVALIACAO } from "@/lib/avaliacoes/regras";
import { db } from "@/lib/db";
import type { StatusProduto, StatusTrilha, TipoItemTrilha } from "@/lib/db/schema/_enums";
import { arquivos, criadores_trilhas as trilhas, criadores_trilhas_itens as itens, produtos, produtos_avaliacoes } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import type { ItemCartao } from "@/lib/progresso/consultas";
import { chaveViva, type QuemPede } from "@/lib/progresso/visao";
import { ctaDaTrilha, estadosDaTrilha, indiceDoProximoPasso, TEXTO_MOTIVO_ITEM, textoEtapas, type DadosItemTrilha, type EstadoItemTrilha, type MotivoItemTrilha } from "./regras";

/**
 * LEITURAS das trilhas (tela 7, vitrine "Trilhas para você", admin). Estado de cada item pela
 * regra pura (regras.ts): produto concluído = matrícula concluída; avaliação = aprovada.
 * ALUNO vê a trilha PUBLICADA se tiver matrícula valendo em ao menos 1 curso dela (os itens sem
 * matrícula aparecem com "Matricule-se"). Equipe vê todas as publicadas.
 */

const capa = alias(arquivos, "capa_trilha");

export interface ItemTrilhaAluno {
  id: string;
  /** 1..N (passo numerado). */
  numero: number;
  tipo: TipoItemTrilha;
  titulo: string;
  /** "Curso" | "Quiz · Curso X" ... */
  subtitulo: string;
  href: string;
  exigeAnterior: boolean;
  estado: EstadoItemTrilha;
  motivo: MotivoItemTrilha | null;
  /** "Conclua a etapa anterior", "Matricule-se"... */
  textoMotivo: string | null;
  /** Produto: % das aulas concluídas; avaliação: melhor nota (ou null). */
  percentual: number | null;
  /** Produto: soma das aulas publicadas. */
  duracaoSeg: number;
}

export interface TrilhaDoAluno {
  id: string;
  titulo: string;
  descricao: string;
  tag: string;
  capaChave: string | null;
  etapas: number;
  concluidas: number;
  percentual: number;
  /** "3 de 5 etapas". */
  textoEtapas: string;
  duracaoSeg: number;
  cta: "Iniciar" | "Continuar" | "Rever";
  proximoPasso: { itemId: string; titulo: string; href: string; estado: EstadoItemTrilha; textoMotivo: string | null } | null;
  itens: ItemTrilhaAluno[];
}

async function carregar(q: QuemPede, filtro: { trilhaId?: string }, agora: Date): Promise<TrilhaDoAluno[]> {
  const ts = await db
    .select({ id: trilhas.id, titulo: trilhas.titulo, descricao: trilhas.descricao, tag: trilhas.tag, capaChave: chaveViva(capa), publicadaEm: trilhas.publicada_em })
    .from(trilhas)
    .leftJoin(capa, eq(capa.id, trilhas.capa_arquivo_id))
    .where(and(eq(trilhas.criador_id, q.criador.id), vivos(trilhas), eq(trilhas.status, "PUBLICADA"), filtro.trilhaId ? eq(trilhas.id, filtro.trilhaId) : undefined))
    .orderBy(desc(trilhas.publicada_em), asc(trilhas.titulo));
  if (!ts.length) return [];
  const m = q.membro.id;
  const doMembro = (t: string) => (m ? sql`${sql.raw(t)}.membro_id = ${m}::uuid` : sql`false`);
  const linhas = await db
    .select({
      id: itens.id,
      trilhaId: itens.trilha_id,
      tipo: itens.tipo,
      exigeAnterior: itens.exige_anterior,
      produtoId: produtos.id,
      produtoTitulo: produtos.titulo,
      produtoSlug: produtos.slug,
      produtoStatus: sql<StatusProduto | null>`${produtos.status}`,
      avaliacaoId: itens.avaliacao_id,
      matriculaValendo: sql<boolean>`exists (select 1 from produtos_matriculas pm where ${doMembro("pm")} and pm.produto_id = ${produtos.id}
        and pm.is_deleted = false and pm.status = 'ATIVA' and (pm.expira_em is null or pm.expira_em > ${agora}))`,
      concluido: sql<boolean>`exists (select 1 from produtos_matriculas pm where ${doMembro("pm")} and pm.produto_id = ${produtos.id}
        and pm.is_deleted = false and pm.status <> 'CANCELADA' and pm.concluida_em is not null)`,
      aulas: sql<number>`(select count(*)::int from produtos_modulos_aulas a join produtos_modulos mo on mo.id = a.modulo_id
        where mo.produto_id = ${produtos.id} and mo.status = 'PUBLICADO' and mo.is_deleted = false and a.is_deleted = false)`,
      concluidas: sql<number>`(select count(*)::int from produtos_modulos_aulas a join produtos_modulos mo on mo.id = a.modulo_id
        where mo.produto_id = ${produtos.id} and mo.status = 'PUBLICADO' and mo.is_deleted = false and a.is_deleted = false
          and exists (select 1 from produtos_modulos_aulas_progressos pr where pr.aula_id = a.id and ${doMembro("pr")} and pr.concluida and pr.is_deleted = false))`,
      duracaoSeg: sql<number>`(select coalesce(sum(a.duracao_seg), 0)::int from produtos_modulos_aulas a join produtos_modulos mo on mo.id = a.modulo_id
        where mo.produto_id = ${produtos.id} and mo.status = 'PUBLICADO' and mo.is_deleted = false and a.is_deleted = false)`,
    })
    .from(itens)
    .leftJoin(produtos, and(eq(produtos.id, itens.produto_id), vivos(produtos)))
    .leftJoin(produtos_avaliacoes, and(eq(produtos_avaliacoes.id, itens.avaliacao_id), vivos(produtos_avaliacoes)))
    .where(
      and(
        inArray(
          itens.trilha_id,
          ts.map((t) => t.id),
        ),
        vivos(itens),
        // Alvo removido some da trilha.
        sql`(${produtos.id} is not null or ${produtos_avaliacoes.id} is not null)`,
      ),
    )
    .orderBy(asc(itens.ordem));
  const avIds = linhas.flatMap((l) => (l.avaliacaoId ? [l.avaliacaoId] : []));
  const avs = new Map<string, SituacaoAvaliacao>(
    avIds.length ? (await situacoesDoMembro({ criadorId: q.criador.id, membroId: m, papel: q.membro.papel }, { avaliacaoIds: avIds }, agora)).map((s) => [s.id, s]) : [],
  );
  const ehEquipe = q.membro.papel !== "ALUNO";

  const resultado: TrilhaDoAluno[] = [];
  for (const t of ts) {
    const doTrilha = linhas.filter((l) => l.trilhaId === t.id && (l.produtoId || avs.has(l.avaliacaoId!)));
    const visivel = ehEquipe || doTrilha.some((l) => (l.produtoId ? l.matriculaValendo : avs.get(l.avaliacaoId!)!.matriculaValendo));
    if (!visivel || doTrilha.length === 0) continue;
    const dados: DadosItemTrilha[] = doTrilha.map((l) => {
      if (l.produtoId) {
        const proprio = l.produtoStatus === "RASCUNHO" && !ehEquipe ? "INDISPONIVEL" : !ehEquipe && !l.matriculaValendo ? "MATRICULA" : null;
        return { tipo: "PRODUTO", exigeAnterior: l.exigeAnterior, concluido: l.concluido, iniciado: l.concluidas > 0, motivoProprio: proprio };
      }
      const s = avs.get(l.avaliacaoId!)!;
      return { tipo: "AVALIACAO", exigeAnterior: l.exigeAnterior, concluido: s.aprovada, iniciado: !!s.aberta || s.finalizadas > 0, motivoProprio: s.motivo };
    });
    const estados = estadosDaTrilha(dados);
    const lista: ItemTrilhaAluno[] = doTrilha.map((l, i) => {
      const { estado, motivo } = estados[i];
      const base = { id: l.id, numero: i + 1, tipo: l.tipo, exigeAnterior: l.exigeAnterior, estado, motivo, textoMotivo: motivo ? TEXTO_MOTIVO_ITEM[motivo] : null };
      if (l.produtoId)
        return { ...base, titulo: l.produtoTitulo!, subtitulo: "Curso", href: `/cursos/${l.produtoSlug}`, percentual: l.aulas ? Math.floor((l.concluidas * 100) / l.aulas) : 0, duracaoSeg: l.duracaoSeg };
      const s = avs.get(l.avaliacaoId!)!;
      return { ...base, titulo: s.titulo, subtitulo: `${ROTULO_TIPO_AVALIACAO[s.tipo]} · ${s.produto.titulo}`, href: `/avaliacoes/${s.id}`, percentual: s.melhorNota, duracaoSeg: 0 };
    });
    const concluidas = estados.filter((e) => e.estado === "concluido").length;
    const iProx = indiceDoProximoPasso(estados);
    const prox = iProx >= 0 ? lista[iProx] : null;
    resultado.push({
      id: t.id,
      titulo: t.titulo,
      descricao: t.descricao,
      tag: t.tag,
      capaChave: t.capaChave,
      etapas: lista.length,
      concluidas,
      percentual: Math.floor((concluidas * 100) / lista.length),
      textoEtapas: textoEtapas(concluidas, lista.length),
      duracaoSeg: lista.reduce((s, x) => s + x.duracaoSeg, 0),
      cta: ctaDaTrilha(estados),
      proximoPasso: prox ? { itemId: prox.id, titulo: prox.titulo, href: prox.href, estado: prox.estado, textoMotivo: prox.textoMotivo } : null,
      itens: lista,
    });
  }
  return resultado;
}

/** Tela 7 (lista): trilhas que o membro vê, com itens, progresso e próximo passo. */
export const trilhasDoAluno = (q: QuemPede, agora = new Date()) => carregar(q, {}, agora);

/** Uma trilha (página da trilha). `null` = não existe, rascunho, ou o aluno não tem curso nela. */
export async function trilhaDoAluno(q: QuemPede, trilhaId: string, agora = new Date()): Promise<TrilhaDoAluno | null> {
  return (await carregar(q, { trilhaId }, agora))[0] ?? null;
}

/** Fileira "Trilhas para você" (formato `ItemCartao` + progresso; imagem = capa da trilha). */
export async function trilhasParaVitrine(q: QuemPede, limite = 10, agora = new Date()): Promise<(ItemCartao & { progresso: number })[]> {
  return (await carregar(q, {}, agora)).slice(0, limite).map((t) => ({
    id: t.id,
    tipo: "TRILHA",
    titulo: t.titulo,
    subtitulo: [t.tag, textoEtapas(t.concluidas, t.etapas)].filter(Boolean).join(" · "),
    imagemChave: t.capaChave,
    href: `/trilhas/${t.id}`,
    progresso: t.percentual,
  }));
}

// ------------------------------------------------------------------ admin

export async function trilhasDoAdmin(criadorId: string) {
  const l = await db
    .select({
      id: trilhas.id,
      titulo: trilhas.titulo,
      tag: trilhas.tag,
      status: trilhas.status,
      publicadaEm: trilhas.publicada_em,
      versao: trilhas.updated_at,
      capaChave: chaveViva(capa),
      itens: sql<number>`(select count(*)::int from criadores_trilhas_itens i where i.trilha_id = ${trilhas.id} and i.is_deleted = false)`,
    })
    .from(trilhas)
    .leftJoin(capa, eq(capa.id, trilhas.capa_arquivo_id))
    .where(and(eq(trilhas.criador_id, criadorId), vivos(trilhas)))
    .orderBy(asc(trilhas.titulo));
  return l.map((x) => ({ ...x, versao: x.versao.toISOString() }));
}

/** Editor: campos + versão + itens (com o alvo) + opções para adicionar. `null` = 404. */
export async function trilhaParaEditar(criadorId: string, trilhaId: string) {
  const [t] = await db
    .select({ t: trilhas, capaChave: chaveViva(capa) })
    .from(trilhas)
    .leftJoin(capa, eq(capa.id, trilhas.capa_arquivo_id))
    .where(and(eq(trilhas.id, trilhaId), eq(trilhas.criador_id, criadorId), vivos(trilhas)));
  if (!t) return null;
  const [lista, ps, avs] = await Promise.all([
    db
      .select({
        id: itens.id,
        ordem: itens.ordem,
        tipo: itens.tipo,
        exigeAnterior: itens.exige_anterior,
        versao: itens.updated_at,
        produtoId: itens.produto_id,
        avaliacaoId: itens.avaliacao_id,
        titulo: sql<string>`coalesce(${produtos.titulo}, ${produtos_avaliacoes.titulo})`,
        statusAlvo: sql<string>`coalesce(${produtos.status}, ${produtos_avaliacoes.status})`,
      })
      .from(itens)
      .leftJoin(produtos, eq(produtos.id, itens.produto_id))
      .leftJoin(produtos_avaliacoes, eq(produtos_avaliacoes.id, itens.avaliacao_id))
      .where(and(eq(itens.trilha_id, trilhaId), eq(itens.criador_id, criadorId), vivos(itens)))
      .orderBy(asc(itens.ordem)),
    db
      .select({ id: produtos.id, titulo: produtos.titulo, status: produtos.status })
      .from(produtos)
      .where(and(eq(produtos.criador_id, criadorId), vivos(produtos)))
      .orderBy(asc(produtos.titulo)),
    db
      .select({ id: produtos_avaliacoes.id, titulo: produtos_avaliacoes.titulo, status: produtos_avaliacoes.status, curso: produtos.titulo })
      .from(produtos_avaliacoes)
      .innerJoin(produtos, eq(produtos.id, produtos_avaliacoes.produto_id))
      .where(and(eq(produtos_avaliacoes.criador_id, criadorId), vivos(produtos_avaliacoes), vivos(produtos)))
      .orderBy(asc(produtos.titulo), asc(produtos_avaliacoes.titulo)),
  ]);
  const x = t.t;
  return {
    trilha: {
      id: x.id,
      versao: x.updated_at.toISOString(),
      status: x.status as StatusTrilha,
      publicadaEm: x.publicada_em,
      capaChave: t.capaChave,
      campos: { titulo: x.titulo, descricao: x.descricao, tag: x.tag },
    },
    itens: lista.map((i) => ({ ...i, versao: i.versao.toISOString() })),
    opcoes: { produtos: ps, avaliacoes: avs },
  };
}
