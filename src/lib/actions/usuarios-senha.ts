"use server";

import { z } from "zod";
import { executar } from "@/lib/acao";
import { exigirSessao } from "@/lib/auth/autorizacao";
import { emitirLinkDeSenha } from "@/lib/auth/link-de-senha";

/**
 * A equipe gera o link de primeiro acesso / redefinicao de senha e ele volta para a TELA
 * (a tela que usa vem no proximo passo). Quem pode para quem: link-de-senha-regra.ts.
 * Devolve a URL uma vez; ela nao e gravada em lugar nenhum (nem na trilha, nem em log).
 */
export async function acaoGerarLinkDeSenha(entrada: unknown) {
  return executar(async () => {
    const ator = await exigirSessao();
    const e = z
      .strictObject({
        usuarioId: z.uuid("Usuário inválido."),
        motivo: z.string().trim().min(5, "Descreva o motivo (mínimo de 5 caracteres).").max(300),
      })
      .parse(entrada);
    const link = await emitirLinkDeSenha(ator, e.usuarioId, e.motivo);
    return { url: link.url, expiraEm: link.expiraEm.toISOString() };
  });
}
