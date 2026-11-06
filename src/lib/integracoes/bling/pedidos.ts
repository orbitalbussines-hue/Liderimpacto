import "server-only";
import { and, eq } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db, type Transacao } from "@/lib/db";
import {
  criadores_integracoes as integ,
  criadores_integracoes_eventos as ev,
  criadores_integracoes_pedidos as pedidos,
  integracoes_recibos as recibos,
  type PedidoMarketplace,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { encerrarAcesso } from "@/lib/pagamentos/acesso";
import { webhookMatriculas } from "@/lib/webhooks/emitir";
import { buscarPedidoBling, idsPorNumeroLoja } from "./api";
import { hmacDoCpf } from "./cpf";
import { cpfValido, type PedidoLido, prefixoDoPedido, ROTULO_PEDIDO, situacaoDoPedido } from "./regras";

/**
 * Espelho do pedido do Bling (ADR-0024 itens 3 e 6, RN-261, RN-265). Todo aviso faz o worker RELER o
 * pedido na API antes de abrir a transação (o Bling repete e não garante ordem: o estado atual vence)
 * e gravar aqui: número do marketplace, loja, SKUs, situação e o CPF só como HMAC. Cancelado ou
 * excluído no Bling encerra as matrículas daquele pedido (`bling:<pedido>:`). Ninguém é matriculado
 * aqui: o comprador resgata pela página pública (`resgate.ts`).
 */

const TABELA = "criadores_integracoes_pedidos";

/**
 * Grava (insere ou atualiza) o estado atual. `lido` nulo = o pedido não existe mais no Bling: a linha
 * que houver vira CANCELADO. Devolve a linha e as matrículas encerradas (webhook de saída depois do commit).
 */
export async function gravarPedido(
  tx: Transacao,
  p: { criadorId: string; integracaoId: string; autor: string; pedidoId: string; lido: PedidoLido | null; agora: Date },
): Promise<{ pedido: PedidoMarketplace | null; encerradas: string[] }> {
  const [antes] = await tx
    .select()
    .from(pedidos)
    .where(and(eq(pedidos.integracao_id, p.integracaoId), eq(pedidos.pedido_id, p.pedidoId)))
    .for("update");
  if (!p.lido && !antes) return { pedido: null, encerradas: [] };
  const situacao = situacaoDoPedido(p.lido);
  const doc = p.lido?.documento;
  const campos = p.lido
    ? {
        numero_loja: p.lido.numeroLoja,
        numero: p.lido.numero,
        loja_id: p.lido.lojaId,
        // CPF só em HMAC. CNPJ (pedido de empresa) ou documento inválido = sem resgate por CPF.
        cpf_hmac: doc && cpfValido(doc) ? hmacDoCpf(p.criadorId, doc) : null,
        skus: p.lido.skus,
        situacao,
        situacao_bling: p.lido.situacaoValor,
      }
    : { situacao, situacao_bling: null };

  const [pedido] = antes
    ? await tx
        .update(pedidos)
        .set({ ...campos, sincronizado_em: p.agora, updated_at: p.agora })
        .where(eq(pedidos.id, antes.id))
        .returning()
    : await tx
        .insert(pedidos)
        .values({ criador_id: p.criadorId, integracao_id: p.integracaoId, pedido_id: p.pedidoId, ...campos, sincronizado_em: p.agora, modified_by: p.autor })
        .returning();

  if (!antes || antes.situacao !== situacao) {
    await registrarAuditoria(tx, {
      userId: null,
      criadorId: p.criadorId,
      acao: antes ? "atualizar" : "criar",
      tabela: TABELA,
      registroId: pedido.id,
      detalhes: `Pedido ${pedido.numero_loja ?? p.pedidoId} do Bling: ${ROTULO_PEDIDO[situacao]}${p.lido ? "" : " (excluído no Bling)"}`,
      dadosAnteriores: antes ? { situacao: antes.situacao } : undefined,
      dadosNovos: { pedido_id: p.pedidoId, numero_loja: pedido.numero_loja, situacao, skus: pedido.skus, com_cpf: !!pedido.cpf_hmac },
    });
  }
  const encerradas =
    situacao === "CANCELADO"
      ? await encerrarAcesso(tx, { criadorId: p.criadorId, prefixo: prefixoDoPedido(p.pedidoId), motivo: p.lido ? "Pedido cancelado no Bling" : "Pedido excluído no Bling", agora: p.agora })
      : [];
  return { pedido, encerradas };
}

/** Lido na API ANTES da transação do worker (sem segurar trava durante a chamada HTTP). */
export interface PedidoPreparado {
  pedidoId: string;
  lido: PedidoLido | null;
}

/** Evento Bling PENDENTE de pedido: relê o pedido. Outro evento (ou outra plataforma) = `undefined`. */
export async function prepararEventoBling(eventoId: string): Promise<PedidoPreparado | undefined> {
  const [l] = await db
    .select({ situacao: ev.situacao, plataforma: recibos.plataforma, tipo: recibos.tipo, pedidoId: recibos.transacao, integracaoId: recibos.integracao_id, apagada: integ.is_deleted })
    .from(ev)
    .innerJoin(recibos, eq(recibos.id, ev.recibo_id))
    .innerJoin(integ, eq(integ.id, recibos.integracao_id))
    .where(and(eq(ev.id, eventoId), vivos(ev)));
  if (!l || l.plataforma !== "BLING" || l.situacao !== "PENDENTE" || l.apagada || !l.pedidoId || (l.tipo !== "PEDIDO_ATUALIZADO" && l.tipo !== "PEDIDO_EXCLUIDO")) return undefined;
  return { pedidoId: l.pedidoId, lido: await buscarPedidoBling(l.integracaoId, l.pedidoId) };
}

/** Desfecho no formato do processador (`processar.ts`). */
export interface DesfechoBling {
  situacao: "PROCESSADO" | "IGNORADO" | "ERRO";
  nota: string | null;
  depois?: () => Promise<unknown>;
}

export async function aplicarEventoBling(tx: Transacao, l: { criadorId: string; integracaoId: string; transacao: string | null }, pre: PedidoPreparado | undefined, agora: Date): Promise<DesfechoBling> {
  if (!pre || pre.pedidoId !== l.transacao) return { situacao: "IGNORADO", nota: null };
  const [i] = await tx.select({ autor: integ.modified_by }).from(integ).where(eq(integ.id, l.integracaoId));
  const r = await gravarPedido(tx, { criadorId: l.criadorId, integracaoId: l.integracaoId, autor: i.autor, pedidoId: pre.pedidoId, lido: pre.lido, agora });
  if (!r.pedido) return { situacao: "IGNORADO", nota: "Pedido não existe mais no Bling." };
  const nota = `Pedido ${r.pedido.numero_loja ?? pre.pedidoId}: ${ROTULO_PEDIDO[r.pedido.situacao]}${r.encerradas.length ? ` · ${r.encerradas.length} matrícula(s) encerrada(s)` : ""}${r.pedido.cpf_hmac ? "" : " · sem CPF (não resgata)"}`;
  return { situacao: "PROCESSADO", nota, depois: r.encerradas.length ? () => webhookMatriculas(l.criadorId, r.encerradas, "MATRICULA_CANCELADA", null) : undefined };
}

/**
 * Resgate com o pedido ainda fora do espelho (aviso atrasado/perdido): UMA busca pelo número na API e
 * grava o que vier. Sem autorização ou API fora = nada (o resgate recusa com a mensagem genérica).
 */
export async function sincronizarPorNumero(p: { criadorId: string; integracaoId: string; autor: string; numeroLoja: string }): Promise<void> {
  try {
    for (const pedidoId of await idsPorNumeroLoja(p.integracaoId, p.numeroLoja)) {
      const lido = await buscarPedidoBling(p.integracaoId, pedidoId);
      const r = await db.transaction((tx) => gravarPedido(tx, { ...p, pedidoId, lido, agora: new Date() }));
      if (r.encerradas.length) await webhookMatriculas(p.criadorId, r.encerradas, "MATRICULA_CANCELADA", null);
    }
  } catch (e) {
    console.error("[bling] busca do pedido no resgate falhou:", e instanceof Error ? e.message.slice(0, 120) : "erro");
  }
}
