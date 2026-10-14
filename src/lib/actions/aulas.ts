"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { apagarObjetosDescartados, arquivoParaUsar, descartarArquivo } from "@/lib/armazenamento/arquivos";
import { urlDeLeitura } from "@/lib/armazenamento/cliente";
import { ALLOWLIST, extensaoDe } from "@/lib/armazenamento/regras";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro, MSG_SEM_PERMISSAO } from "@/lib/auth/autorizacao";
import { EQUIPE, TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { db, type Transacao } from "@/lib/db";
import { arquivos, produtos_modulos, produtos_modulos_aulas, produtos_modulos_aulas_materiais } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { acessoDaAula } from "@/lib/video/acesso-aula";
import {
  capitulosSchema,
  descricaoSchema,
  erroDeCapitulosNaDuracao,
  idSchema,
  liberaEmSchema,
  materialNovoSchema,
  nomeMaterialSchema,
  tituloSchema,
  versaoSchema,
} from "@/lib/validators/catalogo";

/**
 * Editor da aula (DONO e ADMIN, criador do HOST): dados, liberacao, pre-requisito, capitulos,
 * thumb e materiais. O VIDEO da aula fica com o pipeline de video (passo 3b).
 */

/** Aula DESTE criador (viva) e o produto dela, travada na versao que a tela abriu. */
async function travarAula(tx: Transacao, criadorId: string, aulaId: string, versao: Date) {
  const [a] = await tx
    .select({ aula: produtos_modulos_aulas, produtoId: produtos_modulos.produto_id })
    .from(produtos_modulos_aulas)
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
    .where(and(travaDeColisao(produtos_modulos_aulas, aulaId, versao), eq(produtos_modulos_aulas.criador_id, criadorId), vivos(produtos_modulos)))
    .for("update", { of: produtos_modulos_aulas });
  if (!a) throw new ErroDeNegocio(MSG_COLISAO);
  return a;
}

/** Produto de uma aula viva deste criador (`null` = nao existe aqui). */
async function produtoDaAula(tx: Transacao, criadorId: string, aulaId: string): Promise<string | null> {
  const [r] = await tx
    .select({ produtoId: produtos_modulos.produto_id, pre: produtos_modulos_aulas.pre_requisito_aula_id })
    .from(produtos_modulos_aulas)
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
    .where(and(eq(produtos_modulos_aulas.id, aulaId), eq(produtos_modulos_aulas.criador_id, criadorId), vivos(produtos_modulos_aulas), vivos(produtos_modulos)));
  return r?.produtoId ?? null;
}

/** Pre-requisito: aula viva do MESMO produto, nao a propria, sem fechar ciclo (A exige B exige A). */
async function conferirPreRequisito(tx: Transacao, criadorId: string, aulaId: string, produtoId: string, preId: string) {
  if (preId === aulaId) throw new ErroDeNegocio("A aula não pode ser pré-requisito de si mesma.");
  if ((await produtoDaAula(tx, criadorId, preId)) !== produtoId) throw new ErroDeNegocio("Pré-requisito inválido: escolha uma aula deste produto.");
  let atual: string | null = preId;
  for (let passos = 0; atual && passos < 1000; passos++) {
    const [r] = await tx
      .select({ pre: produtos_modulos_aulas.pre_requisito_aula_id })
      .from(produtos_modulos_aulas)
      .where(and(eq(produtos_modulos_aulas.id, atual), eq(produtos_modulos_aulas.criador_id, criadorId), vivos(produtos_modulos_aulas)));
    atual = r?.pre ?? null;
    if (atual === aulaId) throw new ErroDeNegocio("Esse pré-requisito fecharia um ciclo (uma aula exigindo a outra).");
  }
}

export async function acaoSalvarAula(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z
      .strictObject({
        aulaId: idSchema,
        versao: versaoSchema,
        titulo: tituloSchema,
        descricao: descricaoSchema,
        liberaEm: liberaEmSchema,
        preRequisitoAulaId: idSchema.nullable(),
        capitulos: capitulosSchema,
      })
      .parse(entrada);
    return db.transaction(async (tx) => {
      const { aula, produtoId } = await travarAula(tx, criador.id, e.aulaId, e.versao);
      if (e.preRequisitoAulaId) await conferirPreRequisito(tx, criador.id, aula.id, produtoId, e.preRequisitoAulaId);
      const erroCapitulos = erroDeCapitulosNaDuracao(e.capitulos, aula.duracao_seg);
      if (erroCapitulos) throw new ErroDeNegocio(erroCapitulos);
      const novo = { titulo: e.titulo, descricao: e.descricao, libera_em: e.liberaEm, pre_requisito_aula_id: e.preRequisitoAulaId, capitulos: e.capitulos };
      const [linha] = await tx
        .update(produtos_modulos_aulas)
        .set({ ...novo, updated_at: new Date(), modified_by: usuario.id })
        .where(and(travaDeColisao(produtos_modulos_aulas, aula.id, e.versao), eq(produtos_modulos_aulas.criador_id, criador.id)))
        .returning({ updated_at: produtos_modulos_aulas.updated_at });
      if (!linha) throw new ErroDeNegocio(MSG_COLISAO);
      const mudou = (Object.keys(novo) as (keyof typeof novo)[]).filter((k) => JSON.stringify(aula[k]) !== JSON.stringify(novo[k]));
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "produtos_modulos_aulas",
        registroId: aula.id,
        detalhes: `Alterou a aula "${aula.titulo}" (${mudou.join(", ") || "sem mudanças"})`,
        dadosAnteriores: Object.fromEntries(mudou.map((k) => [k, aula[k]])),
        dadosNovos: Object.fromEntries(mudou.map((k) => [k, novo[k]])),
      });
      return { versao: linha.updated_at.toISOString() };
    });
  });
}

/** Define, troca ou remove (arquivoId nulo) a thumb da aula. A anterior e descartada. */
export async function acaoDefinirThumbAula(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ aulaId: idSchema, versao: versaoSchema, arquivoId: idSchema.nullable() }).parse(entrada);
    const descartada: (string | null)[] = [];
    const r = await db.transaction(async (tx) => {
      const { aula } = await travarAula(tx, criador.id, e.aulaId, e.versao);
      if (e.arquivoId) await arquivoParaUsar(tx, criador.id, e.arquivoId, "IMAGEM");
      const [linha] = await tx
        .update(produtos_modulos_aulas)
        .set({ thumb_arquivo_id: e.arquivoId, updated_at: new Date(), modified_by: usuario.id })
        .where(travaDeColisao(produtos_modulos_aulas, aula.id, e.versao))
        .returning({ updated_at: produtos_modulos_aulas.updated_at });
      if (!linha) throw new ErroDeNegocio(MSG_COLISAO);
      const anterior = aula.thumb_arquivo_id;
      if (anterior && anterior !== e.arquivoId) {
        descartada.push(await descartarArquivo(tx, { criadorId: criador.id, arquivoId: anterior, autorId: usuario.id, motivo: "thumb da aula substituída" }));
      }
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "produtos_modulos_aulas",
        registroId: aula.id,
        detalhes: `${e.arquivoId ? (anterior ? "Trocou" : "Definiu") : "Removeu"} a thumb da aula "${aula.titulo}"`,
        dadosAnteriores: { thumb_arquivo_id: anterior },
        dadosNovos: { thumb_arquivo_id: e.arquivoId },
      });
      return { versao: linha.updated_at.toISOString() };
    });
    await apagarObjetosDescartados(criador.id, descartada);
    return r;
  });
}

/** Material novo: arquivo ja confirmado (tipo PDF/DOC pelo MIME) ou link https. */
export async function acaoAdicionarMaterial(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = materialNovoSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const [aula] = await tx
        .select({ id: produtos_modulos_aulas.id, titulo: produtos_modulos_aulas.titulo })
        .from(produtos_modulos_aulas)
        .where(and(eq(produtos_modulos_aulas.id, e.aulaId), eq(produtos_modulos_aulas.criador_id, criador.id), vivos(produtos_modulos_aulas)))
        .for("update");
      if (!aula) throw new ErroDeNegocio("Aula não encontrada nesta área. Recarregue a página.");
      let origem: { tipo: "PDF" | "DOC" | "LINK"; arquivo_id: string | null; url: string | null };
      if ("arquivoId" in e) {
        const arq = await arquivoParaUsar(tx, criador.id, e.arquivoId, "MATERIAL");
        const tipo = ALLOWLIST.MATERIAL.tipos.find((t) => t.mime === arq.mime)?.material;
        if (!tipo) throw new ErroDeNegocio("Tipo de material não aceito.");
        origem = { tipo, arquivo_id: arq.id, url: null };
      } else {
        origem = { tipo: "LINK", arquivo_id: null, url: e.url };
      }
      const [m] = await tx
        .insert(produtos_modulos_aulas_materiais)
        .values({ criador_id: criador.id, aula_id: aula.id, nome: e.nome, ...origem, modified_by: usuario.id })
        .returning({ id: produtos_modulos_aulas_materiais.id });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "criar",
        tabela: "produtos_modulos_aulas_materiais",
        registroId: m.id,
        detalhes: `Adicionou o material "${e.nome}" (${origem.tipo}) à aula "${aula.titulo}"`,
        dadosNovos: { nome: e.nome, ...origem },
      });
      return { id: m.id };
    });
  });
}

const doMaterial = (criadorId: string, materialId: string, versao: Date) =>
  and(travaDeColisao(produtos_modulos_aulas_materiais, materialId, versao), eq(produtos_modulos_aulas_materiais.criador_id, criadorId));

export async function acaoRenomearMaterial(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ materialId: idSchema, versao: versaoSchema, nome: nomeMaterialSchema }).parse(entrada);
    return db.transaction(async (tx) => {
      const [antes] = await tx.select({ nome: produtos_modulos_aulas_materiais.nome }).from(produtos_modulos_aulas_materiais).where(doMaterial(criador.id, e.materialId, e.versao)).for("update");
      if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
      const [linha] = await tx
        .update(produtos_modulos_aulas_materiais)
        .set({ nome: e.nome, updated_at: new Date(), modified_by: usuario.id })
        .where(doMaterial(criador.id, e.materialId, e.versao))
        .returning({ updated_at: produtos_modulos_aulas_materiais.updated_at });
      if (!linha) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "produtos_modulos_aulas_materiais",
        registroId: e.materialId,
        detalhes: `Renomeou o material "${antes.nome}" → "${e.nome}"`,
        dadosAnteriores: { nome: antes.nome },
        dadosNovos: { nome: e.nome },
      });
      return { versao: linha.updated_at.toISOString() };
    });
  });
}

/** Soft delete do material; o arquivo dele (se houver) e descartado (registro + objeto). */
export async function acaoRemoverMaterial(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = z.strictObject({ materialId: idSchema, versao: versaoSchema }).parse(entrada);
    const descartado: (string | null)[] = [];
    await db.transaction(async (tx) => {
      const [m] = await tx.update(produtos_modulos_aulas_materiais).set(marcaDeExclusao(usuario.id)).where(doMaterial(criador.id, e.materialId, e.versao)).returning();
      if (!m) throw new ErroDeNegocio(MSG_COLISAO);
      if (m.arquivo_id) {
        descartado.push(await descartarArquivo(tx, { criadorId: criador.id, arquivoId: m.arquivo_id, autorId: usuario.id, motivo: `material "${m.nome}" removido` }));
      }
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "excluir",
        tabela: "produtos_modulos_aulas_materiais",
        registroId: m.id,
        detalhes: `Removeu o material "${m.nome}" (exclusão lógica)`,
        dadosAnteriores: { nome: m.nome, tipo: m.tipo, url: m.url, arquivo_id: m.arquivo_id },
      });
    });
    await apagarObjetosDescartados(criador.id, descartado);
    return null;
  });
}

/**
 * Link CURTO (5 min) para abrir o anexo de um material (sem auditoria: leitura). Equipe sempre;
 * ALUNO só se `podeAssistir` a aula do material (matrícula, liberação, pré-requisito: RN-114/118).
 */
export async function acaoLinkDoMaterial(entrada: unknown) {
  return executar(async () => {
    const { criador, membro } = await exigirMembro(TODOS_OS_MEMBROS);
    const { materialId } = z.strictObject({ materialId: idSchema }).parse(entrada);
    const [m] = await db
      .select({ nome: produtos_modulos_aulas_materiais.nome, chave: arquivos.chave, aulaId: produtos_modulos_aulas_materiais.aula_id })
      .from(produtos_modulos_aulas_materiais)
      .innerJoin(arquivos, eq(arquivos.id, produtos_modulos_aulas_materiais.arquivo_id))
      .where(and(eq(produtos_modulos_aulas_materiais.id, materialId), eq(produtos_modulos_aulas_materiais.criador_id, criador.id), vivos(produtos_modulos_aulas_materiais), vivos(arquivos)));
    if (!m) throw new ErroDeNegocio("Material sem arquivo nesta área.");
    if (membro.papel === "ALUNO" && !(await acessoDaAula(criador.id, m.aulaId, { papel: membro.papel, membroId: membro.id }))?.pode) {
      throw new ErroDeNegocio(MSG_SEM_PERMISSAO);
    }
    const nomeDownload = `${m.nome}.${extensaoDe(m.chave)}`;
    return { url: await urlDeLeitura({ bucket: "arquivos", criadorId: criador.id, chave: m.chave, nomeDownload }) };
  });
}
