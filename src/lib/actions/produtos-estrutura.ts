"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { apagarObjetosDescartados, descartarArquivo } from "@/lib/armazenamento/arquivos";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { AULAS, MODULOS, compactar, proximaOrdem, reordenar } from "@/lib/catalogo/ordem";
import { garantirPublicavel } from "@/lib/catalogo/publicacao";
import { ROTULO_STATUS_MODULO } from "@/lib/catalogo/regras";
import { db, type Transacao } from "@/lib/db";
import { produtos, produtos_modulos, produtos_modulos_aulas, produtos_modulos_aulas_materiais } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { idSchema, novaOrdemSchema, statusModuloSchema, tituloSchema, versaoSchema } from "@/lib/validators/catalogo";

/**
 * Estrutura do produto (DONO e ADMIN, criador do HOST): modulos e aulas — criar, editar modulo,
 * remover (modal block na tela) e reordenar com trava. Ordem 1..n sem buraco (catalogo/ordem.ts).
 * Ordem das travas, sempre a mesma (sem deadlock): produto -> modulo -> aula.
 */

const NAO_ENCONTRADO = "Registro não encontrado nesta área. Recarregue a página.";

async function travarProduto(tx: Transacao, criadorId: string, produtoId: string) {
  const [p] = await tx
    .select()
    .from(produtos)
    .where(and(eq(produtos.id, produtoId), eq(produtos.criador_id, criadorId), vivos(produtos)))
    .for("update");
  if (!p) throw new ErroDeNegocio(NAO_ENCONTRADO);
  return p;
}

/** Modulo deste criador (vivo) e o produto dele, ambos travados. */
async function travarModulo(tx: Transacao, criadorId: string, moduloId: string) {
  const [m] = await tx
    .select({ produtoId: produtos_modulos.produto_id })
    .from(produtos_modulos)
    .where(and(eq(produtos_modulos.id, moduloId), eq(produtos_modulos.criador_id, criadorId), vivos(produtos_modulos)));
  if (!m) throw new ErroDeNegocio(NAO_ENCONTRADO);
  const produto = await travarProduto(tx, criadorId, m.produtoId);
  const [modulo] = await tx
    .select()
    .from(produtos_modulos)
    .where(and(eq(produtos_modulos.id, moduloId), eq(produtos_modulos.criador_id, criadorId), vivos(produtos_modulos)))
    .for("update");
  if (!modulo) throw new ErroDeNegocio(NAO_ENCONTRADO);
  return { produto, modulo };
}

export async function acaoCriarModulo(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ produtoId: idSchema, titulo: tituloSchema }).parse(entrada);
    return db.transaction(async (tx) => {
      const p = await travarProduto(tx, criador.id, e.produtoId);
      const ordem = await proximaOrdem(tx, MODULOS, p.id, criador.id);
      const [m] = await tx
        .insert(produtos_modulos)
        .values({ criador_id: criador.id, produto_id: p.id, ordem, titulo: e.titulo, modified_by: usuario.id })
        .returning({ id: produtos_modulos.id });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "criar",
        tabela: "produtos_modulos",
        registroId: m.id,
        detalhes: `Criou o módulo "${e.titulo}" em "${p.titulo}" (posição ${ordem})`,
        dadosNovos: { produto_id: p.id, titulo: e.titulo, ordem, status: "PUBLICADO" },
      });
      return { id: m.id };
    });
  });
}

/** Renomeia e/ou muda a situacao (Publicado/Rascunho) do modulo, com trava. */
export async function acaoEditarModulo(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ moduloId: idSchema, versao: versaoSchema, titulo: tituloSchema, status: statusModuloSchema }).parse(entrada);
    return db.transaction(async (tx) => {
      const { produto, modulo } = await travarModulo(tx, criador.id, e.moduloId);
      const [linha] = await tx
        .update(produtos_modulos)
        .set({ titulo: e.titulo, status: e.status, updated_at: new Date(), modified_by: usuario.id })
        .where(and(travaDeColisao(produtos_modulos, e.moduloId, e.versao), eq(produtos_modulos.criador_id, criador.id)))
        .returning({ updated_at: produtos_modulos.updated_at });
      if (!linha) throw new ErroDeNegocio(MSG_COLISAO);
      await garantirPublicavel(tx, criador.id, produto);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "produtos_modulos",
        registroId: modulo.id,
        detalhes: `Módulo "${modulo.titulo}" → "${e.titulo}" (${ROTULO_STATUS_MODULO[modulo.status]} → ${ROTULO_STATUS_MODULO[e.status]})`,
        dadosAnteriores: { titulo: modulo.titulo, status: modulo.status },
        dadosNovos: { titulo: e.titulo, status: e.status },
      });
      return { versao: linha.updated_at.toISOString() };
    });
  });
}

/** Soft delete do modulo VAZIO (com aula dentro e recusado) e fecha o buraco na ordem. */
export async function acaoRemoverModulo(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ moduloId: idSchema, versao: versaoSchema }).parse(entrada);
    await db.transaction(async (tx) => {
      const { produto, modulo } = await travarModulo(tx, criador.id, e.moduloId);
      const [{ total }] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(produtos_modulos_aulas)
        .where(and(eq(produtos_modulos_aulas.modulo_id, modulo.id), eq(produtos_modulos_aulas.criador_id, criador.id), vivos(produtos_modulos_aulas)));
      if (total > 0) throw new ErroDeNegocio(`O módulo "${modulo.titulo}" tem ${total} ${total === 1 ? "aula" : "aulas"}. Remova as aulas antes.`);
      const [linha] = await tx
        .update(produtos_modulos)
        .set(marcaDeExclusao(usuario.id))
        .where(and(travaDeColisao(produtos_modulos, e.moduloId, e.versao), eq(produtos_modulos.criador_id, criador.id)))
        .returning({ id: produtos_modulos.id });
      if (!linha) throw new ErroDeNegocio(MSG_COLISAO);
      await compactar(tx, MODULOS, produto.id, criador.id);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "excluir",
        tabela: "produtos_modulos",
        registroId: modulo.id,
        detalhes: `Removeu o módulo "${modulo.titulo}" de "${produto.titulo}" (exclusão lógica)`,
        dadosAnteriores: { titulo: modulo.titulo, ordem: modulo.ordem, status: modulo.status },
      });
    });
    return null;
  });
}

export async function acaoReordenarModulos(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ produtoId: idSchema, itens: novaOrdemSchema }).parse(entrada);
    return db.transaction(async (tx) => {
      const p = await travarProduto(tx, criador.id, e.produtoId);
      const r = await reordenar(tx, MODULOS, { paiId: p.id, criadorId: criador.id, autorId: usuario.id, itens: e.itens });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "reordenar",
        tabela: "produtos_modulos",
        registroId: p.id,
        detalhes: `Reordenou os módulos de "${p.titulo}"`,
        dadosAnteriores: { ordem: r.antes },
        dadosNovos: { ordem: r.depois },
      });
      // Todos os irmaos ficam com esta versao: a tela segue arrastando sem recarregar.
      return { versao: r.versao.toISOString() };
    });
  });
}

export async function acaoCriarAula(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ moduloId: idSchema, titulo: tituloSchema }).parse(entrada);
    return db.transaction(async (tx) => {
      const { produto, modulo } = await travarModulo(tx, criador.id, e.moduloId);
      const ordem = await proximaOrdem(tx, AULAS, modulo.id, criador.id);
      const [a] = await tx
        .insert(produtos_modulos_aulas)
        .values({ criador_id: criador.id, modulo_id: modulo.id, ordem, titulo: e.titulo, modified_by: usuario.id })
        .returning({ id: produtos_modulos_aulas.id });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "criar",
        tabela: "produtos_modulos_aulas",
        registroId: a.id,
        detalhes: `Criou a aula "${e.titulo}" no módulo "${modulo.titulo}" de "${produto.titulo}" (posição ${ordem})`,
        dadosNovos: { modulo_id: modulo.id, titulo: e.titulo, ordem },
      });
      return { id: a.id, produtoId: produto.id };
    });
  });
}

/**
 * Soft delete da aula com os materiais (arquivos descartados). Recusa se ela e pre-requisito de
 * outra aula ou se o produto publicado ficaria sem aula. Fecha o buraco na ordem.
 */
export async function acaoRemoverAula(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ aulaId: idSchema, versao: versaoSchema }).parse(entrada);
    const descartados: (string | null)[] = [];
    await db.transaction(async (tx) => {
      const [alvo] = await tx
        .select({ moduloId: produtos_modulos_aulas.modulo_id })
        .from(produtos_modulos_aulas)
        .where(and(eq(produtos_modulos_aulas.id, e.aulaId), eq(produtos_modulos_aulas.criador_id, criador.id), vivos(produtos_modulos_aulas)));
      if (!alvo) throw new ErroDeNegocio(MSG_COLISAO);
      const { produto, modulo } = await travarModulo(tx, criador.id, alvo.moduloId);
      const [dependente] = await tx
        .select({ titulo: produtos_modulos_aulas.titulo })
        .from(produtos_modulos_aulas)
        .where(and(eq(produtos_modulos_aulas.pre_requisito_aula_id, e.aulaId), eq(produtos_modulos_aulas.criador_id, criador.id), vivos(produtos_modulos_aulas)))
        .limit(1);
      if (dependente) throw new ErroDeNegocio(`Esta aula é pré-requisito de "${dependente.titulo}". Troque o pré-requisito de lá antes.`);
      const [aula] = await tx
        .update(produtos_modulos_aulas)
        .set(marcaDeExclusao(usuario.id))
        .where(and(travaDeColisao(produtos_modulos_aulas, e.aulaId, e.versao), eq(produtos_modulos_aulas.criador_id, criador.id)))
        .returning();
      if (!aula) throw new ErroDeNegocio(MSG_COLISAO);
      const materiais = await tx
        .update(produtos_modulos_aulas_materiais)
        .set(marcaDeExclusao(usuario.id))
        .where(and(eq(produtos_modulos_aulas_materiais.aula_id, aula.id), eq(produtos_modulos_aulas_materiais.criador_id, criador.id), vivos(produtos_modulos_aulas_materiais)))
        .returning({ arquivo: produtos_modulos_aulas_materiais.arquivo_id });
      for (const arquivoId of [aula.thumb_arquivo_id, ...materiais.map((m) => m.arquivo)].filter((x): x is string => !!x)) {
        descartados.push(await descartarArquivo(tx, { criadorId: criador.id, arquivoId, autorId: usuario.id, motivo: `aula "${aula.titulo}" removida` }));
      }
      await compactar(tx, AULAS, modulo.id, criador.id);
      await garantirPublicavel(tx, criador.id, produto);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "excluir",
        tabela: "produtos_modulos_aulas",
        registroId: aula.id,
        detalhes: `Removeu a aula "${aula.titulo}" do módulo "${modulo.titulo}" com ${materiais.length} material(is) (exclusão lógica)`,
        dadosAnteriores: { titulo: aula.titulo, ordem: aula.ordem, modulo_id: modulo.id },
      });
    });
    await apagarObjetosDescartados(criador.id, descartados);
    return null;
  });
}

export async function acaoReordenarAulas(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ moduloId: idSchema, itens: novaOrdemSchema }).parse(entrada);
    return db.transaction(async (tx) => {
      const { modulo } = await travarModulo(tx, criador.id, e.moduloId);
      const r = await reordenar(tx, AULAS, { paiId: modulo.id, criadorId: criador.id, autorId: usuario.id, itens: e.itens });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "reordenar",
        tabela: "produtos_modulos_aulas",
        registroId: modulo.id,
        detalhes: `Reordenou as aulas do módulo "${modulo.titulo}"`,
        dadosAnteriores: { ordem: r.antes },
        dadosNovos: { ordem: r.depois },
      });
      // Todos os irmaos ficam com esta versao: a tela segue arrastando sem recarregar.
      return { versao: r.versao.toISOString() };
    });
  });
}
