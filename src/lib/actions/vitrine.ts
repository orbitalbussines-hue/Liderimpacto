"use server";

import { and, eq, inArray, max } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { db, type Transacao } from "@/lib/db";
import { arquivos, criadores_grupos, criadores_vitrines as vitrines, criadores_vitrines_versoes as versoes, produtos, produtos_modulos_aulas } from "@/lib/db/schema";
import { MSG_COLISAO, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { etiquetaVitrine } from "@/lib/vitrine/cache";
import { configVitrineSchema, referenciasDaConfig, resumoDaMudanca, type ConfigVitrine } from "@/lib/vitrine/config";
import { buscarConteudos, configDoBanco, publicadaAgora, rascunhoPadrao } from "@/lib/vitrine/dados";

/**
 * Construtor da vitrine — equipe (DONO e ADMIN), criador do HOST (RN-135 a RN-138, ADR-0010):
 * autosave do rascunho com trava, publicar (nova versão imutável), reverter (versão antiga →
 * rascunho, sem publicar), descartar (rascunho ← última publicada) e busca de conteúdo.
 */

const MSG_REF = "A vitrine aponta para um curso, aula, grupo ou imagem que não é desta área. Recarregue a página.";
const MSG_RASCUNHO_ALTERADO = "Outra pessoa alterou a vitrine. Recarregue a página para ver a versão atual.";

const versaoRascunhoSchema = z.iso.datetime({ offset: true, message: "Versão do rascunho inválida." }).nullable();
const salvarSchema = z.strictObject({ versao: versaoRascunhoSchema, config: configVitrineSchema });
const publicarSchema = z.strictObject({ versao: versaoRascunhoSchema });
const reverterSchema = z.strictObject({ versao: versaoRascunhoSchema, numero: z.number().int().min(1, "Versão inválida.") });
const buscaSchema = z.strictObject({ termo: z.string().trim().min(2, "Digite ao menos 2 letras.").max(60, "Busca muito longa.") });
const imagemSchema = z.strictObject({ arquivoId: z.uuid("Arquivo inválido.") });

/**
 * Toda referência do JSON é DESTE criador (curso, aula, grupo; imagem IMAGEM disponível). Removida
 * depois não reprova (uma versão antiga revertida continua salvável; a resolução a esconde).
 */
async function validarReferencias(tx: Transacao, criadorId: string, c: ConfigVitrine) {
  const r = referenciasDaConfig(c);
  const conta = async (n: number, consulta: () => Promise<unknown[]>) => {
    if (n && (await consulta()).length !== n) throw new ErroDeNegocio(MSG_REF);
  };
  await conta(r.produtos.length, () => tx.select({ id: produtos.id }).from(produtos).where(and(eq(produtos.criador_id, criadorId), inArray(produtos.id, r.produtos))));
  await conta(r.aulas.length, () =>
    tx.select({ id: produtos_modulos_aulas.id }).from(produtos_modulos_aulas).where(and(eq(produtos_modulos_aulas.criador_id, criadorId), inArray(produtos_modulos_aulas.id, r.aulas))),
  );
  await conta(r.grupos.length, () => tx.select({ id: criadores_grupos.id }).from(criadores_grupos).where(and(eq(criadores_grupos.criador_id, criadorId), inArray(criadores_grupos.id, r.grupos))));
  if (r.imagem)
    await conta(1, () =>
      tx
        .select({ id: arquivos.id })
        .from(arquivos)
        .where(and(eq(arquivos.id, r.imagem!), eq(arquivos.criador_id, criadorId), eq(arquivos.finalidade, "IMAGEM"), eq(arquivos.status, "DISPONIVEL"))),
    );
}

/** Rascunho travado (FOR UPDATE) conferindo a versão que a tela tem (`null` = a tela nunca viu linha). */
async function travarRascunho(tx: Transacao, criadorId: string, versao: string | null) {
  const [linha] = await tx
    .select()
    .from(vitrines)
    .where(and(eq(vitrines.criador_id, criadorId), vivos(vitrines)))
    .for("update");
  const iguais = linha ? versao !== null && linha.updated_at.getTime() === new Date(versao).getTime() : versao === null;
  if (!iguais) throw new ErroDeNegocio(MSG_RASCUNHO_ALTERADO);
  return linha ?? null;
}

/** Grava o rascunho (cria na 1ª vez) com trava; trilha com o resumo do que mudou. */
async function gravarRascunho(tx: Transacao, p: { criadorId: string; usuarioId: string; versao: string | null; config: ConfigVitrine; detalhe: string }) {
  const linha = await travarRascunho(tx, p.criadorId, p.versao);
  const agora = new Date();
  let id: string;
  if (!linha) {
    const [n] = await tx.insert(vitrines).values({ criador_id: p.criadorId, rascunho: p.config, modified_by: p.usuarioId, created_at: agora, updated_at: agora }).returning({ id: vitrines.id });
    id = n.id;
  } else {
    const [l] = await tx
      .update(vitrines)
      .set({ rascunho: p.config, updated_at: agora, modified_by: p.usuarioId })
      .where(and(travaDeColisao(vitrines, linha.id, linha.updated_at), eq(vitrines.criador_id, p.criadorId)))
      .returning({ id: vitrines.id });
    if (!l) throw new ErroDeNegocio(MSG_COLISAO);
    id = l.id;
  }
  const anterior = linha ? configDoBanco(linha.rascunho, "rascunho") : null;
  await registrarAuditoria(tx, {
    userId: p.usuarioId,
    criadorId: p.criadorId,
    acao: linha ? "atualizar" : "criar",
    tabela: "criadores_vitrines",
    registroId: id,
    detalhes: `${p.detalhe}${anterior ? `: ${resumoDaMudanca(anterior, p.config)}` : ""}`.slice(0, 2000),
  });
  return { id, versao: agora.toISOString() };
}

/** Autosave do construtor. Conflito = "outra pessoa alterou" (a tela pede para recarregar). */
export async function acaoSalvarRascunhoVitrine(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = salvarSchema.parse(entrada);
    return db.transaction(async (tx) => {
      await validarReferencias(tx, criador.id, e.config);
      const r = await gravarRascunho(tx, { criadorId: criador.id, usuarioId: usuario.id, versao: e.versao, config: e.config, detalhe: "Editou o rascunho da vitrine" });
      return { versao: r.versao };
    });
  });
}

/** Publicar: copia o rascunho (o que a tela tem, pela trava) para a versão n+1, imutável. */
export async function acaoPublicarVitrine(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = publicarSchema.parse(entrada);
    const r = await db.transaction(async (tx) => {
      let linha = await travarRascunho(tx, criador.id, e.versao);
      let versao = e.versao;
      if (!linha) {
        // Nunca editado: publica o padrão materializado (cria a linha do rascunho antes).
        const criado = await gravarRascunho(tx, { criadorId: criador.id, usuarioId: usuario.id, versao: null, config: await rascunhoPadrao(criador.id), detalhe: "Criou o rascunho da vitrine (padrão)" });
        [linha] = await tx.select().from(vitrines).where(eq(vitrines.id, criado.id));
        versao = criado.versao;
      }
      const config = configVitrineSchema.parse(linha!.rascunho);
      await validarReferencias(tx, criador.id, config);
      const [{ ultimo }] = await tx.select({ ultimo: max(versoes.numero) }).from(versoes).where(eq(versoes.vitrine_id, linha!.id));
      const numero = (ultimo ?? 0) + 1;
      const [v] = await tx
        .insert(versoes)
        .values({ criador_id: criador.id, vitrine_id: linha!.id, numero, config, publicada_por: usuario.id, modified_by: usuario.id })
        .returning({ id: versoes.id, publicadaEm: versoes.publicada_em });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "publicar",
        tabela: "criadores_vitrines_versoes",
        registroId: v.id,
        detalhes: `Publicou a vitrine (versão ${numero})`,
        dadosNovos: config,
      });
      return { numero, publicadaEm: v.publicadaEm.toISOString(), versao: versao! };
    });
    updateTag(etiquetaVitrine(criador.id));
    return r;
  });
}

/** Reverter: a versão `numero` volta para o RASCUNHO (não publica). */
export async function acaoReverterVitrine(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = reverterSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const [v] = await tx
        .select({ config: versoes.config })
        .from(versoes)
        .where(and(eq(versoes.criador_id, criador.id), eq(versoes.numero, e.numero), vivos(versoes)));
      if (!v) throw new ErroDeNegocio("Versão não encontrada. Recarregue a página.");
      const config = configVitrineSchema.parse(v.config);
      const r = await gravarRascunho(tx, { criadorId: criador.id, usuarioId: usuario.id, versao: e.versao, config, detalhe: `Reverteu o rascunho da vitrine para a versão ${e.numero}` });
      return { versao: r.versao, config };
    });
  });
}

/** Descartar alterações: rascunho ← última publicada (sem publicação: o padrão). */
export async function acaoDescartarRascunhoVitrine(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = publicarSchema.parse(entrada);
    return db.transaction(async (tx) => {
      const config = (await publicadaAgora(criador.id, tx))?.config ?? (await rascunhoPadrao(criador.id));
      const r = await gravarRascunho(tx, { criadorId: criador.id, usuarioId: usuario.id, versao: e.versao, config, detalhe: "Descartou as alterações do rascunho da vitrine" });
      return { versao: r.versao, config };
    });
  });
}

/** Busca de cursos e aulas DESTE criador (itens manuais e alvo de botão). Leitura: sem trilha. */
export async function acaoBuscarConteudoVitrine(entrada: unknown) {
  return executar(async () => {
    const { criador } = await exigirMembro(EQUIPE);
    const e = buscaSchema.parse(entrada);
    return buscarConteudos(criador.id, e.termo);
  });
}

/** Imagem recém-enviada para o destaque: confere que é deste criador e devolve a URL da prévia. */
export async function acaoPrepararImagemDestaque(entrada: unknown) {
  return executar(async () => {
    const { criador } = await exigirMembro(EQUIPE);
    const e = imagemSchema.parse(entrada);
    const [a] = await db
      .select({ chave: arquivos.chave })
      .from(arquivos)
      .where(and(eq(arquivos.id, e.arquivoId), eq(arquivos.criador_id, criador.id), eq(arquivos.finalidade, "IMAGEM"), eq(arquivos.status, "DISPONIVEL"), vivos(arquivos)));
    if (!a) throw new ErroDeNegocio("Imagem inválida ou ainda não confirmada. Envie de novo.");
    return { url: await urlDeImagemOuNula(criador.id, a.chave) };
  });
}
