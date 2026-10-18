import "server-only";
import { and, eq } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { enderecoDaArea } from "@/lib/criador/area";
import { db, type Transacao } from "@/lib/db";
import { criadores, criadores_stripe_contas as contas } from "@/lib/db/schema";
import { MSG_COLISAO, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { TAXA_MAXIMA_BPS } from "./regras";
import type { GatewayStripe, StatusContaStripe } from "./stripe";

/**
 * Conta Stripe do criador (RN-210) e taxa da plataforma (RN-211). Conectar = criar a conta conectada
 * (uma por criador; a chave de idempotência do Stripe e o índice único seguram dois cliques) e devolver
 * o link de onboarding (Account Link, de uso único e curto: a tela redireciona na hora).
 */

/** Caminho da futura tela de pagamentos (retorno e "link expirou" do onboarding). */
export const CAMINHO_TELA_PAGAMENTOS = "/admin/configuracoes/pagamentos";

export async function contaDoCriador(criadorId: string, exec: Transacao | typeof db = db) {
  const [c] = await exec.select().from(contas).where(and(eq(contas.criador_id, criadorId), vivos(contas)));
  return c ?? null;
}

export async function conectarStripe(gateway: GatewayStripe, p: { criador: { id: string; slug: string }; autor: { id: string; email: string } }): Promise<{ url: string; contaId: string }> {
  let conta = await contaDoCriador(p.criador.id);
  if (!conta) {
    const { contaId } = await gateway.criarConta({ email: p.autor.email, criadorId: p.criador.id }, `conta-criador-${p.criador.id}`);
    await db.transaction(async (tx) => {
      const [nova] = await tx
        .insert(contas)
        .values({ criador_id: p.criador.id, conta_id: contaId, modified_by: p.autor.id })
        .onConflictDoNothing()
        .returning({ id: contas.id });
      if (!nova) return; // outro clique gravou antes (mesma conta pela idempotência)
      await registrarAuditoria(tx, {
        userId: p.autor.id,
        criadorId: p.criador.id,
        acao: "criar",
        tabela: "criadores_stripe_contas",
        registroId: nova.id,
        detalhes: `Conectou a conta Stripe ${contaId}`,
        dadosNovos: { conta_id: contaId },
      });
    });
    conta = await contaDoCriador(p.criador.id);
    if (!conta) throw new Error("conta Stripe não gravada");
  }
  const base = `${enderecoDaArea(p.criador.slug).url}${CAMINHO_TELA_PAGAMENTOS}`;
  const url = await gateway.linkDeOnboarding(conta.conta_id, { retorno: `${base}?stripe=retorno`, renovar: `${base}?stripe=renovar` });
  return { url, contaId: conta.conta_id };
}

/**
 * Grava o status (de `account.updated` ou da leitura na API). `ocorridoEm` = `created` do evento:
 * evento mais velho que o último aplicado é ignorado. Sem `updated_at` (atualização de sistema: não
 * invalida a versão que a tela abriu). Devolve se mudou algo.
 */
export async function aplicarStatusConta(
  tx: Transacao,
  p: { contaId: string; status: StatusContaStripe; ocorridoEm: Date | null; autor: string | null },
): Promise<boolean> {
  const [c] = await tx.select().from(contas).where(and(eq(contas.conta_id, p.contaId), vivos(contas))).for("update");
  if (!c) return false;
  if (p.ocorridoEm && c.status_em && c.status_em.getTime() > p.ocorridoEm.getTime()) return false;
  const antes = { cobrancas_ativas: c.cobrancas_ativas, repasses_ativos: c.repasses_ativos, dados_enviados: c.dados_enviados };
  const depois = { cobrancas_ativas: p.status.cobrancasAtivas, repasses_ativos: p.status.repassesAtivos, dados_enviados: p.status.dadosEnviados };
  await tx.update(contas).set({ ...depois, status_em: p.ocorridoEm ?? c.status_em }).where(eq(contas.id, c.id));
  if (JSON.stringify(antes) === JSON.stringify(depois)) return false;
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: c.criador_id,
    acao: "atualizar",
    tabela: "criadores_stripe_contas",
    registroId: c.id,
    detalhes: `Status da conta Stripe ${c.conta_id}`,
    dadosAnteriores: antes,
    dadosNovos: depois,
  });
  return true;
}

/** Relê o status na API (volta do onboarding) e grava. */
export async function atualizarStatusConta(gateway: GatewayStripe, p: { criadorId: string; autor: string }) {
  const conta = await contaDoCriador(p.criadorId);
  if (!conta) throw new ErroDeNegocio("Conta Stripe ainda não conectada.");
  const status = await gateway.statusDaConta(conta.conta_id);
  await db.transaction((tx) => aplicarStatusConta(tx, { contaId: conta.conta_id, status, ocorridoEm: null, autor: p.autor }));
  return status;
}

/** Taxa da plataforma do criador (SUPER_ADMIN). Vale para as vendas NOVAS; assinatura já criada mantém a dela. */
export async function mudarTaxaDoCriador(tx: Transacao, p: { criadorId: string; versao: Date; taxaBps: number; autor: string }): Promise<{ versao: Date }> {
  if (!Number.isInteger(p.taxaBps) || p.taxaBps < 0 || p.taxaBps > TAXA_MAXIMA_BPS) throw new ErroDeNegocio("Taxa inválida (0% a 50%).");
  const [antes] = await tx.select({ taxa: criadores.taxa_plataforma_bps, slug: criadores.slug }).from(criadores).where(travaDeColisao(criadores, p.criadorId, p.versao)).for("update");
  if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
  const [c] = await tx
    .update(criadores)
    .set({ taxa_plataforma_bps: p.taxaBps, updated_at: new Date(), modified_by: p.autor })
    .where(travaDeColisao(criadores, p.criadorId, p.versao))
    .returning({ versao: criadores.updated_at });
  if (!c) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: "criadores",
    registroId: p.criadorId,
    detalhes: `Taxa da plataforma de ${antes.slug}: ${antes.taxa / 100}% → ${p.taxaBps / 100}%`,
    dadosAnteriores: { taxa_plataforma_bps: antes.taxa },
    dadosNovos: { taxa_plataforma_bps: p.taxaBps },
  });
  return c;
}
