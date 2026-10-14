"use server";

import { and, eq } from "drizzle-orm";
import { executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirSessao } from "@/lib/auth/autorizacao";
import { criadorIdDo } from "@/lib/criador/area";
import { db } from "@/lib/db";
import { usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { preferenciasSchema } from "@/lib/validators/progresso";

/**
 * Preferências da PESSOA (RN-121): reprodução automática e lembretes, valendo em qualquer criador
 * (como o tema). O alvo é SEMPRE a sessão — nenhum id no corpo. Interruptor: última gravação vale
 * (sem trava de colisão, como o tema). Mudança vai para a trilha (antes → depois).
 */
export async function acaoSalvarPreferencias(entrada: unknown) {
  return executar(async () => {
    const p = preferenciasSchema.parse(entrada);
    const s = await exigirSessao();
    return db.transaction(async (tx) => {
      const [antes] = await tx
        .select({ reproducaoAutomatica: usuarios.reproducao_automatica, lembretes: usuarios.lembretes })
        .from(usuarios)
        .where(and(eq(usuarios.id, s.userId), vivos(usuarios)))
        .for("update");
      const depois = { reproducaoAutomatica: p.reproducaoAutomatica ?? antes.reproducaoAutomatica, lembretes: p.lembretes ?? antes.lembretes };
      await tx
        .update(usuarios)
        .set({ reproducao_automatica: depois.reproducaoAutomatica, lembretes: depois.lembretes, updated_at: new Date(), modified_by: s.userId })
        .where(eq(usuarios.id, s.userId));
      await registrarAuditoria(tx, {
        userId: s.userId,
        criadorId: criadorIdDo(s.alvo),
        acao: "atualizar",
        tabela: "usuarios",
        registroId: s.userId,
        detalhes: "Preferências do aluno alteradas",
        dadosAnteriores: antes,
        dadosNovos: depois,
      });
      return depois;
    });
  });
}
