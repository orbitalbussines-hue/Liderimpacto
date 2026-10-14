"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { apagarObjetosDescartados } from "@/lib/armazenamento/arquivos";
import { cabecalhoDoObjeto, urlDeEnvio, type UrlDeEnvio } from "@/lib/armazenamento/cliente";
import { chaveDeArquivo, chavePertenceAoCriador, formatarTamanho, validarEnvio } from "@/lib/armazenamento/regras";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { arquivos } from "@/lib/db/schema";
import { marcaDeExclusao, vivos } from "@/lib/db/soft-delete";
import { envioSchema, idSchema } from "@/lib/validators/catalogo";

/**
 * Envio direto ao storage em 3 tempos (o Next nunca recebe o binario):
 *   1. acaoIniciarEnvio  -> allowlist + registro ENVIADO_PENDENTE + URL de PUT assinada (10 min)
 *   2. navegador faz o PUT direto no storage (Content-Type e tamanho presos na assinatura)
 *   3. acaoConfirmarEnvio -> HEAD confere tamanho e tipo -> DISPONIVEL (so entao pode ser usado)
 * DONO e ADMIN, no criador do HOST. O arquivo so vira capa/thumb/material pelas actions do catalogo.
 */

export async function acaoIniciarEnvio(entrada: unknown) {
  return executar(async (): Promise<{ arquivoId: string; envio: UrlDeEnvio }> => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = envioSchema.parse(entrada);
    const { extensao, mime } = validarEnvio(e.finalidade, e);
    const id = randomUUID();
    const chave = chaveDeArquivo(criador.id, e.finalidade, id, extensao);
    await db.transaction(async (tx) => {
      await tx.insert(arquivos).values({
        id,
        criador_id: criador.id,
        chave,
        finalidade: e.finalidade,
        nome_original: e.nome,
        mime,
        tamanho_bytes: e.tamanho,
        status: "ENVIADO_PENDENTE",
        modified_by: usuario.id,
      });
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "criar",
        tabela: "arquivos",
        registroId: id,
        detalhes: `Iniciou o envio de "${e.nome}" (${formatarTamanho(e.tamanho)})`,
        dadosNovos: { finalidade: e.finalidade, mime, tamanho_bytes: e.tamanho, chave },
      });
    });
    return { arquivoId: id, envio: await urlDeEnvio({ bucket: "arquivos", criadorId: criador.id, chave, mime, tamanho: e.tamanho }) };
  });
}

/**
 * Confere o objeto no storage e libera o arquivo. Diferenca de tamanho ou tipo (ou objeto que
 * nao chegou): o registro sai (soft delete) e o objeto e apagado — reenvie.
 */
export async function acaoConfirmarEnvio(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const { arquivoId } = z.strictObject({ arquivoId: idSchema }).parse(entrada);
    const doCriador = and(eq(arquivos.id, arquivoId), eq(arquivos.criador_id, criador.id), vivos(arquivos));
    const [a] = await db.select().from(arquivos).where(and(doCriador, eq(arquivos.status, "ENVIADO_PENDENTE")));
    // Arquivo de outro criador nao e encontrado aqui (filtro do host) — e a chave confere de novo.
    if (!a || !chavePertenceAoCriador(a.chave, criador.id)) throw new ErroDeNegocio("Envio não encontrado. Envie o arquivo de novo.");

    const real = await cabecalhoDoObjeto({ bucket: "arquivos", criadorId: criador.id, chave: a.chave });
    const confere = real !== null && real.tamanho === a.tamanho_bytes && real.mime === a.mime;

    await db.transaction(async (tx) => {
      const [linha] = await tx
        .update(arquivos)
        .set(confere ? { status: "DISPONIVEL", updated_at: new Date(), modified_by: usuario.id } : marcaDeExclusao(usuario.id))
        .where(and(doCriador, eq(arquivos.status, "ENVIADO_PENDENTE")))
        .returning({ id: arquivos.id });
      if (!linha) throw new ErroDeNegocio("Envio já confirmado ou descartado.");
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: confere ? "atualizar" : "excluir",
        tabela: "arquivos",
        registroId: a.id,
        detalhes: confere
          ? `Confirmou o envio de "${a.nome_original}"`
          : `Recusou o envio de "${a.nome_original}": ${real ? "tamanho ou tipo diferente do declarado" : "arquivo não chegou ao armazenamento"}`,
        dadosAnteriores: { status: a.status },
        dadosNovos: confere ? { status: "DISPONIVEL" } : { real },
      });
    });
    if (!confere) {
      if (real) await apagarObjetosDescartados(criador.id, [a.chave]);
      throw new ErroDeNegocio("O arquivo não chegou inteiro ao armazenamento. Envie de novo.");
    }
    return { arquivoId: a.id, nome: a.nome_original, mime: a.mime, tamanho: a.tamanho_bytes };
  });
}
