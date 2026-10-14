"use server";

import { z } from "zod";
import { executar } from "@/lib/acao";
import { confirmarEnvio, iniciarEnvio } from "@/lib/armazenamento/envio";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { FINALIDADES_ARQUIVO_CATALOGO } from "@/lib/db/schema/_enums";
import { envioSchema, idSchema } from "@/lib/validators/catalogo";

/**
 * Envio direto ao storage em 3 tempos (o Next nunca recebe o binario):
 *   1. acaoIniciarEnvio  -> allowlist + registro ENVIADO_PENDENTE + URL de PUT assinada (10 min)
 *   2. navegador faz o PUT direto no storage (Content-Type e tamanho presos na assinatura)
 *   3. acaoConfirmarEnvio -> HEAD confere tamanho e tipo -> DISPONIVEL (so entao pode ser usado)
 * DONO e ADMIN, no criador do HOST. O arquivo so vira capa/thumb/material pelas actions do catalogo.
 */

export async function acaoIniciarEnvio(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = envioSchema.parse(entrada);
    return iniciarEnvio({ criadorId: criador.id, usuarioId: usuario.id, finalidade: e.finalidade, nome: e.nome, mime: e.mime, tamanho: e.tamanho });
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
    return confirmarEnvio({ criadorId: criador.id, usuarioId: usuario.id, arquivoId, finalidades: FINALIDADES_ARQUIVO_CATALOGO });
  });
}
