import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import type { ModeloPagina } from "@/lib/db/schema/_enums";
import { arquivos, criadores_funis, criadores_ofertas, criadores_paginas as paginas, criadores_tags, produtos } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { violouUnico } from "@/lib/membros/vinculos";
import { configPaginaSchema, pendenciasParaPublicar, referenciasDaConfig, resumoDosBlocos, type ConfigPagina } from "./config";
import { paginaDoModelo } from "./modelos";

/**
 * ESCRITA das páginas (RN-240 a RN-242): criar de um modelo, autosave do rascunho com trava, publicar
 * (rascunho → publicada, versão n+1), tirar do ar e excluir (soft delete). Todas `(tx, p)` com trilha.
 */

const TABELA = "criadores_paginas";
export const MSG_SLUG_DUPLICADO = "Já existe uma página com este endereço nesta área.";
const MSG_REF = "A página aponta para uma imagem, curso, oferta ou tag que não é desta área. Recarregue a página.";

/** Toda referência do JSON é DESTE criador (imagem IMAGEM disponível; curso, oferta e tag vivos). */
export async function validarReferencias(tx: Transacao, criadorId: string, c: ConfigPagina) {
  const r = referenciasDaConfig(c);
  const conta = async (n: number, consulta: () => Promise<unknown[]>) => {
    if (n && (await consulta()).length !== n) throw new ErroDeNegocio(MSG_REF);
  };
  await conta(r.imagens.length, () =>
    tx
      .select({ id: arquivos.id })
      .from(arquivos)
      .where(and(eq(arquivos.criador_id, criadorId), inArray(arquivos.id, r.imagens), eq(arquivos.finalidade, "IMAGEM"), eq(arquivos.status, "DISPONIVEL"), vivos(arquivos))),
  );
  await conta(r.produtos.length, () => tx.select({ id: produtos.id }).from(produtos).where(and(eq(produtos.criador_id, criadorId), inArray(produtos.id, r.produtos), vivos(produtos))));
  await conta(r.ofertas.length, () =>
    tx.select({ id: criadores_ofertas.id }).from(criadores_ofertas).where(and(eq(criadores_ofertas.criador_id, criadorId), inArray(criadores_ofertas.id, r.ofertas), vivos(criadores_ofertas))),
  );
  await conta(r.tags.length, () => tx.select({ id: criadores_tags.id }).from(criadores_tags).where(and(eq(criadores_tags.criador_id, criadorId), inArray(criadores_tags.id, r.tags), vivos(criadores_tags))));
}

const slugDuplicado = (e: unknown) => {
  if (violouUnico(e)) throw new ErroDeNegocio(MSG_SLUG_DUPLICADO);
  throw e;
};

export async function criarPagina(tx: Transacao, p: { criadorId: string; autor: string; modelo: ModeloPagina; titulo: string; slug: string }): Promise<{ id: string; versao: Date }> {
  // Primeiro curso e primeira oferta ATIVA da área já entram no modelo (o criador troca no editor).
  const [produto] = await tx.select({ id: produtos.id }).from(produtos).where(and(eq(produtos.criador_id, p.criadorId), vivos(produtos))).orderBy(asc(produtos.created_at)).limit(1);
  const [oferta] = await tx
    .select({ id: criadores_ofertas.id })
    .from(criadores_ofertas)
    .where(and(eq(criadores_ofertas.criador_id, p.criadorId), eq(criadores_ofertas.situacao, "ATIVA"), vivos(criadores_ofertas)))
    .orderBy(asc(criadores_ofertas.created_at))
    .limit(1);
  const config = paginaDoModelo(p.modelo, { produtoId: produto?.id ?? null, ofertaId: oferta?.id ?? null });
  config.seo = { ...config.seo, titulo: p.titulo.slice(0, 70) };
  const [n] = await tx
    .insert(paginas)
    .values({ criador_id: p.criadorId, slug: p.slug, titulo: p.titulo, modelo: p.modelo, rascunho: config, modified_by: p.autor })
    .returning({ id: paginas.id, versao: paginas.updated_at })
    .catch(slugDuplicado);
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "criar", tabela: TABELA, registroId: n.id, detalhes: `Criou a página "${p.titulo}" (/p/${p.slug}) do modelo ${p.modelo}` });
  return n;
}

async function travada(tx: Transacao, criadorId: string, paginaId: string, versao: Date) {
  const [x] = await tx.select().from(paginas).where(and(travaDeColisao(paginas, paginaId, versao), eq(paginas.criador_id, criadorId))).for("update");
  if (!x) throw new ErroDeNegocio(MSG_COLISAO);
  return x;
}

async function gravar(tx: Transacao, criadorId: string, paginaId: string, versao: Date, autor: string, valores: Partial<typeof paginas.$inferInsert>) {
  const [x] = await tx
    .update(paginas)
    .set({ ...valores, updated_at: new Date(), modified_by: autor })
    .where(and(travaDeColisao(paginas, paginaId, versao), eq(paginas.criador_id, criadorId)))
    .returning({ versao: paginas.updated_at })
    .catch(slugDuplicado);
  if (!x) throw new ErroDeNegocio(MSG_COLISAO);
  return x.versao;
}

/** Autosave: nome, endereço e rascunho. O endereço novo vale NA HORA (também para a publicada). */
export async function salvarRascunho(tx: Transacao, p: { criadorId: string; autor: string; paginaId: string; versao: Date; titulo: string; slug: string; config: ConfigPagina }): Promise<{ versao: Date }> {
  const antes = await travada(tx, p.criadorId, p.paginaId, p.versao);
  await validarReferencias(tx, p.criadorId, p.config);
  const versao = await gravar(tx, p.criadorId, p.paginaId, p.versao, p.autor, { titulo: p.titulo, slug: p.slug, rascunho: p.config });
  const mudou = [antes.titulo !== p.titulo && `nome "${antes.titulo}" → "${p.titulo}"`, antes.slug !== p.slug && `endereço /p/${antes.slug} → /p/${p.slug}`].filter(Boolean).join("; ");
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: p.paginaId,
    detalhes: `Editou o rascunho da página "${p.titulo}"${mudou ? ` (${mudou})` : ""}: ${resumoDosBlocos(p.config)}`.slice(0, 2000),
  });
  return { versao };
}

export async function publicarPagina(tx: Transacao, p: { criadorId: string; autor: string; paginaId: string; versao: Date }): Promise<{ versao: Date; numero: number; publicadaEm: Date }> {
  const antes = await travada(tx, p.criadorId, p.paginaId, p.versao);
  const config = configPaginaSchema.parse(antes.rascunho);
  const faltas = pendenciasParaPublicar(config);
  if (faltas.length) throw new ErroDeNegocio(`Para publicar, falta: ${faltas.join("; ")}.`);
  await validarReferencias(tx, p.criadorId, config);
  const numero = antes.publicacoes + 1;
  const agora = new Date();
  const versao = await gravar(tx, p.criadorId, p.paginaId, p.versao, p.autor, { situacao: "PUBLICADA", publicada: config, publicada_em: agora, publicacoes: numero });
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "publicar",
    tabela: TABELA,
    registroId: p.paginaId,
    detalhes: `Publicou a página "${antes.titulo}" (/p/${antes.slug}, versão ${numero})`,
    dadosNovos: config,
  });
  return { versao, numero, publicadaEm: agora };
}

/** Tira do ar (volta a RASCUNHO); a versão publicada fica guardada para publicar de novo. */
export async function despublicarPagina(tx: Transacao, p: { criadorId: string; autor: string; paginaId: string; versao: Date }): Promise<{ versao: Date }> {
  const antes = await travada(tx, p.criadorId, p.paginaId, p.versao);
  if (antes.situacao !== "PUBLICADA") throw new ErroDeNegocio("A página já está fora do ar.");
  const versao = await gravar(tx, p.criadorId, p.paginaId, p.versao, p.autor, { situacao: "RASCUNHO" });
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "atualizar", tabela: TABELA, registroId: p.paginaId, detalhes: `Tirou do ar a página "${antes.titulo}" (/p/${antes.slug})` });
  return { versao };
}

/** Excluir (soft delete). Página que é etapa de um funil vivo não sai (o funil perderia a etapa). */
export async function excluirPagina(tx: Transacao, p: { criadorId: string; autor: string; paginaId: string; versao: Date }): Promise<void> {
  const antes = await travada(tx, p.criadorId, p.paginaId, p.versao);
  const [funil] = await tx
    .select({ nome: criadores_funis.nome })
    .from(criadores_funis)
    .where(and(eq(criadores_funis.criador_id, p.criadorId), vivos(criadores_funis), sql`${criadores_funis.etapas} @> ${JSON.stringify([{ paginaId: p.paginaId }])}::jsonb`))
    .limit(1);
  if (funil) throw new ErroDeNegocio(`Esta página é etapa do funil "${funil.nome}". Tire-a do funil antes de excluir.`);
  const [x] = await tx.update(paginas).set(marcaDeExclusao(p.autor)).where(and(travaDeColisao(paginas, p.paginaId, p.versao), eq(paginas.criador_id, p.criadorId))).returning({ id: paginas.id });
  if (!x) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "excluir",
    tabela: TABELA,
    registroId: p.paginaId,
    detalhes: `Excluiu a página "${antes.titulo}" (/p/${antes.slug})`,
    dadosAnteriores: { titulo: antes.titulo, slug: antes.slug, situacao: antes.situacao, publicacoes: antes.publicacoes },
  });
}
