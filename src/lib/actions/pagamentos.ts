"use server";

import { ErroDeNegocio, executar } from "@/lib/acao";
import { exigirMembro, exigirSuperAdmin, MSG_SEM_PERMISSAO } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { atualizarStatusConta, conectarStripe, mudarTaxaDoCriador } from "@/lib/pagamentos/conta";
import { gatewayStripe, MSG_PAGAMENTOS_DESLIGADOS } from "@/lib/pagamentos/stripe";
import { reembolsarVenda } from "@/lib/pagamentos/vendas";
import { mudarTaxaSchema, reembolsarVendaSchema } from "@/lib/validators/pagamentos";
import { webhookMatriculas } from "@/lib/webhooks/emitir";

/**
 * Pagamentos por Stripe Connect (ADR-0019): conta do criador (só DONO), reembolso (só DONO) e taxa da
 * plataforma (só SUPER_ADMIN, no apex). Sem `STRIPE_SECRET_KEY` = mensagem clara, nada quebra.
 * Ofertas, cupons e afiliados: `actions/ofertas.ts`. Regra em `src/lib/pagamentos/`.
 */

function gateway() {
  const g = gatewayStripe();
  if (!g) throw new ErroDeNegocio(MSG_PAGAMENTOS_DESLIGADOS);
  return g;
}

/** Cria a conta conectada (1ª vez) e devolve o link de onboarding do Stripe (a tela redireciona na hora). */
export async function acaoConectarStripe() {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(["DONO"]);
    const { url } = await conectarStripe(gateway(), { criador, autor: { id: usuario.id, email: usuario.email } });
    return { url };
  });
}

/** Relê o status na API (volta do onboarding). O `account.updated` também atualiza sozinho. */
export async function acaoAtualizarContaStripe() {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    return atualizarStatusConta(gateway(), { criadorId: criador.id, autor: usuario.id });
  });
}

/** Reembolso TOTAL (ModalConfirmacaoBlock na tela). Venda de assinatura também cancela a assinatura. */
export async function acaoReembolsarVenda(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(["DONO"]);
    const e = reembolsarVendaSchema.parse(entrada);
    const r = await reembolsarVenda(gateway(), { criadorId: criador.id, vendaId: e.vendaId, versao: e.versao, autor: usuario.id });
    await webhookMatriculas(criador.id, r.encerradas, "MATRICULA_CANCELADA", usuario.id);
    return { matriculasCanceladas: r.encerradas.length };
  });
}

/** Taxa da plataforma de um criador (bps). Só SUPER_ADMIN, só no apex (/plataforma). */
export async function acaoMudarTaxaCriador(entrada: unknown) {
  return executar(async () => {
    const s = await exigirSuperAdmin();
    if (s.alvo.tipo !== "plataforma") throw new ErroDeNegocio(MSG_SEM_PERMISSAO);
    const e = mudarTaxaSchema.parse(entrada);
    const v = await db.transaction((tx) => mudarTaxaDoCriador(tx, { criadorId: e.criadorId, versao: e.versao, taxaBps: e.taxaBps, autor: s.userId }));
    return { versao: v.versao.toISOString() };
  });
}
