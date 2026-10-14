import "server-only";
import { and, eq } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import { usuarios, usuarios_contas } from "@/lib/db/schema";
import { avisarDono } from "./aviso";

/**
 * Depois que o Better Auth grava a senha pelo link: destrava a conta (quem provou posse do
 * link recupera o acesso), corrige a autoria da linha de credencial e registra na trilha.
 * As sessoes antigas a propria lib revoga (`revokeSessionsOnPasswordReset`).
 */
export async function aposRedefinirSenha(usuarioId: string) {
  const agora = new Date();
  await db.transaction(async (tx) => {
    await tx.update(usuarios).set({ falhas_login: 0, bloqueado_ate: null }).where(eq(usuarios.id, usuarioId));
    await tx
      .update(usuarios_contas)
      .set({ updated_at: agora, modified_by: usuarioId })
      .where(and(eq(usuarios_contas.usuario_id, usuarioId), eq(usuarios_contas.provedor_id, "credential")));
    await registrarAuditoria(tx, {
      userId: usuarioId,
      acao: "senha",
      tabela: "usuarios",
      registroId: usuarioId,
      detalhes: "Senha definida pelo link de definição de senha (outras sessões encerradas)",
    });
  });
  await avisarDono(usuarioId, "A senha da sua conta foi definida pelo link de definição de senha");
}
