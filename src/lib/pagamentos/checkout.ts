import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { enderecoDaArea } from "@/lib/criador/area";
import { db } from "@/lib/db";
import {
  criadores,
  criadores_afiliados as afiliados,
  criadores_cupons as cupons,
  criadores_ofertas as ofertas,
  criadores_ofertas_produtos as ofertasProdutos,
  criadores_vendas as vendas,
  produtos,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { contaDoCriador } from "./conta";
import { TEXTO_CUPOM_INVALIDO, descontoDoCupom, motivoCupomInvalido, parametrosCheckout, valoresDaVenda } from "./regras";
import type { GatewayStripe } from "./stripe";

/**
 * Abre o Checkout hospedado do Stripe para uma oferta (RN-212 a RN-214). DIRECT CHARGE: a sessão é
 * criada NA conta conectada do criador. A venda nasce PENDENTE com os valores congelados (preço com
 * cupom, taxa da plataforma, comissão do afiliado); o acesso só sai no webhook de pagamento.
 * Afiliado com código inexistente/pausado é ignorado (o link continua vendendo); cupom inválido recusa.
 */

export const MSG_VENDAS_FECHADAS = "As vendas desta área ainda não estão liberadas.";
export const MSG_OFERTA_INDISPONIVEL = "Oferta indisponível.";
/** Situações que contam no limite do cupom (Pix/boleto emitido também reserva). */
const SITUACOES_QUE_GASTAM_CUPOM = ["AGUARDANDO_PAGAMENTO", "PAGA"] as const;

export interface PedidoDeCompra {
  criador: { id: string; slug: string };
  ofertaId: string;
  afiliadoCodigo: string | null;
  cupomCodigo: string | null;
  /** Quem está logado nesta área (fica com o e-mail fixo no Checkout); nulo = visitante. */
  comprador: { membroId: string; usuarioId: string; email: string } | null;
  agora?: Date;
}

/** Link público de compra (o mesmo do afiliado, com `afiliado=`). */
export function linkDeCompra(slug: string, ofertaId: string, afiliadoCodigo?: string | null): string {
  const u = new URL(`${enderecoDaArea(slug).url}/api/stripe/checkout`);
  u.searchParams.set("oferta", ofertaId);
  if (afiliadoCodigo) u.searchParams.set("afiliado", afiliadoCodigo);
  return u.toString();
}

export async function criarCheckout(gateway: GatewayStripe, p: PedidoDeCompra): Promise<{ vendaId: string; url: string }> {
  const agora = p.agora ?? new Date();
  const conta = await contaDoCriador(p.criador.id);
  if (!conta?.cobrancas_ativas) throw new ErroDeNegocio(MSG_VENDAS_FECHADAS);

  const [oferta] = await db
    .select()
    .from(ofertas)
    .where(and(eq(ofertas.id, p.ofertaId), eq(ofertas.criador_id, p.criador.id), eq(ofertas.situacao, "ATIVA"), vivos(ofertas)));
  if (!oferta) throw new ErroDeNegocio(MSG_OFERTA_INDISPONIVEL);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ofertasProdutos)
    .innerJoin(produtos, eq(produtos.id, ofertasProdutos.produto_id))
    .where(and(eq(ofertasProdutos.oferta_id, oferta.id), vivos(ofertasProdutos), vivos(produtos)));
  if (n === 0) throw new ErroDeNegocio(MSG_OFERTA_INDISPONIVEL);

  const afiliado = p.afiliadoCodigo
    ? ((
        await db
          .select({ id: afiliados.id, comissaoBps: afiliados.comissao_bps })
          .from(afiliados)
          .where(and(eq(afiliados.criador_id, p.criador.id), eq(afiliados.codigo, p.afiliadoCodigo), eq(afiliados.situacao, "ATIVO"), vivos(afiliados)))
      )[0] ?? null)
    : null;

  let cupom: { id: string; desconto: number } | null = null;
  if (p.cupomCodigo) {
    const [c] = await db.select().from(cupons).where(and(eq(cupons.criador_id, p.criador.id), eq(cupons.codigo, p.cupomCodigo), vivos(cupons)));
    if (!c) throw new ErroDeNegocio(TEXTO_CUPOM_INVALIDO.SITUACAO);
    // ponytail: contagem sem trava — dois Checkouts no mesmo instante podem passar 1 do limite; reserva com FOR UPDATE se o cliente pedir limite exato.
    const [{ usos }] = await db
      .select({ usos: sql<number>`count(*)::int` })
      .from(vendas)
      .where(and(eq(vendas.cupom_id, c.id), inArray(vendas.situacao, [...SITUACOES_QUE_GASTAM_CUPOM]), vivos(vendas)));
    const desconto = descontoDoCupom(oferta.preco_centavos, { tipo: c.tipo, percentualBps: c.percentual_bps, valorCentavos: c.valor_centavos });
    const motivo = motivoCupomInvalido({ situacao: c.situacao, validoAte: c.valido_ate, ofertaId: c.oferta_id, limiteUsos: c.limite_usos, usos }, oferta.id, oferta.preco_centavos - desconto, agora);
    if (motivo) throw new ErroDeNegocio(TEXTO_CUPOM_INVALIDO[motivo]);
    cupom = { id: c.id, desconto };
  }

  const [{ taxaBps }] = await db.select({ taxaBps: criadores.taxa_plataforma_bps }).from(criadores).where(eq(criadores.id, p.criador.id));
  const valores = valoresDaVenda({ precoCentavos: oferta.preco_centavos, descontoCentavos: cupom?.desconto ?? 0, taxaBps, comissaoBps: afiliado?.comissaoBps ?? null });

  const vendaId = randomUUID();
  const area = enderecoDaArea(p.criador.slug).url;
  const params = parametrosCheckout({
    vendaId,
    criadorId: p.criador.id,
    oferta: { nome: oferta.nome, tipo: oferta.tipo, intervalo: oferta.intervalo },
    valorCentavos: valores.valorCentavos,
    taxaCentavos: valores.taxaCentavos,
    taxaBps,
    email: p.comprador?.email ?? null,
    urlSucesso: `${area}/?compra=sucesso`,
    urlCancelamento: `${area}/?compra=cancelada`,
  });
  // Fora da transação (rede). Falhou depois daqui = sessão órfã no Stripe, que expira sozinha.
  const sessao = await gateway.criarCheckout(conta.conta_id, params, `checkout-${vendaId}`);

  await db.transaction(async (tx) => {
    await tx.insert(vendas).values({
      id: vendaId,
      criador_id: p.criador.id,
      oferta_id: oferta.id,
      tipo: oferta.tipo,
      membro_id: p.comprador?.membroId ?? null,
      comprador_email: p.comprador?.email ?? null,
      afiliado_id: afiliado?.id ?? null,
      cupom_id: cupom?.id ?? null,
      checkout_sessao_id: sessao.id,
      valor_centavos: valores.valorCentavos,
      desconto_centavos: valores.descontoCentavos,
      taxa_bps: taxaBps,
      taxa_centavos: valores.taxaCentavos,
      comissao_centavos: valores.comissaoCentavos,
      // Visitante: a linha nasce com a própria venda como autora (o sistema), como as matrículas do webhook.
      modified_by: p.comprador?.usuarioId ?? vendaId,
    });
    await registrarAuditoria(tx, {
      userId: p.comprador?.usuarioId ?? null,
      criadorId: p.criador.id,
      acao: "criar",
      tabela: "criadores_vendas",
      registroId: vendaId,
      detalhes: `Checkout aberto para a oferta "${oferta.nome}"`,
      dadosNovos: { oferta_id: oferta.id, checkout_sessao_id: sessao.id, afiliado_id: afiliado?.id ?? null, cupom_id: cupom?.id ?? null, ...valores, taxa_bps: taxaBps },
    });
  });
  return { vendaId, url: sessao.url };
}
