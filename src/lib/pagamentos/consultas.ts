import "server-only";
import { and, desc, eq, gte, ilike, inArray, lt, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { db } from "@/lib/db";
import type { SituacaoAssinatura, SituacaoVenda } from "@/lib/db/schema/_enums";
import {
  criadores,
  criadores_afiliados as afiliados,
  criadores_assinaturas as assinaturas,
  criadores_cupons as cupons,
  criadores_membros,
  criadores_ofertas as ofertas,
  criadores_ofertas_produtos as ofertasProdutos,
  criadores_stripe_contas as contas,
  criadores_vendas as vendas,
  produtos,
  usuarios,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { linkDeCompra } from "./checkout";

/**
 * LEITURAS para as telas de pagamentos (RN-210 a RN-217). Todas por `criadorId` do HOST (ou da
 * plataforma, em `pagamentosDosCriadores`). Centavos inteiros; somas em bigint → number.
 */

const soma = (c: SQLWrapper) => sql<number>`coalesce(sum(${c}), 0)::bigint`.mapWith(Number);

/** Configurações › Pagamentos: conexão e taxa. */
export async function contaStripe(criadorId: string) {
  const [c] = await db
    .select({ taxaBps: criadores.taxa_plataforma_bps, contaId: contas.conta_id, cobrancasAtivas: contas.cobrancas_ativas, repassesAtivos: contas.repasses_ativos, dadosEnviados: contas.dados_enviados })
    .from(criadores)
    .leftJoin(contas, and(eq(contas.criador_id, criadores.id), vivos(contas)))
    .where(eq(criadores.id, criadorId));
  if (!c) return null;
  return { conectada: c.contaId !== null, contaId: c.contaId, cobrancasAtivas: !!c.cobrancasAtivas, repassesAtivos: !!c.repassesAtivos, dadosEnviados: !!c.dadosEnviados, taxaBps: c.taxaBps };
}

/** /plataforma: taxa e conexão de cada criador (SUPER_ADMIN). `versao` = do criador (trava da taxa). */
export async function pagamentosDosCriadores() {
  return db
    .select({ criadorId: criadores.id, slug: criadores.slug, nome: criadores.nome, taxaBps: criadores.taxa_plataforma_bps, versao: criadores.updated_at, contaId: contas.conta_id, cobrancasAtivas: contas.cobrancas_ativas })
    .from(criadores)
    .leftJoin(contas, and(eq(contas.criador_id, criadores.id), vivos(contas)))
    .where(vivos(criadores))
    .orderBy(criadores.nome);
}

export async function listarOfertas(criadorId: string, slug: string) {
  const linhas = await db.select().from(ofertas).where(and(eq(ofertas.criador_id, criadorId), vivos(ofertas))).orderBy(desc(ofertas.created_at));
  const ids = linhas.map((o) => o.id);
  const ps = ids.length
    ? await db
        .select({ ofertaId: ofertasProdutos.oferta_id, id: produtos.id, titulo: produtos.titulo })
        .from(ofertasProdutos)
        .innerJoin(produtos, eq(produtos.id, ofertasProdutos.produto_id))
        .where(and(inArray(ofertasProdutos.oferta_id, ids), vivos(ofertasProdutos), vivos(produtos)))
    : [];
  return linhas.map((o) => ({
    id: o.id,
    nome: o.nome,
    tipo: o.tipo,
    precoCentavos: o.preco_centavos,
    intervalo: o.intervalo,
    diasAcesso: o.dias_acesso,
    situacao: o.situacao,
    link: linkDeCompra(slug, o.id),
    criadoEm: o.created_at,
    versao: o.updated_at,
    produtos: ps.filter((p) => p.ofertaId === o.id).map((p) => ({ id: p.id, titulo: p.titulo })),
  }));
}

export async function listarCupons(criadorId: string) {
  return db
    .select({
      id: cupons.id,
      codigo: cupons.codigo,
      tipo: cupons.tipo,
      percentualBps: cupons.percentual_bps,
      valorCentavos: cupons.valor_centavos,
      ofertaId: cupons.oferta_id,
      validoAte: cupons.valido_ate,
      limiteUsos: cupons.limite_usos,
      situacao: cupons.situacao,
      criadoEm: cupons.created_at,
      versao: cupons.updated_at,
      usos: sql<number>`(select count(*)::int from ${vendas} v where v.cupom_id = ${cupons.id} and v.situacao in ('AGUARDANDO_PAGAMENTO', 'PAGA') and v.is_deleted = false)`,
    })
    .from(cupons)
    .where(and(eq(cupons.criador_id, criadorId), vivos(cupons)))
    .orderBy(desc(cupons.created_at));
}

/**
 * Afiliados com vendas PAGAS atribuídas e comissão devida (venda reembolsada no total não conta). O link
 * de cada oferta sai de `linkDeCompra(slug, ofertaId, codigo)` (checkout.ts).
 */
export async function listarAfiliados(criadorId: string) {
  return db
    .select({
      id: afiliados.id,
      nome: afiliados.nome,
      email: afiliados.email,
      codigo: afiliados.codigo,
      comissaoBps: afiliados.comissao_bps,
      situacao: afiliados.situacao,
      criadoEm: afiliados.created_at,
      versao: afiliados.updated_at,
      vendas: sql<number>`count(${vendas.id}) filter (where ${vendas.situacao} = 'PAGA')::int`,
      vendidoCentavos: soma(sql`case when ${vendas.situacao} = 'PAGA' then ${vendas.valor_centavos} - ${vendas.reembolsado_centavos} end`),
      comissaoCentavos: soma(sql`case when ${vendas.situacao} = 'PAGA' then ${vendas.comissao_centavos} end`),
    })
    .from(afiliados)
    .leftJoin(vendas, and(eq(vendas.afiliado_id, afiliados.id), vivos(vendas)))
    .where(and(eq(afiliados.criador_id, criadorId), vivos(afiliados)))
    .groupBy(afiliados.id)
    .orderBy(afiliados.nome);
}

export interface FiltrosVendas {
  situacao?: SituacaoVenda;
  ofertaId?: string;
  afiliadoId?: string;
  /** Parte do e-mail do comprador. */
  busca?: string;
  de?: Date;
  ate?: Date;
  pagina: number;
  porPagina: number;
}

function filtroVendas(criadorId: string, f: Omit<FiltrosVendas, "pagina" | "porPagina">): SQL {
  return and(
    eq(vendas.criador_id, criadorId),
    vivos(vendas),
    f.situacao ? eq(vendas.situacao, f.situacao) : undefined,
    f.ofertaId ? eq(vendas.oferta_id, f.ofertaId) : undefined,
    f.afiliadoId ? eq(vendas.afiliado_id, f.afiliadoId) : undefined,
    f.busca ? ilike(vendas.comprador_email, `%${f.busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) : undefined,
    f.de ? gte(vendas.created_at, f.de) : undefined,
    f.ate ? lt(vendas.created_at, f.ate) : undefined,
  )!;
}

export async function listarVendas(criadorId: string, f: FiltrosVendas) {
  const onde = filtroVendas(criadorId, f);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(vendas).where(onde);
  const linhas = await db
    .select({
      id: vendas.id,
      situacao: vendas.situacao,
      tipo: vendas.tipo,
      ofertaId: vendas.oferta_id,
      oferta: ofertas.nome,
      email: vendas.comprador_email,
      nome: usuarios.nome,
      membroId: vendas.membro_id,
      afiliadoId: vendas.afiliado_id,
      afiliado: afiliados.nome,
      cupom: cupons.codigo,
      renovacao: sql<boolean>`${vendas.fatura_id} is not null and ${vendas.checkout_sessao_id} is null`,
      valorCentavos: vendas.valor_centavos,
      descontoCentavos: vendas.desconto_centavos,
      taxaCentavos: vendas.taxa_centavos,
      comissaoCentavos: vendas.comissao_centavos,
      reembolsadoCentavos: vendas.reembolsado_centavos,
      liquidoEstimadoCentavos: sql<number>`(${vendas.valor_centavos} - ${vendas.reembolsado_centavos} - ${vendas.taxa_centavos} + ${vendas.taxa_devolvida_centavos})::int`,
      criadaEm: vendas.created_at,
      pagoEm: vendas.pago_em,
      versao: vendas.updated_at,
    })
    .from(vendas)
    .innerJoin(ofertas, eq(ofertas.id, vendas.oferta_id))
    .leftJoin(criadores_membros, eq(criadores_membros.id, vendas.membro_id))
    .leftJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .leftJoin(afiliados, eq(afiliados.id, vendas.afiliado_id))
    .leftJoin(cupons, eq(cupons.id, vendas.cupom_id))
    .where(onde)
    .orderBy(desc(vendas.created_at))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  return { total, linhas };
}

/**
 * Resumo financeiro do período (por data da venda): só vendas PAGAS ou REEMBOLSADAS. Líquido estimado
 * = bruto − reembolsos − taxa da plataforma efetiva (a devolvida no reembolso volta); as taxas do
 * Stripe e a comissão do afiliado (paga por fora) não entram.
 */
export async function resumoFinanceiro(criadorId: string, f: { de?: Date; ate?: Date } = {}) {
  const onde = and(filtroVendas(criadorId, f), inArray(vendas.situacao, ["PAGA", "REEMBOLSADA"]));
  const [r] = await db
    .select({
      vendas: sql<number>`count(*)::int`,
      brutoCentavos: soma(vendas.valor_centavos),
      descontosCentavos: soma(vendas.desconto_centavos),
      reembolsadoCentavos: soma(vendas.reembolsado_centavos),
      taxaPlataformaCentavos: soma(sql`${vendas.taxa_centavos} - ${vendas.taxa_devolvida_centavos}`),
      comissoesCentavos: soma(sql`case when ${vendas.situacao} = 'PAGA' then ${vendas.comissao_centavos} end`),
    })
    .from(vendas)
    .where(onde);
  return { ...r, liquidoEstimadoCentavos: r.brutoCentavos - r.reembolsadoCentavos - r.taxaPlataformaCentavos };
}

export async function listarAssinaturas(criadorId: string, f: { situacao?: SituacaoAssinatura; pagina: number; porPagina: number }) {
  const onde = and(eq(assinaturas.criador_id, criadorId), vivos(assinaturas), f.situacao ? eq(assinaturas.situacao, f.situacao) : undefined)!;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(assinaturas).where(onde);
  const linhas = await db
    .select({
      id: assinaturas.id,
      situacao: assinaturas.situacao,
      ofertaId: assinaturas.oferta_id,
      oferta: ofertas.nome,
      intervalo: ofertas.intervalo,
      membroId: assinaturas.membro_id,
      nome: usuarios.nome,
      email: usuarios.email,
      periodoFim: assinaturas.periodo_fim,
      cancelarNoFim: assinaturas.cancelar_no_fim,
      encerradaEm: assinaturas.encerrada_em,
      criadaEm: assinaturas.created_at,
      pagoCentavos: sql<number>`(select coalesce(sum(v.valor_centavos - v.reembolsado_centavos), 0)::int from ${vendas} v where v.assinatura_id = ${assinaturas.id} and v.situacao in ('PAGA', 'REEMBOLSADA') and v.is_deleted = false)`,
    })
    .from(assinaturas)
    .innerJoin(ofertas, eq(ofertas.id, assinaturas.oferta_id))
    .innerJoin(criadores_membros, eq(criadores_membros.id, assinaturas.membro_id))
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(onde)
    .orderBy(desc(assinaturas.created_at))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  return { total, linhas };
}
