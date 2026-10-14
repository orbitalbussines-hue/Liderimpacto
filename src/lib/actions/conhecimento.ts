"use server";

import { and, eq } from "drizzle-orm";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { configDoAssistente, produtosDaBusca } from "@/lib/assistente/config";
import { LIMITES_ASSISTENTE } from "@/lib/assistente/regras";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { recuperarTrechos } from "@/lib/conhecimento/busca";
import { indexarTexto } from "@/lib/conhecimento/indexar";
import { ROTULO_FONTE } from "@/lib/conhecimento/regras";
import { db, type Transacao } from "@/lib/db";
import { criadores_conhecimento_documentos as documentos, criadores_conhecimento_documentos_trechos as trechos, produtos } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { criarTextoSchema, incluirDocumentoSchema, salvarTextoSchema, testarBuscaSchema, versaoDocumentoSchema } from "@/lib/validators/ia";

/**
 * Base de conhecimento (ADR-0014, RN-190 a RN-192). DONO e ADMIN, criador do HOST. Textos da
 * equipe: criar, editar, excluir (lógico) — os trechos são refeitos NA MESMA transação (texto puro,
 * sem I/O). Qualquer fonte pode ser ligada/desligada ("incluir"). Trilha sem o conteúdo inteiro.
 * Documento de outro criador = colisão/"não encontrado".
 */

async function conferirProduto(tx: Transacao, criadorId: string, produtoId: string | null): Promise<string | null> {
  if (!produtoId) return null;
  const [p] = await tx.select({ titulo: produtos.titulo }).from(produtos).where(and(eq(produtos.id, produtoId), eq(produtos.criador_id, criadorId), vivos(produtos)));
  if (!p) throw new ErroDeNegocio("Curso não encontrado nesta área.");
  return p.titulo;
}

export async function acaoCriarTexto(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = criarTextoSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const curso = await conferirProduto(tx, criador.id, e.produtoId);
      const [d] = await tx
        .insert(documentos)
        .values({ criador_id: criador.id, fonte: "TEXTO", produto_id: e.produtoId, titulo: e.titulo, texto: e.texto, modified_by: usuario.id })
        .returning({ id: documentos.id, updated_at: documentos.updated_at });
      await indexarTexto(tx, { id: d.id, criadorId: criador.id, titulo: e.titulo, texto: e.texto }, usuario.id);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "criar",
        tabela: "criadores_conhecimento_documentos",
        registroId: d.id,
        detalhes: `Criou o texto "${e.titulo}" na Base de conhecimento${curso ? ` (só do curso "${curso}")` : ""}`,
        dadosNovos: { titulo: e.titulo, produto_id: e.produtoId, caracteres: e.texto.length },
      });
      return { id: d.id, versao: d.updated_at.toISOString() };
    });
  });
}

export async function acaoSalvarTexto(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = salvarTextoSchema.parse(entrada);
    return db.transaction(async (tx) => {
      await conferirProduto(tx, criador.id, e.produtoId);
      const [antes] = await tx
        .select({ titulo: documentos.titulo, texto: documentos.texto, produto: documentos.produto_id })
        .from(documentos)
        .where(and(eq(documentos.id, e.documentoId), eq(documentos.criador_id, criador.id), eq(documentos.fonte, "TEXTO"), vivos(documentos)));
      if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
      const [d] = await tx
        .update(documentos)
        .set({ titulo: e.titulo, texto: e.texto, produto_id: e.produtoId, updated_at: new Date(), modified_by: usuario.id })
        .where(and(travaDeColisao(documentos, e.documentoId, e.versao), eq(documentos.criador_id, criador.id), eq(documentos.fonte, "TEXTO")))
        .returning({ updated_at: documentos.updated_at });
      if (!d) throw new ErroDeNegocio(MSG_COLISAO);
      await indexarTexto(tx, { id: e.documentoId, criadorId: criador.id, titulo: e.titulo, texto: e.texto }, usuario.id);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "criadores_conhecimento_documentos",
        registroId: e.documentoId,
        detalhes: `Alterou o texto "${antes.titulo}" da Base de conhecimento`,
        dadosAnteriores: { titulo: antes.titulo, produto_id: antes.produto, caracteres: antes.texto.length },
        dadosNovos: { titulo: e.titulo, produto_id: e.produtoId, caracteres: e.texto.length },
      });
      return { versao: d.updated_at.toISOString() };
    });
  });
}

export async function acaoExcluirTexto(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = versaoDocumentoSchema.parse(entrada);
    await db.transaction(async (tx) => {
      const [d] = await tx
        .update(documentos)
        .set(marcaDeExclusao(usuario.id))
        .where(and(travaDeColisao(documentos, e.documentoId, e.versao), eq(documentos.criador_id, criador.id), eq(documentos.fonte, "TEXTO")))
        .returning({ titulo: documentos.titulo, produto: documentos.produto_id });
      if (!d) throw new ErroDeNegocio(MSG_COLISAO);
      await tx.update(trechos).set(marcaDeExclusao(usuario.id)).where(and(eq(trechos.documento_id, e.documentoId), eq(trechos.criador_id, criador.id), vivos(trechos)));
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "excluir",
        tabela: "criadores_conhecimento_documentos",
        registroId: e.documentoId,
        detalhes: `Excluiu o texto "${d.titulo}" da Base de conhecimento (exclusão lógica)`,
        dadosAnteriores: { titulo: d.titulo, produto_id: d.produto },
      });
    });
    return null;
  });
}

/** Liga/desliga qualquer fonte: desligada fica na lista, mas o assistente não a recebe. */
export async function acaoIncluirDocumento(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = incluirDocumentoSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const [d] = await tx
        .update(documentos)
        .set({ incluir: e.incluir, updated_at: new Date(), modified_by: usuario.id })
        .where(and(travaDeColisao(documentos, e.documentoId, e.versao), eq(documentos.criador_id, criador.id)))
        .returning({ titulo: documentos.titulo, fonte: documentos.fonte, updated_at: documentos.updated_at });
      if (!d) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "criadores_conhecimento_documentos",
        registroId: e.documentoId,
        detalhes: `${e.incluir ? "Incluiu" : "Tirou"} "${d.titulo}" (${ROTULO_FONTE[d.fonte]}) ${e.incluir ? "na" : "da"} Base de conhecimento`,
        dadosAnteriores: { incluir: !e.incluir },
        dadosNovos: { incluir: e.incluir },
      });
      return { versao: d.updated_at.toISOString() };
    });
  });
}

/**
 * "Testar busca": os trechos que o assistente RECEBERIA para a pergunta (cursos em que ele aparece,
 * acesso de equipe). Não chama o modelo, não gasta cota.
 */
export async function acaoTestarBusca(entrada: unknown) {
  return executar(async () => {
    const { criador, membro } = await exigirMembro(EQUIPE);
    const e = testarBuscaSchema.parse(entrada);
    const config = await configDoAssistente(criador.id);
    const lista = await recuperarTrechos(
      criador.id,
      { papel: membro.papel, membroId: membro.id },
      e.pergunta,
      { produtos: produtosDaBusca(config), limite: LIMITES_ASSISTENTE.trechos, porDocumento: LIMITES_ASSISTENTE.trechosPorDocumento },
    );
    return lista.map((t, i) => ({
      n: i + 1,
      fonte: ROTULO_FONTE[t.fonte],
      titulo: t.titulo,
      curso: t.produtoTitulo,
      texto: t.texto,
      inicioSeg: t.inicioSeg,
      aulaId: t.aulaId,
      relevancia: Math.round(t.relevancia * 1000) / 1000,
    }));
  });
}
