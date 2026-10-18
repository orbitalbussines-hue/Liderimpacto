import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { SegmentosLink } from "@/components/ui/segmentos-link";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { enderecoDaArea } from "@/lib/criador/area";
import { formatarCentavos } from "@/lib/pagamentos/regras";
import { metricasDoFunil, paginasParaFunil } from "@/lib/paginas/consultas";
import { conversaoTotal, textoPercentual } from "@/lib/paginas/metricas";
import { idSchema } from "@/lib/validators/membros";
import { PERIODOS_METRICAS } from "@/lib/validators/paginas";
import { AcoesFunil, CopiarEntrada } from "../_components/botoes-funil";

export const metadata: Metadata = { title: "Funil" };

function Numero({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted">{rotulo}</span>
      <span className="text-[22px] leading-tight font-extrabold tabular-nums">{valor}</span>
      {sub && <span className="text-xs text-muted tabular-nums">{sub}</span>}
    </div>
  );
}

async function Funil({ params, searchParams }: PageProps<"/admin/funis/[id]">) {
  const [{ id }, sp, { criador }] = await Promise.all([params, searchParams, membroDaPagina(EQUIPE)]);
  if (!idSchema.safeParse(id).success) notFound();
  const dias = PERIODOS_METRICAS.find((d) => String(d) === sp.dias) ?? 30;
  const [m, paginas] = await Promise.all([metricasDoFunil(criador.id, id, dias), paginasParaFunil(criador.id)]);
  if (!m) notFound();
  const area = enderecoDaArea(criador.slug).url;
  const entrada = m.etapas[0]?.slug && m.etapas[0].publicada ? `${area}/p/${m.etapas[0].slug}?funil=${m.id}` : null;
  const n = (x: number) => x.toLocaleString("pt-BR");
  const total = m.etapas.reduce((s, e) => ({ leads: s.leads + e.leads, vendas: s.vendas + e.vendas, receita: s.receita + e.receitaCentavos }), { leads: 0, vendas: 0, receita: 0 });
  const topo = Math.max(1, ...m.etapas.map((e) => e.visitas));
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/funis" className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-text">
        <ArrowLeft className="size-3.5" aria-hidden />
        Funis
      </Link>
      <CabecalhoPagina
        variante="adminDestaque"
        titulo={m.nome}
        descricao={entrada ? "Divulgue o link de entrada: ele leva o visitante à primeira etapa já contando no funil." : "Publique a página da primeira etapa para ter o link de entrada."}
        acoes={
          <>
            <CopiarEntrada url={entrada} />
            <AcoesFunil funil={{ id: m.id, nome: m.nome, versao: m.versao, etapas: m.etapasBrutas }} paginas={paginas} />
          </>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentosLink aria-label="Período" opcoes={PERIODOS_METRICAS.map((d) => ({ rotulo: `${d} dias`, href: `/admin/funis/${m.id}?dias=${d}`, ativo: d === dias }))} />
        <span className="text-xs text-muted">Visitas contadas sem cookie, uma por abertura da página. Vendas = pagamentos confirmados.</span>
      </div>
      <Cartao className="grid grid-cols-2 gap-5 md:grid-cols-5">
        <Numero rotulo="Visitas na entrada" valor={n(m.etapas[0]?.visitas ?? 0)} />
        <Numero rotulo="Leads" valor={n(total.leads)} />
        <Numero rotulo="Vendas" valor={n(total.vendas)} />
        <Numero rotulo="Receita" valor={formatarCentavos(total.receita)} sub="já descontados os reembolsos" />
        <Numero rotulo="Conversão do funil" valor={textoPercentual(conversaoTotal(m.etapas))} sub="vendas ÷ visitas na entrada" />
      </Cartao>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {m.etapas.map((e, i) => (
          <li key={e.paginaId}>
            {i > 0 && (
              <p className="m-0 mb-3 pl-4 text-xs text-muted">
                <span className="font-semibold text-text tabular-nums">{textoPercentual(e.daAnterior)}</span> das visitas da etapa anterior chegaram aqui
              </p>
            )}
            <Cartao className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2.5">
                  <span className="text-sm font-semibold text-muted tabular-nums">{i + 1}</span>
                  <h2 className="m-0 truncate text-base font-extrabold">{e.nome}</h2>
                  <span className="truncate text-[13px] text-muted">{e.titulo}</span>
                </div>
                {!e.publicada && <Selo tom="warn">Fora do ar</Selo>}
              </div>
              <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((e.visitas / topo) * 100)}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                <Numero rotulo="Visitas" valor={n(e.visitas)} />
                <Numero rotulo="Leads" valor={n(e.leads)} sub={`${textoPercentual(e.taxaLead)} das visitas`} />
                <Numero rotulo="Cliques no pagamento" valor={n(e.cliques)} sub={`${textoPercentual(e.taxaClique)} das visitas`} />
                <Numero rotulo="Vendas" valor={n(e.vendas)} sub={`${textoPercentual(e.taxaVenda)} dos cliques`} />
                <Numero rotulo="Receita" valor={formatarCentavos(e.receitaCentavos)} />
              </div>
            </Cartao>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Funil com a conversão etapa a etapa (DONO e ADMIN), RN-246. Período na URL (`?dias=7|30|90`). */
export default function PaginaFunil(props: PageProps<"/admin/funis/[id]">) {
  return (
    <Suspense fallback={null}>
      <Funil {...props} />
    </Suspense>
  );
}
