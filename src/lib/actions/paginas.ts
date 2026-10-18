"use server";

import { and, eq } from "drizzle-orm";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { arquivos } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { criarPagina, despublicarPagina, excluirPagina, publicarPagina, salvarRascunho } from "@/lib/paginas/paginas";
import { criarFunilSchema, criarPaginaSchema, excluirFunilSchema, imagemPaginaSchema, salvarFunilSchema, salvarPaginaSchema, versaoPaginaSchema } from "@/lib/validators/paginas";
import { criarFunil, excluirFunil, salvarFunil } from "@/lib/paginas/funis";

/**
 * Páginas de venda/captura e funis (ADR-0022, RN-240 a RN-246) — equipe (DONO e ADMIN), criador do HOST.
 * `versao` = `updated_at` ISO (trava). Publicar, tirar do ar e excluir passam pelo modal block na tela.
 */

async function equipe() {
  const { usuario, criador } = await exigirMembro(EQUIPE);
  return { criadorId: criador.id, autor: usuario.id };
}
const iso = (d: Date) => d.toISOString();

export async function acaoCriarPagina(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = criarPaginaSchema.parse(entrada);
    const r = await db.transaction((tx) => criarPagina(tx, { ...quem, modelo: e.modelo, titulo: e.titulo, slug: e.slug }));
    return { id: r.id, versao: iso(r.versao) };
  });
}

/** Autosave do editor (nome, endereço e blocos). Conflito = "alterado por outro usuário". */
export async function acaoSalvarRascunhoPagina(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = salvarPaginaSchema.parse(entrada);
    const r = await db.transaction((tx) => salvarRascunho(tx, { ...quem, paginaId: e.paginaId, versao: e.versao, titulo: e.titulo, slug: e.slug, config: e.config }));
    return { versao: iso(r.versao) };
  });
}

export async function acaoPublicarPagina(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = versaoPaginaSchema.parse(entrada);
    const r = await db.transaction((tx) => publicarPagina(tx, { ...quem, paginaId: e.paginaId, versao: e.versao }));
    return { versao: iso(r.versao), numero: r.numero, publicadaEm: iso(r.publicadaEm) };
  });
}

export async function acaoDespublicarPagina(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = versaoPaginaSchema.parse(entrada);
    const r = await db.transaction((tx) => despublicarPagina(tx, { ...quem, paginaId: e.paginaId, versao: e.versao }));
    return { versao: iso(r.versao) };
  });
}

export async function acaoExcluirPagina(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = versaoPaginaSchema.parse(entrada);
    await db.transaction((tx) => excluirPagina(tx, { ...quem, paginaId: e.paginaId, versao: e.versao }));
    return null;
  });
}

/** Imagem recém-enviada (capa, autor, compartilhamento): confere que é deste criador e devolve a URL da prévia. */
export async function acaoPrepararImagemPagina(entrada: unknown) {
  return executar(async () => {
    const { criadorId } = await equipe();
    const e = imagemPaginaSchema.parse(entrada);
    const [a] = await db
      .select({ chave: arquivos.chave })
      .from(arquivos)
      .where(and(eq(arquivos.id, e.arquivoId), eq(arquivos.criador_id, criadorId), eq(arquivos.finalidade, "IMAGEM"), eq(arquivos.status, "DISPONIVEL"), vivos(arquivos)));
    if (!a) throw new ErroDeNegocio("Imagem inválida ou ainda não confirmada. Envie de novo.");
    return { url: await urlDeImagemOuNula(criadorId, a.chave) };
  });
}

export async function acaoCriarFunil(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = criarFunilSchema.parse(entrada);
    const r = await db.transaction((tx) => criarFunil(tx, { ...quem, nome: e.nome, etapas: e.etapas }));
    return { id: r.id, versao: iso(r.versao) };
  });
}

export async function acaoSalvarFunil(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = salvarFunilSchema.parse(entrada);
    const r = await db.transaction((tx) => salvarFunil(tx, { ...quem, funilId: e.funilId, versao: e.versao, nome: e.nome, etapas: e.etapas }));
    return { versao: iso(r.versao) };
  });
}

export async function acaoExcluirFunil(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = excluirFunilSchema.parse(entrada);
    await db.transaction((tx) => excluirFunil(tx, { ...quem, funilId: e.funilId, versao: e.versao }));
    return null;
  });
}
