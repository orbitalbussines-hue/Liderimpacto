"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { apagarObjetosDescartados, arquivoParaUsar, descartarArquivo } from "@/lib/armazenamento/arquivos";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { pendenciasDoProduto } from "@/lib/catalogo/publicacao";
import { mensagemDePendencias, ROTULO_STATUS_PRODUTO } from "@/lib/catalogo/regras";
import { pedirReindexacao } from "@/lib/conhecimento/pedir";
import { db, type Transacao } from "@/lib/db";
import { criadores_membros, produtos, produtos_modulos, produtos_modulos_aulas, produtos_modulos_aulas_materiais } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { validarHex } from "@/lib/marca/paleta";
import { violouUnico } from "@/lib/membros/vinculos";
import {
  corCursoSchema,
  descricaoSchema,
  idSchema,
  slugSchema,
  statusProdutoSchema,
  sugerirSlug,
  tipoProdutoSchema,
  tituloSchema,
  versaoSchema,
} from "@/lib/validators/catalogo";

/**
 * Produtos do criador do HOST (DONO e ADMIN): criar, editar dados, capas, situacao (publicar com
 * pre-requisitos) e remover. Toda edicao com trava de colisao; trilha antes -> depois na mesma
 * transacao. Estrutura (modulos/aulas) em produtos-estrutura.ts; aula em aulas.ts.
 */

const MSG_SLUG_REPETIDO = "Este endereço já é usado por outro produto desta área.";
const slugRepetido = (erro: unknown): never => {
  if (violouUnico(erro)) throw new ErroDeNegocio(MSG_SLUG_REPETIDO);
  throw erro;
};

/** Produto DESTE criador na versao que a tela abriu, travado ate o fim da transacao. */
async function travarProduto(tx: Transacao, criadorId: string, produtoId: string, versao: Date) {
  const [p] = await tx
    .select()
    .from(produtos)
    .where(and(travaDeColisao(produtos, produtoId, versao), eq(produtos.criador_id, criadorId)))
    .for("update");
  if (!p) throw new ErroDeNegocio(MSG_COLISAO);
  return p;
}

/** Diferenca campo a campo para a trilha. */
function diferenca<T extends Record<string, unknown>>(antes: T, depois: Partial<T>) {
  const chaves = (Object.keys(depois) as (keyof T)[]).filter((k) => antes[k] !== depois[k]);
  return {
    antes: Object.fromEntries(chaves.map((k) => [k, antes[k]])),
    depois: Object.fromEntries(chaves.map((k) => [k, depois[k]])),
  };
}

export async function acaoCriarProduto(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z
      .strictObject({ titulo: tituloSchema, slug: slugSchema.optional(), descricao: descricaoSchema.default(""), tipo: tipoProdutoSchema })
      .parse(entrada);
    const slug = e.slug ?? slugSchema.parse(sugerirSlug(e.titulo));
    const r = await db
      .transaction(async (tx) => {
        // Codigo sequencial por criador: fila por criador (lock de transacao), nunca reaproveitado.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`produtos:${criador.id}`}))`);
        const [{ proximo }] = await tx
          .select({ proximo: sql<number>`coalesce(max(${produtos.codigo}), 0)::int + 1` })
          .from(produtos)
          .where(eq(produtos.criador_id, criador.id));
        const [p] = await tx
          .insert(produtos)
          .values({ criador_id: criador.id, codigo: proximo, titulo: e.titulo, slug, descricao: e.descricao, tipo: e.tipo, modified_by: usuario.id })
          .returning({ id: produtos.id, codigo: produtos.codigo });
        await registrarAuditoria(tx, {
          userId: usuario.id,
          criadorId: criador.id,
          acao: "criar",
          tabela: "produtos",
          registroId: p.id,
          detalhes: `Criou o produto "${e.titulo}" (Cód. ${p.codigo})`,
          dadosNovos: { codigo: p.codigo, titulo: e.titulo, slug, tipo: e.tipo, status: "RASCUNHO" },
        });
        return { id: p.id };
      })
      .catch(slugRepetido);
    if (e.descricao.trim()) await pedirReindexacao(criador.id, { tipo: "PRODUTO", produtoId: r.id }, usuario.id);
    return r;
  });
}

export async function acaoSalvarProduto(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z
      .strictObject({
        produtoId: idSchema,
        versao: versaoSchema,
        titulo: tituloSchema,
        slug: slugSchema,
        descricao: descricaoSchema,
        tipo: tipoProdutoSchema,
        professorMembroId: idSchema.nullable(),
        corMarca: corCursoSchema,
      })
      .parse(entrada);
    const cor = e.corMarca ? validarHex(e.corMarca) : null;
    const r = await db
      .transaction(async (tx) => {
        const antes = await travarProduto(tx, criador.id, e.produtoId, e.versao);
        if (e.professorMembroId) {
          const [prof] = await tx
            .select({ id: criadores_membros.id })
            .from(criadores_membros)
            .where(
              and(
                eq(criadores_membros.id, e.professorMembroId),
                eq(criadores_membros.criador_id, criador.id),
                inArray(criadores_membros.papel, ["DONO", "ADMIN"]),
                eq(criadores_membros.status, "ATIVO"),
                vivos(criadores_membros),
              ),
            );
          if (!prof) throw new ErroDeNegocio("Professor inválido: escolha alguém da equipe (Dono ou Admin) desta área.");
        }
        const novo = { titulo: e.titulo, slug: e.slug, descricao: e.descricao, tipo: e.tipo, professor_membro_id: e.professorMembroId, cor_marca: cor };
        const [linha] = await tx
          .update(produtos)
          .set({ ...novo, updated_at: new Date(), modified_by: usuario.id })
          .where(and(travaDeColisao(produtos, e.produtoId, e.versao), eq(produtos.criador_id, criador.id)))
          .returning({ updated_at: produtos.updated_at });
        if (!linha) throw new ErroDeNegocio(MSG_COLISAO);
        const d = diferenca(antes, novo);
        await registrarAuditoria(tx, {
          userId: usuario.id,
          criadorId: criador.id,
          acao: "atualizar",
          tabela: "produtos",
          registroId: e.produtoId,
          detalhes: `Alterou o produto "${antes.titulo}" (${Object.keys(d.depois).join(", ") || "sem mudanças"})`,
          dadosAnteriores: d.antes,
          dadosNovos: d.depois,
        });
        return { versao: linha.updated_at.toISOString() };
      })
      .catch(slugRepetido);
    // Base de conhecimento (ADR-0014): descrição do curso, depois do commit.
    await pedirReindexacao(criador.id, { tipo: "PRODUTO", produtoId: e.produtoId }, usuario.id);
    return r;
  });
}

/** RASCUNHO -> PUBLICADO/NAO_LISTADO exige titulo, 1 modulo publicado com 1 aula e capa 16:9. */
export async function acaoAlterarSituacaoProduto(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ produtoId: idSchema, versao: versaoSchema, status: statusProdutoSchema }).parse(entrada);
    return db.transaction(async (tx) => {
      const p = await travarProduto(tx, criador.id, e.produtoId, e.versao);
      if (p.status === e.status) throw new ErroDeNegocio(`O produto já está como ${ROTULO_STATUS_PRODUTO[e.status]}.`);
      if (e.status !== "RASCUNHO") {
        const faltas = await pendenciasDoProduto(tx, criador.id, p);
        if (faltas.length) throw new ErroDeNegocio(mensagemDePendencias(faltas));
      }
      const [linha] = await tx
        .update(produtos)
        .set({
          status: e.status,
          // NOVIDADES (passo 5): a primeira publicacao fica; voltar a rascunho e republicar nao "renova".
          ...(e.status !== "RASCUNHO" ? { publicado_em: sql`coalesce(${produtos.publicado_em}, now())` } : {}),
          updated_at: new Date(),
          modified_by: usuario.id,
        })
        .where(travaDeColisao(produtos, e.produtoId, e.versao))
        .returning({ updated_at: produtos.updated_at });
      if (!linha) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "publicar",
        tabela: "produtos",
        registroId: p.id,
        detalhes: `Situação de "${p.titulo}": ${ROTULO_STATUS_PRODUTO[p.status]} → ${ROTULO_STATUS_PRODUTO[e.status]}`,
        dadosAnteriores: { status: p.status },
        dadosNovos: { status: e.status },
      });
      return { versao: linha.updated_at.toISOString() };
    });
  });
}

const COLUNA_CAPA = { "3x4": "capa_3x4_arquivo_id", "16x9": "capa_16x9_arquivo_id" } as const;
const capaNova = (formato: keyof typeof COLUNA_CAPA, id: string | null) =>
  formato === "3x4" ? { capa_3x4_arquivo_id: id } : { capa_16x9_arquivo_id: id };

/** Define, troca ou remove (arquivoId nulo) uma capa. A anterior e descartada (registro + objeto). */
export async function acaoDefinirCapaProduto(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z
      .strictObject({ produtoId: idSchema, versao: versaoSchema, formato: z.enum(["3x4", "16x9"], "Formato inválido."), arquivoId: idSchema.nullable() })
      .parse(entrada);
    const coluna = COLUNA_CAPA[e.formato];
    const descartada: (string | null)[] = [];
    const r = await db.transaction(async (tx) => {
      const p = await travarProduto(tx, criador.id, e.produtoId, e.versao);
      if (!e.arquivoId && e.formato === "16x9" && p.status !== "RASCUNHO") {
        throw new ErroDeNegocio("Produto publicado precisa da capa 16:9. Troque a imagem ou volte o produto para rascunho.");
      }
      if (e.arquivoId) await arquivoParaUsar(tx, criador.id, e.arquivoId, "IMAGEM");
      const anterior = p[coluna];
      const [linha] = await tx
        .update(produtos)
        .set({ ...capaNova(e.formato, e.arquivoId), updated_at: new Date(), modified_by: usuario.id })
        .where(travaDeColisao(produtos, e.produtoId, e.versao))
        .returning({ updated_at: produtos.updated_at });
      if (!linha) throw new ErroDeNegocio(MSG_COLISAO);
      if (anterior && anterior !== e.arquivoId) {
        descartada.push(await descartarArquivo(tx, { criadorId: criador.id, arquivoId: anterior, autorId: usuario.id, motivo: `capa ${e.formato} substituída` }));
      }
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "produtos",
        registroId: p.id,
        detalhes: `${e.arquivoId ? (anterior ? "Trocou" : "Definiu") : "Removeu"} a capa ${e.formato.replace("x", ":")} de "${p.titulo}"`,
        dadosAnteriores: { [coluna]: anterior },
        dadosNovos: { [coluna]: e.arquivoId },
      });
      return { versao: linha.updated_at.toISOString() };
    });
    await apagarObjetosDescartados(criador.id, descartada);
    return r;
  });
}

/**
 * Remove (soft delete) um produto em RASCUNHO com toda a estrutura (modulos, aulas, materiais) e
 * descarta os arquivos dele. Publicado precisa voltar para rascunho antes (ninguem perde acesso
 * sem querer).
 */
export async function acaoRemoverProduto(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ produtoId: idSchema, versao: versaoSchema }).parse(entrada);
    const descartados: (string | null)[] = [];
    await db.transaction(async (tx) => {
      const p = await travarProduto(tx, criador.id, e.produtoId, e.versao);
      if (p.status !== "RASCUNHO") throw new ErroDeNegocio("Só é possível remover produto em rascunho. Mude a situação para Rascunho antes.");
      const exclusao = marcaDeExclusao(usuario.id);
      const modulos = await tx
        .update(produtos_modulos)
        .set(exclusao)
        .where(and(eq(produtos_modulos.produto_id, p.id), eq(produtos_modulos.criador_id, criador.id), vivos(produtos_modulos)))
        .returning({ id: produtos_modulos.id });
      const idsModulos = modulos.map((m) => m.id);
      const aulas = idsModulos.length
        ? await tx
            .update(produtos_modulos_aulas)
            .set(exclusao)
            .where(and(inArray(produtos_modulos_aulas.modulo_id, idsModulos), eq(produtos_modulos_aulas.criador_id, criador.id), vivos(produtos_modulos_aulas)))
            .returning({ id: produtos_modulos_aulas.id, thumb: produtos_modulos_aulas.thumb_arquivo_id })
        : [];
      const materiais = aulas.length
        ? await tx
            .update(produtos_modulos_aulas_materiais)
            .set(exclusao)
            .where(
              and(
                inArray(produtos_modulos_aulas_materiais.aula_id, aulas.map((a) => a.id)),
                eq(produtos_modulos_aulas_materiais.criador_id, criador.id),
                vivos(produtos_modulos_aulas_materiais),
              ),
            )
            .returning({ arquivo: produtos_modulos_aulas_materiais.arquivo_id })
        : [];
      await tx.update(produtos).set(exclusao).where(travaDeColisao(produtos, p.id, e.versao));
      const arquivosDoProduto = [p.capa_3x4_arquivo_id, p.capa_16x9_arquivo_id, ...aulas.map((a) => a.thumb), ...materiais.map((m) => m.arquivo)];
      for (const arquivoId of arquivosDoProduto.filter((x): x is string => !!x)) {
        descartados.push(await descartarArquivo(tx, { criadorId: criador.id, arquivoId, autorId: usuario.id, motivo: `produto "${p.titulo}" removido` }));
      }
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "excluir",
        tabela: "produtos",
        registroId: p.id,
        detalhes: `Removeu o produto "${p.titulo}" (Cód. ${p.codigo}) com ${idsModulos.length} módulo(s), ${aulas.length} aula(s) e ${materiais.length} material(is) (exclusão lógica)`,
        dadosAnteriores: { titulo: p.titulo, slug: p.slug, status: p.status },
      });
    });
    await apagarObjetosDescartados(criador.id, descartados);
    return null;
  });
}

