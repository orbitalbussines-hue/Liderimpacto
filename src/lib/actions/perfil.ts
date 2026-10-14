"use server";

import { and, eq } from "drizzle-orm";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirSessao } from "@/lib/auth/autorizacao";
import { criadorIdDo } from "@/lib/criador/area";
import { db } from "@/lib/db";
import { usuarios } from "@/lib/db/schema";
import { travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { perfilSchema } from "@/lib/validators/perfil";

const MSG_PERFIL_COLISAO = "Seus dados foram alterados em outra janela. Recarregue a página e tente de novo.";

/**
 * "Meu perfil" > Dados pessoais (nome, WhatsApp, empresa/cargo). O alvo é SEMPRE a pessoa da
 * sessão: nenhum id no corpo (o `strictObject` recusa). Trava otimista pelo `updated_at` que a
 * tela abriu; mudança e trilha (antes → depois) na mesma transação. Devolve a versão nova.
 */
export async function acaoSalvarPerfil(entrada: unknown) {
  return executar(async () => {
    const p = perfilSchema.parse(entrada);
    const s = await exigirSessao();
    return db.transaction(async (tx) => {
      const [antes] = await tx
        .select({ nome: usuarios.nome, whatsapp: usuarios.whatsapp, empresaCargo: usuarios.empresa_cargo })
        .from(usuarios)
        .where(and(eq(usuarios.id, s.userId), vivos(usuarios)));
      if (!antes) throw new ErroDeNegocio("Conta não encontrada.");
      const [depois] = await tx
        .update(usuarios)
        .set({ nome: p.nome, whatsapp: p.whatsapp, empresa_cargo: p.empresaCargo, updated_at: new Date(), modified_by: s.userId })
        .where(travaDeColisao(usuarios, s.userId, p.versao))
        .returning({ versao: usuarios.updated_at });
      if (!depois) throw new ErroDeNegocio(MSG_PERFIL_COLISAO);
      await registrarAuditoria(tx, {
        userId: s.userId,
        criadorId: criadorIdDo(s.alvo),
        acao: "atualizar",
        tabela: "usuarios",
        registroId: s.userId,
        detalhes: "Dados pessoais alterados em Meu perfil",
        dadosAnteriores: antes,
        dadosNovos: { nome: p.nome, whatsapp: p.whatsapp, empresaCargo: p.empresaCargo },
      });
      return { versao: depois.versao.toISOString() };
    });
  });
}
