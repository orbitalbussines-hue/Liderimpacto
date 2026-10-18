import type { Metadata } from "next";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { MolduraAbas } from "@/components/admin/moldura-abas";
import { SeletorDatas } from "@/components/admin/seletor-datas";
import { buttonVariants } from "@/components/ui/button";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { membroDaPagina } from "@/lib/auth/guarda";
import { frasePeriodo, hojeEmBrasilia, lerIntervalo } from "@/lib/painel/periodo";
import { contaStripe, resumoFinanceiro } from "@/lib/pagamentos/consultas";
import { formatarCentavos, percentualDaTaxa, TAXA_PADRAO_BPS } from "@/lib/pagamentos/regras";
import { cn } from "@/lib/utils";
import { CarregandoLista } from "../../matriculas/_components/carregando";
import { um, type Busca } from "../../matriculas/_components/comum";
import { ABAS_VENDAS_LINKS, DASHBOARD_STRIPE, datasDoIntervalo } from "../_components/comum";

export const metadata: Metadata = { title: "Financeiro" };

const BASE = "/admin/vendas/financeiro";

/** Linha do extrato: rótulo e explicação à esquerda, valor à direita (quebra embaixo no celular). */
function Item({ rotulo, ajuda, valor, total = false }: { rotulo: string; ajuda: string; valor: string; total?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 border-b border-border py-3 last:border-b-0", total && "border-t-2 border-t-text/15")}>
      <dt className="min-w-0 flex-1 basis-56">
        <span className={cn("block text-sm", total ? "font-bold" : "font-semibold")}>{rotulo}</span>
        <span className="block text-xs leading-normal text-muted">{ajuda}</span>
      </dt>
      <dd className={cn("m-0 text-right whitespace-nowrap tabular-nums", total ? "text-base font-bold" : "text-sm font-semibold")}>{valor}</dd>
    </div>
  );
}

async function Financeiro({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(["DONO"]);
  const sp = await searchParams;
  const hoje = hojeEmBrasilia();
  // Sem período válido na URL = últimos 30 dias (aceita também o legado ?periodo=7|30|90).
  const periodo = lerIntervalo({ de: um(sp.de), ate: um(sp.ate), periodo: um(sp.periodo) }, hoje);
  const [r, conta] = await Promise.all([resumoFinanceiro(criador.id, datasDoIntervalo(periodo)), contaStripe(criador.id)]);
  const taxa = percentualDaTaxa(conta?.taxaBps ?? TAXA_PADRAO_BPS).toLocaleString("pt-BR");
  const menos = (c: number) => (c === 0 ? formatarCentavos(0) : `− ${formatarCentavos(c)}`);

  return (
    <div className="flex flex-col gap-4">
      <MolduraAbas titulo="Financeiro" meta={`Resumo ${frasePeriodo(periodo, hoje)}, pela data da venda`} abas={ABAS_VENDAS_LINKS} ativa="Financeiro">
        <div className="flex flex-col gap-3">
          <SeletorDatas valor={periodo} hoje={hoje} caminho={BASE} className="self-start" />
          <dl className="m-0">
            <Item rotulo="Vendas brutas" ajuda={`${r.vendas} ${r.vendas === 1 ? "venda paga ou reembolsada" : "vendas pagas ou reembolsadas"}, já com desconto`} valor={formatarCentavos(r.brutoCentavos)} />
            <Item rotulo="Reembolsos" ajuda="Devolvido aos compradores" valor={menos(r.reembolsadoCentavos)} />
            <Item
              rotulo="Taxa da plataforma"
              ajuda={`Hoje ${taxa}% por venda (cada venda guarda a taxa do dia); a parte devolvida em reembolsos já saiu daqui`}
              valor={menos(r.taxaPlataformaCentavos)}
            />
            <Item rotulo="Líquido estimado" ajuda="Antes das taxas do Stripe, que aparecem no Dashboard do Stripe" valor={formatarCentavos(r.liquidoEstimadoCentavos)} total />
          </dl>
          <h2 className="m-0 mt-2 font-sans text-[13px] font-semibold tracking-normal text-muted">Para conferir (fora do líquido)</h2>
          <dl className="m-0">
            <Item rotulo="Comissões de afiliados" ajuda="Calculadas sobre as vendas pagas; você paga os afiliados fora da plataforma" valor={formatarCentavos(r.comissoesCentavos)} />
            <Item rotulo="Descontos de cupons" ajuda="Quanto os cupons deixaram de cobrar" valor={formatarCentavos(r.descontosCentavos)} />
          </dl>
        </div>
      </MolduraAbas>
      <Cartao como="section" aria-labelledby="titulo-saldo" className="flex flex-col gap-3 desk:flex-row desk:items-center desk:justify-between">
        <div className="min-w-0">
          <CartaoTitulo tamanho={15} como="h2" id="titulo-saldo" className="font-semibold">
            Saldo e saques
          </CartaoTitulo>
          <p className="m-0 mt-1 max-w-[62ch] text-[13px] leading-relaxed text-muted">
            O dinheiro das vendas cai direto na sua conta Stripe. Saldo disponível, repasses para o banco, taxas do Stripe e disputas ficam no Dashboard do Stripe.
          </p>
        </div>
        <a href={DASHBOARD_STRIPE} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "contorno", size: "36", className: "shrink-0 self-start desk:self-center" })}>
          Abrir o Dashboard do Stripe
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </Cartao>
    </div>
  );
}

/** Resumo financeiro do criador do HOST (só DONO, RN-215/216). Período na URL. */
export default function PaginaFinanceiro({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={<CarregandoLista />}>
      <Financeiro searchParams={searchParams} />
    </Suspense>
  );
}
