"use server";

import { z } from "zod";
import { executar } from "@/lib/acao";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { marcarLidas, notificacoesDoMembro } from "@/lib/notificacoes/consultas";
import { marcarLidasSchema } from "@/lib/validators/comunidade";

/**
 * Notificações da PRÓPRIA pessoa (RN-134): o membro vem da sessão no criador do HOST; nenhum id de
 * pessoa no corpo. SUPER_ADMIN sem vínculo não tem notificações (lista vazia, nada a marcar).
 */

/** `{ ids: [...] }` ou `{ todas: true }`. Devolve quantas mudaram. */
export async function acaoMarcarNotificacoesLidas(entrada: unknown) {
  return executar(async () => {
    const m = await exigirMembro(TODOS_OS_MEMBROS);
    const e = marcarLidasSchema.parse(entrada);
    if (!m.membro.id) return { marcadas: 0 };
    const marcadas = await marcarLidas({ criadorId: m.criador.id, membroId: m.membro.id, usuarioId: m.usuario.id }, "todas" in e ? "todas" : e.ids);
    return { marcadas };
  });
}

/** "Ver mais" do painel de notificações (leitura paginada por cursor). */
export async function acaoMaisNotificacoes(entrada: unknown) {
  return executar(async () => {
    const m = await exigirMembro(TODOS_OS_MEMBROS);
    const { cursor } = z.strictObject({ cursor: z.string().max(120).nullable().default(null) }).parse(entrada);
    if (!m.membro.id) return { itens: [], proximoCursor: null };
    return notificacoesDoMembro(m.criador.id, m.membro.id, { cursor });
  });
}
