import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  criadores_funis as funis,
  criadores_leads as leads,
  criadores_ofertas as ofertas,
  criadores_paginas as paginas,
  criadores_paginas_checkouts as checkouts,
  criadores_paginas_visitas as visitas,
  criadores_tags as tags,
  criadores_vendas as vendas,
  produtos,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { hashDoDestinatario } from "@/lib/email/disparos";
import { descadastradosEntre } from "@/lib/marketing/publico";
import { configPaginaSchema, referenciasDaConfig, type ConfigPagina } from "./config";
import { conversoes, type NumerosEtapa } from "./metricas";
import { urlDaImagemDaPagina } from "./publico";

/** LEITURAS das telas de Páginas, Leads e Funis (DONO e ADMIN; a página confere o papel). */

// Subconsulta correlacionada: o nome da tabela vai por extenso (o Drizzle escreve só "id" no select).
const desdeDia = (dias: number) => sql`((now() at time zone 'America/Sao_Paulo')::date - ${dias - 1}::int)`;
const desdeInstante = (dias: number) => sql`(${desdeDia(dias)}::timestamp at time zone 'America/Sao_Paulo')`;

export async function listarPaginas(criadorId: string) {
  const linhas = await db
    .select({
      id: paginas.id,
      titulo: paginas.titulo,
      slug: paginas.slug,
      modelo: paginas.modelo,
      situacao: paginas.situacao,
      publicacoes: paginas.publicacoes,
      publicadaEm: paginas.publicada_em,
      atualizadaEm: paginas.updated_at,
      alterada: sql<boolean>`${paginas.publicada} is distinct from ${paginas.rascunho}`,
      visitas: sql<number>`(select coalesce(sum(v.visitas), 0)::int from criadores_paginas_visitas v where v.pagina_id = criadores_paginas.id and v.dia >= ${desdeDia(30)})`,
      leads: sql<number>`(select count(*)::int from criadores_leads l where l.pagina_id = criadores_paginas.id and l.is_deleted = false)`,
    })
    .from(paginas)
    .where(and(eq(paginas.criador_id, criadorId), vivos(paginas)))
    .orderBy(desc(paginas.updated_at));
  return linhas.map((l) => ({ ...l, versao: l.atualizadaEm.toISOString() }));
}

/** Opções do editor: cursos, ofertas e tags DESTE criador. */
export async function opcoesDoEditor(criadorId: string) {
  const [cursos, listaOfertas, listaTags] = await Promise.all([
    db.select({ id: produtos.id, titulo: produtos.titulo }).from(produtos).where(and(eq(produtos.criador_id, criadorId), vivos(produtos))).orderBy(asc(produtos.titulo)),
    db
      .select({ id: ofertas.id, nome: ofertas.nome, precoCentavos: ofertas.preco_centavos, tipo: ofertas.tipo, intervalo: ofertas.intervalo, situacao: ofertas.situacao })
      .from(ofertas)
      .where(and(eq(ofertas.criador_id, criadorId), vivos(ofertas)))
      .orderBy(asc(ofertas.nome)),
    db.select({ id: tags.id, nome: tags.nome }).from(tags).where(and(eq(tags.criador_id, criadorId), vivos(tags))).orderBy(asc(tags.nome)),
  ]);
  return { cursos, ofertas: listaOfertas, tags: listaTags };
}

export async function paginaParaEditar(criadorId: string, paginaId: string) {
  const [p] = await db.select().from(paginas).where(and(eq(paginas.id, paginaId), eq(paginas.criador_id, criadorId), vivos(paginas)));
  if (!p) return null;
  const rascunho: ConfigPagina = configPaginaSchema.parse(p.rascunho);
  const ids = referenciasDaConfig(rascunho).imagens;
  const imagens = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await urlDaImagemDaPagina(criadorId, id)] as const)));
  return {
    id: p.id,
    titulo: p.titulo,
    slug: p.slug,
    modelo: p.modelo,
    situacao: p.situacao,
    rascunho,
    publicada: p.publicada ? configPaginaSchema.safeParse(p.publicada).data ?? null : null,
    publicacoes: p.publicacoes,
    publicadaEm: p.publicada_em,
    versao: p.updated_at.toISOString(),
    imagens,
  };
}

export const POR_PAGINA_LEADS = 50;

/** Lista da tela (50 por página) e a exportação CSV (`porPagina` maior, mesma regra de filtro). */
export async function listarLeads(criadorId: string, f: { paginaId?: string; funilId?: string; busca?: string; pagina: number; porPagina?: number }) {
  const termo = f.busca?.trim();
  const porPagina = f.porPagina ?? POR_PAGINA_LEADS;
  const linhas = await db
    .select({
      id: leads.id,
      nome: leads.nome,
      email: leads.email,
      paginaId: leads.pagina_id,
      pagina: paginas.titulo,
      funil: funis.nome,
      tag: tags.nome,
      utm: leads.utm,
      consentimentoTexto: leads.consentimento_texto,
      consentimentoEm: leads.consentimento_em,
      capturas: leads.capturas,
      criadoEm: leads.created_at,
      ultimaCapturaEm: leads.ultima_captura_em,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(leads)
    .innerJoin(paginas, eq(paginas.id, leads.pagina_id))
    .leftJoin(funis, eq(funis.id, leads.funil_id))
    .leftJoin(tags, eq(tags.id, leads.tag_id))
    .where(
      and(
        eq(leads.criador_id, criadorId),
        vivos(leads),
        f.paginaId ? eq(leads.pagina_id, f.paginaId) : undefined,
        f.funilId ? eq(leads.funil_id, f.funilId) : undefined,
        termo ? or(ilike(leads.email, `%${termo.replace(/[\\%_]/g, "\\$&")}%`), ilike(leads.nome, `%${termo.replace(/[\\%_]/g, "\\$&")}%`)) : undefined,
      ),
    )
    .orderBy(desc(leads.ultima_captura_em), desc(leads.id))
    .limit(porPagina)
    .offset((f.pagina - 1) * porPagina);
  const fora = await descadastradosEntre(criadorId, linhas.map((l) => hashDoDestinatario(l.email)));
  return { total: linhas[0]?.total ?? 0, linhas: linhas.map((l) => ({ ...l, descadastrado: fora.has(hashDoDestinatario(l.email)) })) };
}

/** Números por (página, funil) no período: visitas, leads (1ª captura), cliques no checkout, vendas PAGAS e receita. */
async function numerosPorPagina(criadorId: string, funilId: string, paginaIds: string[], dias: number): Promise<Map<string, NumerosEtapa>> {
  const m = new Map<string, NumerosEtapa>(paginaIds.map((id) => [id, { visitas: 0, leads: 0, cliques: 0, vendas: 0, receitaCentavos: 0 }]));
  if (!paginaIds.length) return m;
  const [v, l, c] = await Promise.all([
    db
      .select({ id: visitas.pagina_id, n: sql<number>`sum(${visitas.visitas})::int` })
      .from(visitas)
      .where(and(eq(visitas.criador_id, criadorId), eq(visitas.funil_id, funilId), inArray(visitas.pagina_id, paginaIds), gte(visitas.dia, desdeDia(dias))))
      .groupBy(visitas.pagina_id),
    db
      .select({ id: leads.pagina_id, n: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.criador_id, criadorId), eq(leads.funil_id, funilId), inArray(leads.pagina_id, paginaIds), vivos(leads), gte(leads.created_at, desdeInstante(dias))))
      .groupBy(leads.pagina_id),
    db
      .select({
        id: checkouts.pagina_id,
        n: sql<number>`count(*)::int`,
        vendas: sql<number>`count(*) filter (where ${vendas.situacao} = 'PAGA')::int`,
        receita: sql<number>`coalesce(sum(${vendas.valor_centavos} - ${vendas.reembolsado_centavos}) filter (where ${vendas.situacao} = 'PAGA'), 0)::int`,
      })
      .from(checkouts)
      .innerJoin(vendas, and(eq(vendas.id, checkouts.venda_id), eq(vendas.criador_id, criadorId)))
      .where(and(eq(checkouts.criador_id, criadorId), eq(checkouts.funil_id, funilId), inArray(checkouts.pagina_id, paginaIds), vivos(checkouts), gte(checkouts.created_at, desdeInstante(dias))))
      .groupBy(checkouts.pagina_id),
  ]);
  for (const x of v) m.get(x.id)!.visitas = x.n;
  for (const x of l) m.get(x.id)!.leads = x.n;
  for (const x of c) Object.assign(m.get(x.id)!, { cliques: x.n, vendas: x.vendas, receitaCentavos: x.receita });
  return m;
}

export async function listarFunis(criadorId: string) {
  const lista = await db.select().from(funis).where(and(eq(funis.criador_id, criadorId), vivos(funis))).orderBy(desc(funis.created_at));
  return Promise.all(
    lista.map(async (f) => {
      const n = [...(await numerosPorPagina(criadorId, f.id, f.etapas.map((e) => e.paginaId), 30)).values()];
      return {
        id: f.id,
        nome: f.nome,
        etapas: f.etapas.length,
        versao: f.updated_at.toISOString(),
        criadoEm: f.created_at,
        visitas: n[0]?.visitas ?? 0,
        leads: n.reduce((s, x) => s + x.leads, 0),
        vendas: n.reduce((s, x) => s + x.vendas, 0),
      };
    }),
  );
}

/** Funil com as etapas resolvidas (página viva ou não) e a conversão etapa a etapa no período. */
export async function metricasDoFunil(criadorId: string, funilId: string, dias: number) {
  const [f] = await db.select().from(funis).where(and(eq(funis.id, funilId), eq(funis.criador_id, criadorId), vivos(funis)));
  if (!f) return null;
  const ids = f.etapas.map((e) => e.paginaId);
  const [pgs, numeros] = await Promise.all([
    db.select({ id: paginas.id, titulo: paginas.titulo, slug: paginas.slug, situacao: paginas.situacao, viva: sql<boolean>`not ${paginas.is_deleted}` }).from(paginas).where(and(eq(paginas.criador_id, criadorId), inArray(paginas.id, ids))),
    numerosPorPagina(criadorId, f.id, ids, dias),
  ]);
  const porId = new Map(pgs.map((p) => [p.id, p]));
  const conv = conversoes(ids.map((id) => numeros.get(id)!));
  return {
    id: f.id,
    nome: f.nome,
    versao: f.updated_at.toISOString(),
    etapasBrutas: f.etapas,
    etapas: f.etapas.map((e, i) => {
      const p = porId.get(e.paginaId);
      return { ...conv[i], paginaId: e.paginaId, nome: e.nome, titulo: p?.titulo ?? "Página removida", slug: p?.slug ?? null, publicada: !!p?.viva && p.situacao === "PUBLICADA" };
    }),
  };
}

/** Páginas vivas para montar etapas (seletor do funil). */
export async function paginasParaFunil(criadorId: string) {
  return db
    .select({ id: paginas.id, titulo: paginas.titulo, slug: paginas.slug, situacao: paginas.situacao })
    .from(paginas)
    .where(and(eq(paginas.criador_id, criadorId), vivos(paginas)))
    .orderBy(asc(paginas.titulo));
}

