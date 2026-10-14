"use server";

import { and, eq, sql } from "drizzle-orm";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { apagarObjetosDescartados, arquivoParaUsar, descartarArquivo } from "@/lib/armazenamento/arquivos";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { compactar, ITENS_TRILHA, proximaOrdem, reordenar } from "@/lib/catalogo/ordem";
import { db, type Transacao } from "@/lib/db";
import { criadores_trilhas as trilhas, criadores_trilhas_itens as itens, produtos, produtos_avaliacoes } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import {
  adicionarItemTrilhaSchema,
  capaTrilhaSchema,
  criarTrilhaSchema,
  removerItemTrilhaSchema,
  removerTrilhaSchema,
  reordenarItensTrilhaSchema,
  salvarItemTrilhaSchema,
  salvarTrilhaSchema,
  situacaoTrilhaSchema,
} from "@/lib/validators/avaliacoes";

/**
 * Trilhas — equipe (DONO e ADMIN, criador do HOST): CRUD, capa, publicar (exige ≥ 1 item), itens
 * (PRODUTO ou AVALIAÇÃO deste criador) com "exige o anterior" e ordem 1..n com trava. RN-126.
 */

const NAO_ENCONTRADA = "Trilha não encontrada nesta área. Recarregue a página.";

async function travarTrilha(tx: Transacao, criadorId: string, trilhaId: string) {
  const [t] = await tx
    .select()
    .from(trilhas)
    .where(and(eq(trilhas.id, trilhaId), eq(trilhas.criador_id, criadorId), vivos(trilhas)))
    .for("update");
  if (!t) throw new ErroDeNegocio(NAO_ENCONTRADA);
  return t;
}

/** Item vivo deste criador e a trilha dele travada. */
async function travarItem(tx: Transacao, criadorId: string, itemId: string) {
  const [i] = await tx.select({ trilhaId: itens.trilha_id }).from(itens).where(and(eq(itens.id, itemId), eq(itens.criador_id, criadorId), vivos(itens)));
  if (!i) throw new ErroDeNegocio(MSG_COLISAO);
  return travarTrilha(tx, criadorId, i.trilhaId);
}

export async function acaoCriarTrilha(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = criarTrilhaSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const [t] = await tx
        .insert(trilhas)
        .values({ criador_id: criador.id, titulo: e.titulo, descricao: e.descricao, tag: e.tag, modified_by: usuario.id })
        .returning({ id: trilhas.id, updated_at: trilhas.updated_at });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "criar",
        tabela: "criadores_trilhas",
        registroId: t.id,
        detalhes: `Criou a trilha "${e.titulo}" (rascunho)`,
        dadosNovos: { titulo: e.titulo, descricao: e.descricao, tag: e.tag },
      });
      return { id: t.id, versao: t.updated_at.toISOString() };
    });
  });
}

export async function acaoSalvarTrilha(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = salvarTrilhaSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const antes = await travarTrilha(tx, criador.id, e.trilhaId);
      const novo = { titulo: e.campos.titulo, descricao: e.campos.descricao, tag: e.campos.tag };
      const [l] = await tx
        .update(trilhas)
        .set({ ...novo, updated_at: new Date(), modified_by: usuario.id })
        .where(and(travaDeColisao(trilhas, e.trilhaId, e.versao), eq(trilhas.criador_id, criador.id)))
        .returning({ updated_at: trilhas.updated_at });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "criadores_trilhas",
        registroId: antes.id,
        detalhes: `Editou a trilha "${antes.titulo}"`,
        dadosAnteriores: { titulo: antes.titulo, descricao: antes.descricao, tag: antes.tag },
        dadosNovos: novo,
      });
      return { versao: l.updated_at.toISOString() };
    });
  });
}

/** Troca/remove a capa (arquivo IMAGEM já confirmado). A antiga é descartada (objeto apagado depois do commit). */
export async function acaoDefinirCapaTrilha(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = capaTrilhaSchema.parse(entrada);
    const descartados: (string | null)[] = [];
    const r = await db.transaction(async (tx) => {
      const antes = await travarTrilha(tx, criador.id, e.trilhaId);
      if (e.arquivoId) await arquivoParaUsar(tx, criador.id, e.arquivoId, "IMAGEM");
      const [l] = await tx
        .update(trilhas)
        .set({ capa_arquivo_id: e.arquivoId, updated_at: new Date(), modified_by: usuario.id })
        .where(and(travaDeColisao(trilhas, e.trilhaId, e.versao), eq(trilhas.criador_id, criador.id)))
        .returning({ updated_at: trilhas.updated_at });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      if (antes.capa_arquivo_id && antes.capa_arquivo_id !== e.arquivoId) {
        descartados.push(await descartarArquivo(tx, { criadorId: criador.id, arquivoId: antes.capa_arquivo_id, autorId: usuario.id, motivo: `capa da trilha "${antes.titulo}" trocada` }));
      }
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "criadores_trilhas",
        registroId: antes.id,
        detalhes: `Capa da trilha "${antes.titulo}" ${e.arquivoId ? "definida" : "removida"}`,
        dadosAnteriores: { capa_arquivo_id: antes.capa_arquivo_id },
        dadosNovos: { capa_arquivo_id: e.arquivoId },
      });
      return { versao: l.updated_at.toISOString() };
    });
    await apagarObjetosDescartados(criador.id, descartados);
    return r;
  });
}

export async function acaoAlterarSituacaoTrilha(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = situacaoTrilhaSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const antes = await travarTrilha(tx, criador.id, e.trilhaId);
      if (e.status === "PUBLICADA") {
        const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(itens).where(and(eq(itens.trilha_id, antes.id), vivos(itens)));
        if (n === 0) throw new ErroDeNegocio("Para publicar, adicione ao menos 1 etapa à trilha.");
      }
      const agora = new Date();
      const [l] = await tx
        .update(trilhas)
        .set({ status: e.status, publicada_em: e.status === "PUBLICADA" ? (antes.publicada_em ?? agora) : antes.publicada_em, updated_at: agora, modified_by: usuario.id })
        .where(and(travaDeColisao(trilhas, e.trilhaId, e.versao), eq(trilhas.criador_id, criador.id)))
        .returning({ updated_at: trilhas.updated_at });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "publicar",
        tabela: "criadores_trilhas",
        registroId: antes.id,
        detalhes: `Trilha "${antes.titulo}": ${antes.status} → ${e.status}`,
        dadosAnteriores: { status: antes.status },
        dadosNovos: { status: e.status },
      });
      return { versao: l.updated_at.toISOString() };
    });
  });
}

/** Soft delete da trilha e dos itens; a capa é descartada. */
export async function acaoRemoverTrilha(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = removerTrilhaSchema.parse(entrada);
    const descartados: (string | null)[] = [];
    await db.transaction(async (tx) => {
      const antes = await travarTrilha(tx, criador.id, e.trilhaId);
      const [l] = await tx
        .update(trilhas)
        .set(marcaDeExclusao(usuario.id))
        .where(and(travaDeColisao(trilhas, e.trilhaId, e.versao), eq(trilhas.criador_id, criador.id)))
        .returning({ id: trilhas.id });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      const r = await tx.update(itens).set(marcaDeExclusao(usuario.id)).where(and(eq(itens.trilha_id, antes.id), vivos(itens))).returning({ id: itens.id });
      if (antes.capa_arquivo_id) descartados.push(await descartarArquivo(tx, { criadorId: criador.id, arquivoId: antes.capa_arquivo_id, autorId: usuario.id, motivo: `trilha "${antes.titulo}" removida` }));
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "excluir",
        tabela: "criadores_trilhas",
        registroId: antes.id,
        detalhes: `Removeu a trilha "${antes.titulo}" com ${r.length} etapa(s) (exclusão lógica)`,
        dadosAnteriores: { titulo: antes.titulo, status: antes.status },
      });
    });
    await apagarObjetosDescartados(criador.id, descartados);
    return null;
  });
}

/** Adiciona uma etapa no fim: curso ou avaliação DESTE criador, sem repetir na mesma trilha. */
export async function acaoAdicionarItemTrilha(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = adicionarItemTrilhaSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const t = await travarTrilha(tx, criador.id, e.trilhaId);
      const alvo =
        e.tipo === "PRODUTO"
          ? (await tx.select({ titulo: produtos.titulo }).from(produtos).where(and(eq(produtos.id, e.produtoId), eq(produtos.criador_id, criador.id), vivos(produtos))))[0]
          : (await tx.select({ titulo: produtos_avaliacoes.titulo }).from(produtos_avaliacoes).where(and(eq(produtos_avaliacoes.id, e.avaliacaoId), eq(produtos_avaliacoes.criador_id, criador.id), vivos(produtos_avaliacoes))))[0];
      if (!alvo) throw new ErroDeNegocio(e.tipo === "PRODUTO" ? "Curso não encontrado nesta área." : "Avaliação não encontrada nesta área.");
      const produtoId = e.tipo === "PRODUTO" ? e.produtoId : null;
      const avaliacaoId = e.tipo === "AVALIACAO" ? e.avaliacaoId : null;
      const [repetido] = await tx
        .select({ id: itens.id })
        .from(itens)
        .where(and(eq(itens.trilha_id, t.id), vivos(itens), produtoId ? eq(itens.produto_id, produtoId) : eq(itens.avaliacao_id, avaliacaoId!)));
      if (repetido) throw new ErroDeNegocio(`"${alvo.titulo}" já está nesta trilha.`);
      const ordem = await proximaOrdem(tx, ITENS_TRILHA, t.id, criador.id);
      const [i] = await tx
        .insert(itens)
        .values({ criador_id: criador.id, trilha_id: t.id, ordem, tipo: e.tipo, produto_id: produtoId, avaliacao_id: avaliacaoId, exige_anterior: e.exigeAnterior, modified_by: usuario.id })
        .returning({ id: itens.id, updated_at: itens.updated_at });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "criar",
        tabela: "criadores_trilhas_itens",
        registroId: i.id,
        detalhes: `Adicionou "${alvo.titulo}" à trilha "${t.titulo}" (etapa ${ordem})`,
        dadosNovos: { tipo: e.tipo, produto_id: produtoId, avaliacao_id: avaliacaoId, ordem, exige_anterior: e.exigeAnterior },
      });
      return { id: i.id, versao: i.updated_at.toISOString() };
    });
  });
}

export async function acaoSalvarItemTrilha(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = salvarItemTrilhaSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const t = await travarItem(tx, criador.id, e.itemId);
      const [l] = await tx
        .update(itens)
        .set({ exige_anterior: e.exigeAnterior, updated_at: new Date(), modified_by: usuario.id })
        .where(and(travaDeColisao(itens, e.itemId, e.versao), eq(itens.criador_id, criador.id)))
        .returning({ updated_at: itens.updated_at, ordem: itens.ordem });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "criadores_trilhas_itens",
        registroId: e.itemId,
        detalhes: `Etapa ${l.ordem} da trilha "${t.titulo}": exige a anterior = ${e.exigeAnterior ? "sim" : "não"}`,
        dadosNovos: { exige_anterior: e.exigeAnterior },
      });
      return { versao: l.updated_at.toISOString() };
    });
  });
}

/** Remove a etapa e fecha o buraco. Trilha publicada não fica vazia. */
export async function acaoRemoverItemTrilha(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = removerItemTrilhaSchema.parse(entrada);
    await db.transaction(async (tx) => {
      const t = await travarItem(tx, criador.id, e.itemId);
      const [l] = await tx
        .update(itens)
        .set(marcaDeExclusao(usuario.id))
        .where(and(travaDeColisao(itens, e.itemId, e.versao), eq(itens.criador_id, criador.id)))
        .returning({ ordem: itens.ordem, tipo: itens.tipo, produto_id: itens.produto_id, avaliacao_id: itens.avaliacao_id });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(itens).where(and(eq(itens.trilha_id, t.id), vivos(itens)));
      if (n === 0 && t.status === "PUBLICADA") throw new ErroDeNegocio("Trilha publicada precisa de ao menos 1 etapa. Volte-a para rascunho antes.");
      await compactar(tx, ITENS_TRILHA, t.id, criador.id);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "excluir",
        tabela: "criadores_trilhas_itens",
        registroId: e.itemId,
        detalhes: `Removeu a etapa ${l.ordem} da trilha "${t.titulo}" (exclusão lógica)`,
        dadosAnteriores: l,
      });
    });
    return null;
  });
}

export async function acaoReordenarItensTrilha(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = reordenarItensTrilhaSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const t = await travarTrilha(tx, criador.id, e.trilhaId);
      const r = await reordenar(tx, ITENS_TRILHA, { paiId: t.id, criadorId: criador.id, autorId: usuario.id, itens: e.itens });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "reordenar",
        tabela: "criadores_trilhas_itens",
        registroId: t.id,
        detalhes: `Reordenou as etapas da trilha "${t.titulo}"`,
        dadosAnteriores: { ordem: r.antes },
        dadosNovos: { ordem: r.depois },
      });
      return { versao: r.versao.toISOString() };
    });
  });
}
