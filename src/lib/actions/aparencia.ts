"use server";

import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { db } from "@/lib/db";
import { criadores } from "@/lib/db/schema";
import { MSG_COLISAO, travaDeColisao } from "@/lib/db/soft-delete";
import { validarHex } from "@/lib/marca/paleta";
import { versaoSchema } from "@/lib/validators/membros";

/**
 * Cor da marca do criador do HOST (so DONO). Grava o hex normalizado em `criadores.cor_marca`
 * (nulo = dourado padrao); a area do aluno le a coluna no layout a cada requisicao.
 */
export async function acaoSalvarCorDaMarca(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(["DONO"]);
    const e = z
      .strictObject({
        cor: z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, "Cor inválida: use #RGB ou #RRGGBB.").nullable(),
        versao: versaoSchema,
      })
      .parse(entrada);
    const nova = e.cor ? validarHex(e.cor) : null;
    return db.transaction(async (tx) => {
      const [linha] = await tx
        .update(criadores)
        .set({ cor_marca: nova, updated_at: new Date(), modified_by: usuario.id })
        .where(travaDeColisao(criadores, criador.id, e.versao))
        .returning({ updated_at: criadores.updated_at });
      if (!linha) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "criadores",
        registroId: criador.id,
        detalhes: `Cor da marca: ${criador.cor_marca ?? "padrão"} → ${nova ?? "padrão"}`,
        dadosAnteriores: { cor_marca: criador.cor_marca },
        dadosNovos: { cor_marca: nova },
      });
      return { cor: nova, versao: linha.updated_at.toISOString() };
    });
  });
}
