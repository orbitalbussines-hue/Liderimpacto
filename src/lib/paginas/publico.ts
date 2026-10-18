import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { AUTOR_SISTEMA } from "@/lib/conhecimento/regras";
import { db } from "@/lib/db";
import {
  arquivos,
  criadores_funis as funis,
  criadores_ofertas as ofertas,
  criadores_paginas as paginas,
  criadores_paginas_checkouts as checkouts,
  criadores_paginas_visitas as visitas,
  produtos,
  produtos_modulos as modulos,
  produtos_modulos_aulas as aulas,
} from "@/lib/db/schema";
import type { EtapaFunil } from "@/lib/db/schema/paginas";
import { vivos } from "@/lib/db/soft-delete";
import { configPaginaSchema, referenciasDaConfig, type ConfigPagina } from "./config";
import type { DadosRender } from "./render-tipos";

/**
 * LADO PÚBLICO das páginas (RN-241, RN-244, RN-246): a publicada pelo slug no criador do HOST, os dados
 * que os blocos mostram (imagem assinada, módulos do curso, preço da oferta ATIVA), a visita anônima por
 * dia e o clique no checkout atribuído à página/funil. Nada aqui lê sessão.
 */

export interface PaginaParaRender {
  id: string;
  slug: string;
  titulo: string;
  config: ConfigPagina;
}

const lerConfig = (c: unknown): ConfigPagina | null => {
  const r = configPaginaSchema.safeParse(c);
  return r.success ? r.data : null;
};

/** A PUBLICADA deste criador neste slug; rascunho, fora do ar, excluída ou de outro criador = null. */
export async function paginaPublicada(criadorId: string, slug: string): Promise<PaginaParaRender | null> {
  const [p] = await db
    .select({ id: paginas.id, slug: paginas.slug, titulo: paginas.titulo, config: paginas.publicada })
    .from(paginas)
    .where(and(eq(paginas.criador_id, criadorId), eq(paginas.slug, slug), eq(paginas.situacao, "PUBLICADA"), vivos(paginas)));
  const config = p ? lerConfig(p.config) : null;
  return p && config ? { ...p, config } : null;
}

/** RASCUNHO para a prévia da equipe (a página confere o papel antes). */
export async function paginaEmRascunho(criadorId: string, paginaId: string): Promise<PaginaParaRender | null> {
  const [p] = await db.select({ id: paginas.id, slug: paginas.slug, titulo: paginas.titulo, config: paginas.rascunho }).from(paginas).where(and(eq(paginas.criador_id, criadorId), eq(paginas.id, paginaId), vivos(paginas)));
  const config = p ? lerConfig(p.config) : null;
  return p && config ? { ...p, config } : null;
}

/** Funil vivo deste criador que tem a página como etapa (senão null: o parâmetro da URL é ignorado). */
export async function funilDaPagina(criadorId: string, funilId: string | null, paginaId: string): Promise<{ id: string; etapas: EtapaFunil[]; indice: number } | null> {
  if (!funilId) return null;
  const [f] = await db.select({ id: funis.id, etapas: funis.etapas }).from(funis).where(and(eq(funis.id, funilId), eq(funis.criador_id, criadorId), vivos(funis)));
  const indice = f ? f.etapas.findIndex((e) => e.paginaId === paginaId) : -1;
  return f && indice >= 0 ? { id: f.id, etapas: f.etapas, indice } : null;
}

/** Slug da próxima etapa PUBLICADA do funil (null = fim do funil ou próxima fora do ar). */
export async function proximaEtapa(criadorId: string, funil: { etapas: EtapaFunil[]; indice: number }): Promise<string | null> {
  const prox = funil.etapas[funil.indice + 1];
  if (!prox) return null;
  const [p] = await db.select({ slug: paginas.slug }).from(paginas).where(and(eq(paginas.id, prox.paginaId), eq(paginas.criador_id, criadorId), eq(paginas.situacao, "PUBLICADA"), vivos(paginas)));
  return p?.slug ?? null;
}

/** Chave de cada imagem DESTE criador (IMAGEM disponível). */
async function chavesDasImagens(criadorId: string, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const linhas = await db
    .select({ id: arquivos.id, chave: arquivos.chave })
    .from(arquivos)
    .where(and(eq(arquivos.criador_id, criadorId), inArray(arquivos.id, ids), eq(arquivos.finalidade, "IMAGEM"), eq(arquivos.status, "DISPONIVEL"), vivos(arquivos)));
  return new Map(linhas.map((l) => [l.id, l.chave]));
}

export async function urlDaImagemDaPagina(criadorId: string, arquivoId: string | null): Promise<string | null> {
  if (!arquivoId) return null;
  return urlDeImagemOuNula(criadorId, (await chavesDasImagens(criadorId, [arquivoId])).get(arquivoId) ?? null);
}

/** Tudo que os blocos mostram além do texto. Referência que sumiu ou de outro criador = ausente (o bloco some). */
export async function dadosParaRender(criadorId: string, config: ConfigPagina): Promise<DadosRender> {
  const r = referenciasDaConfig(config);
  const [chaves, cursos, listaOfertas] = await Promise.all([
    chavesDasImagens(criadorId, r.imagens),
    r.produtos.length
      ? db
          .select({ produtoId: produtos.id, curso: produtos.titulo, moduloId: modulos.id, modulo: modulos.titulo, aula: aulas.titulo })
          .from(produtos)
          .leftJoin(modulos, and(eq(modulos.produto_id, produtos.id), eq(modulos.status, "PUBLICADO"), vivos(modulos)))
          .leftJoin(aulas, and(eq(aulas.modulo_id, modulos.id), vivos(aulas)))
          .where(and(eq(produtos.criador_id, criadorId), inArray(produtos.id, r.produtos), vivos(produtos)))
          .orderBy(asc(modulos.ordem), asc(aulas.ordem))
      : [],
    r.ofertas.length
      ? db
          .select({ id: ofertas.id, nome: ofertas.nome, precoCentavos: ofertas.preco_centavos, tipo: ofertas.tipo, intervalo: ofertas.intervalo })
          .from(ofertas)
          .where(and(eq(ofertas.criador_id, criadorId), inArray(ofertas.id, r.ofertas), eq(ofertas.situacao, "ATIVA"), vivos(ofertas)))
      : [],
  ]);
  const imagens: DadosRender["imagens"] = {};
  await Promise.all([...chaves].map(async ([id, chave]) => void (imagens[id] = await urlDeImagemOuNula(criadorId, chave))));
  const porCurso: DadosRender["cursos"] = {};
  for (const l of cursos) {
    const c = (porCurso[l.produtoId] ??= { titulo: l.curso, modulos: [] });
    if (!l.moduloId || !l.modulo) continue;
    let m = c.modulos.at(-1);
    if (m?.id !== l.moduloId) c.modulos.push((m = { id: l.moduloId, titulo: l.modulo, aulas: [] }));
    if (l.aula) m.aulas.push(l.aula);
  }
  return { imagens, cursos: porCurso, ofertas: Object.fromEntries(listaOfertas.map((o) => [o.id, o])) };
}

const hojeEmBrasilia = sql`(now() at time zone 'America/Sao_Paulo')::date`;

/** +1 visita (página PUBLICADA deste criador; funil só se tiver a página). Nunca lança: métrica não derruba a página. */
export async function registrarVisita(criadorId: string, paginaId: string, funilId: string | null): Promise<boolean> {
  try {
    const [p] = await db.select({ id: paginas.id }).from(paginas).where(and(eq(paginas.id, paginaId), eq(paginas.criador_id, criadorId), eq(paginas.situacao, "PUBLICADA"), vivos(paginas)));
    if (!p) return false;
    const funil = await funilDaPagina(criadorId, funilId, paginaId);
    await db
      .insert(visitas)
      .values({ criador_id: criadorId, pagina_id: paginaId, funil_id: funil?.id ?? null, dia: hojeEmBrasilia, visitas: 1, modified_by: AUTOR_SISTEMA })
      .onConflictDoUpdate({ target: [visitas.pagina_id, visitas.funil_id, visitas.dia], set: { visitas: sql`${visitas.visitas} + 1` } });
    return true;
  } catch (e) {
    console.error("[paginas] visita não registrada:", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Checkout aberto pelo botão de preço (`pagina=`/`funil=` no link de compra): liga a venda PENDENTE à
 * página e ao funil. Página de outro criador ou fora do ar = ignorado. Nunca lança (a compra segue).
 */
export async function registrarCheckoutDaPagina(criadorId: string, vendaId: string, paginaId: string | null, funilId: string | null): Promise<void> {
  if (!paginaId) return;
  try {
    const [p] = await db.select({ id: paginas.id }).from(paginas).where(and(eq(paginas.id, paginaId), eq(paginas.criador_id, criadorId), eq(paginas.situacao, "PUBLICADA"), vivos(paginas)));
    if (!p) return;
    const funil = await funilDaPagina(criadorId, funilId, paginaId);
    await db.insert(checkouts).values({ criador_id: criadorId, pagina_id: paginaId, funil_id: funil?.id ?? null, venda_id: vendaId, modified_by: AUTOR_SISTEMA }).onConflictDoNothing();
  } catch (e) {
    console.error("[paginas] checkout não atribuído:", e instanceof Error ? e.message : e);
  }
}
