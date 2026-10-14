"use server";

import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { db } from "@/lib/db";
import { criadores } from "@/lib/db/schema";
import { MSG_COLISAO, travaDeColisao } from "@/lib/db/soft-delete";
import { versaoSchema } from "@/lib/validators/membros";

/** Nome da área: 2 a 80 caracteres, sem caractere de controle (aparece no título e nos e-mails). */
const nomeDaArea = z
  .string()
  .trim()
  .min(2, "O nome precisa de pelo menos 2 caracteres.")
  .max(80, "O nome pode ter no máximo 80 caracteres.")
  .regex(/^[^\p{Cc}]+$/u, "O nome tem caracteres inválidos.");

/**
 * Configurações > Geral (só DONO): renomeia a área do criador do HOST. Trava de colisão pelo
 * `updated_at` do criador (o mesmo da Aparência) e trilha na mesma transação. O endereço (slug)
 * não muda por aqui: trocar quebraria links, cookies e certificados já emitidos.
 */
export async function acaoRenomearArea(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(["DONO"]);
    const e = z.strictObject({ nome: nomeDaArea, versao: versaoSchema }).parse(entrada);
    return db.transaction(async (tx) => {
      const [linha] = await tx
        .update(criadores)
        .set({ nome: e.nome, updated_at: new Date(), modified_by: usuario.id })
        .where(travaDeColisao(criadores, criador.id, e.versao))
        .returning({ updated_at: criadores.updated_at });
      if (!linha) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "criadores",
        registroId: criador.id,
        detalhes: `Nome da área: "${criador.nome}" → "${e.nome}"`,
        dadosAnteriores: { nome: criador.nome },
        dadosNovos: { nome: e.nome },
      });
      return { nome: e.nome, versao: linha.updated_at.toISOString() };
    });
  });
}
