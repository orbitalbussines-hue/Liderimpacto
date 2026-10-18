import type { Metadata } from "next";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha, TomSelo } from "@/components/admin/tabela-tipos";
import { FiltrosMembros } from "@/app/admin/membros/_components/filtros-membros";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { SITUACOES_CUPOM, type SituacaoCupom } from "@/lib/db/schema/_enums";
import { listarCupons, listarOfertas } from "@/lib/pagamentos/consultas";
import { formatarCentavos } from "@/lib/pagamentos/regras";
import { ABAS_VENDAS } from "../_components/abas";
import { CopiarLink } from "../ofertas/_components/copiar-link";
import { filtrosDaLista, type Busca } from "../ofertas/_components/filtros";
import { dataCurta, formatarPercentual } from "../ofertas/_components/valores";
import { AcoesCupom, NovoCupom } from "./form-cupom";

export const metadata: Metadata = { title: "Cupons" };

const COLUNAS: Coluna[] = [
  { titulo: "Código" },
  { titulo: "Desconto", largura: 110, alinhar: "direita" },
  { titulo: "Vale para", largura: 170 },
  { titulo: "Usos", largura: 90, alinhar: "direita" },
  { titulo: "Válido até", largura: 100 },
  { titulo: "Link com cupom", largura: 150 },
  { titulo: "Situação", largura: 110 },
  { titulo: "Ações", largura: 56 },
];
const ROTULO_SITUACAO: Record<SituacaoCupom, string> = { ATIVO: "Ativo", PAUSADO: "Pausado" };

/** Situação gravada, ou "Vencido"/"Esgotado" quando o cupom ativo já não vale (mesma ordem do checkout). */
function seloDoCupom(c: { situacao: SituacaoCupom; validoAte: Date | null; limiteUsos: number | null; usos: number }): { texto: string; tom: TomSelo } {
  if (c.situacao === "PAUSADO") return { texto: "Pausado", tom: "neutro" };
  if (c.validoAte && c.validoAte.getTime() <= Date.now()) return { texto: "Vencido", tom: "warn" };
  if (c.limiteUsos !== null && c.usos >= c.limiteUsos) return { texto: "Esgotado", tom: "warn" };
  return { texto: "Ativo", tom: "ok" };
}

/** Link de compra da oferta com `cupom=` (o comprador já chega com o desconto). */
const comCupom = (link: string, codigo: string) => {
  const u = new URL(link);
  u.searchParams.set("cupom", codigo);
  return u.toString();
};

async function Cupons({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const [todos, ofertas] = await Promise.all([listarCupons(criador.id), listarOfertas(criador.id, criador.slug)]);
  const f = filtrosDaLista(await searchParams, "/admin/vendas/cupons", SITUACOES_CUPOM, ROTULO_SITUACAO);
  const cupons = todos.filter((c) => f.casa(c.situacao, c.codigo));
  const nomeDa = new Map(ofertas.map((o) => [o.id, o.nome]));
  const ofertasForm = ofertas.map((o) => ({ id: o.id, nome: o.nome }));

  const linhas: Linha[] = cupons.map((c) => {
    const alvo = c.ofertaId ? ofertas.filter((o) => o.id === c.ofertaId) : ofertas;
    return [
      {
        tipo: "no",
        conteudo: (
          <div className="min-w-0">
            <div className="font-mono font-bold tracking-[.04em]">{c.codigo}</div>
            <div className="truncate font-mono text-xs text-muted">cupom={c.codigo}</div>
          </div>
        ),
      },
      { tipo: "texto", texto: c.tipo === "PERCENTUAL" ? formatarPercentual(c.percentualBps ?? 0) : formatarCentavos(c.valorCentavos ?? 0) },
      c.ofertaId ? { tipo: "etiqueta", texto: nomeDa.get(c.ofertaId) ?? "Oferta excluída" } : { tipo: "texto", texto: "Todas as ofertas" },
      { tipo: "texto", texto: c.limiteUsos === null ? String(c.usos) : `${c.usos} / ${c.limiteUsos}` },
      { tipo: "data", texto: c.validoAte ? dataCurta(c.validoAte) : "Sem prazo" },
      { tipo: "no", conteudo: <CopiarLink links={alvo.map((o) => ({ rotulo: o.nome, url: comCupom(o.link, c.codigo) }))} descricao={`link de compra com o cupom ${c.codigo}`} /> },
      { tipo: "selo", ...seloDoCupom(c) },
      {
        tipo: "no",
        conteudo: (
          <AcoesCupom
            cupom={{
              id: c.id,
              codigo: c.codigo,
              tipo: c.tipo,
              percentualBps: c.percentualBps,
              valorCentavos: c.valorCentavos,
              ofertaId: c.ofertaId,
              validoAte: c.validoAte?.toISOString() ?? null,
              limiteUsos: c.limiteUsos,
              situacao: c.situacao,
              usos: c.usos,
              versao: c.versao.toISOString(),
            }}
            ofertas={ofertasForm}
          />
        ),
      },
    ];
  });

  const valendo = todos.filter((c) => seloDoCupom(c).texto === "Ativo").length;
  const usos = todos.reduce((s, c) => s + c.usos, 0);
  return (
    <PaginaTabela
      titulo="Vendas"
      estatistica={
        <>
          {todos.length} {todos.length === 1 ? "cupom" : "cupons"} · <b className="text-ok">{valendo} valendo</b> · {usos} {usos === 1 ? "uso" : "usos"} · o cupom entra no link de compra
          como <span className="font-mono">cupom=CÓDIGO</span>
        </>
      }
      abas={ABAS_VENDAS}
      abaAtiva="Cupons"
      busca="Pesquise pelo código..."
      valorBusca={f.busca}
      formBusca={f.formBusca}
      filtrosAtivos={f.filtrosAtivos}
      controles={<FiltrosMembros menus={f.menus} />}
      acoes={<NovoCupom ofertas={ofertasForm} />}
      colunas={COLUNAS}
      linhas={linhas}
      chaves={cupons.map((c) => c.id)}
      vazio={
        f.filtrando
          ? { titulo: "Nenhum cupom encontrado", descricao: "Ajuste a busca ou remova os filtros." }
          : { titulo: "Nenhum cupom ainda", descricao: "Um cupom dá desconto em % ou em reais, numa oferta ou em todas. Ele vale no link de compra com cupom=CÓDIGO." }
      }
    />
  );
}

/** Cupons do criador do HOST (DONO e ADMIN), RN-213. Busca e situação na URL. */
export default function PaginaCupons({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Cupons searchParams={searchParams} />
    </Suspense>
  );
}
