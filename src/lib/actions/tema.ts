"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { obterSessao } from "@/lib/auth/sessao";
import { criadorIdDo } from "@/lib/criador/area";
import { db } from "@/lib/db";
import { usuarios } from "@/lib/db/schema";
import { gravarTema } from "@/lib/tema";
import { TEMAS } from "@/lib/tema-constantes";

const temaSchema = z.enum(TEMAS, { error: "Tema inválido." });

/**
 * Grava a preferencia de tema no cookie do navegador e, COM sessao plena, tambem em
 * `usuarios.tema` (o alvo e sempre a propria sessao, nunca um id do corpo).
 * Excecao consciente a regra 13: sem sessao (tela de login) a action ainda alterna o tema,
 * mas so mexe no cookie do proprio navegador — nao toca o banco.
 */
export async function alterarTema(tema: unknown) {
  return executar(async () => {
    const t = temaSchema.parse(tema);
    await gravarTema(t);
    const s = await obterSessao();
    if (s && s.tema !== t) {
      await db.transaction(async (tx) => {
        await tx.update(usuarios).set({ tema: t, updated_at: new Date(), modified_by: s.userId }).where(eq(usuarios.id, s.userId));
        await registrarAuditoria(tx, {
          userId: s.userId,
          criadorId: criadorIdDo(s.alvo),
          acao: "atualizar",
          tabela: "usuarios",
          registroId: s.userId,
          detalhes: `Tema alterado de ${s.tema} para ${t}`,
        });
      });
    }
    return null;
  });
}
