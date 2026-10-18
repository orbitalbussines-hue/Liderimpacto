import type { Metadata } from "next";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import { SeletorDatas } from "@/components/admin/seletor-datas";
import { CelulaTabela } from "@/components/admin/celula-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { SITUACOES_VENDA, type SituacaoVenda } from "@/lib/db/schema/_enums";
import { hojeEmBrasilia, lerIntervaloExplicito, textoDoIntervalo } from "@/lib/painel/periodo";
import { listarOfertas, listarVendas } from "@/lib/pagamentos/consultas";
import { formatarCentavos } from "@/lib/pagamentos/regras";
import { stripeConfigurado } from "@/lib/pagamentos/stripe";
import { dataHoraCurta } from "../conteudos/_components/comum";
import { CarregandoLista } from "../matriculas/_components/carregando";
import { lerBusca, lerPagina, linkCom, manter, um, uuid, type Busca } from "../matriculas/_components/comum";
import { MenusFiltro } from "../matriculas/_components/menus-filtro";
import { ABAS_VENDAS } from "./_components/abas";
import { ROTULO_SITUACAO_VENDA, TOM_SITUACAO_VENDA, datasDoIntervalo } from "./_components/comum";
import { ReembolsarVenda } from "./_components/reembolsar-venda";

export const metadata: Metadata = { title: "Vendas" };

const BASE = "/admin/vendas";
const POR_PAGINA = 25;
// Cabe em 1440 px sem rolar (1080 de área útil); no celular a tabela rola dentro do cartão.
const COLUNAS: Coluna[] = [
  { titulo: "Comprador", largura: 190 },
  { titulo: "Oferta", largura: 190 },
  { titulo: "Valor", largura: 100, alinhar: "direita" },
  { titulo: "Desconto", largura: 85, alinhar: "direita" },
  { titulo: "Taxa plataforma", largura: 95, alinhar: "direita" },
  { titulo: "Comissão", largura: 95, alinhar: "direita" },
  { titulo: "Líquido", largura: 105, alinhar: "direita" },
  { titulo: "Situação e data", largura: 150 },
];
const COLUNA_ACOES: Coluna = { titulo: "Ações", largura: 56 };

const dinheiro = (c: number) => ({ tipo: "texto" as const, texto: formatarCentavos(c) });
const contaNoLiquido = (s: SituacaoVenda) => s === "PAGA" || s === "REEMBOLSADA";
const zeroOuDinheiro = (c: number) => (c === 0 ? { tipo: "data" as const, texto: "—" } : dinheiro(c));

async function Vendas({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(["DONO"]);
  const sp = await searchParams;
  const hoje = hojeEmBrasilia();
  // searchParams são entrada do usuário: só passa o que tem formato conhecido.
  const periodo = lerIntervaloExplicito({ de: um(sp.de), ate: um(sp.ate) }, hoje);
  const atual = {
    q: lerBusca(sp.q),
    situacao: SITUACOES_VENDA.find((s) => s.toLowerCase() === um(sp.situacao))?.toLowerCase(),
    oferta: uuid(sp.oferta),
    de: periodo?.de,
    ate: periodo?.ate,
  };
  const situacao = SITUACOES_VENDA.find((s) => s.toLowerCase() === atual.situacao);
  const pagina = lerPagina(sp.pagina);
  const [lista, ofertas] = await Promise.all([
    listarVendas(criador.id, {
      busca: atual.q,
      situacao,
      ofertaId: atual.oferta,
      ...(periodo ? datasDoIntervalo(periodo) : {}),
      pagina,
      porPagina: POR_PAGINA,
    }),
    listarOfertas(criador.id, criador.slug),
  ]);
  const podeReembolsar = stripeConfigurado();
  const href = (mudar: Record<string, string | undefined>) => linkCom(BASE, atual, mudar);

  const ofertaAtiva = ofertas.find((o) => o.id === atual.oferta);
  const filtrosAtivos = [
    situacao && { rotulo: `Situação · ${ROTULO_SITUACAO_VENDA[situacao]}`, hrefRemover: href({ situacao: undefined }) },
    ofertaAtiva && { rotulo: `Oferta · ${ofertaAtiva.nome}`, hrefRemover: href({ oferta: undefined }) },
    periodo && { rotulo: `Período · ${textoDoIntervalo(periodo.de, periodo.ate)}`, hrefRemover: href({ de: undefined, ate: undefined }) },
    atual.q && { rotulo: `E-mail · ${atual.q}`, hrefRemover: href({ q: undefined }) },
  ].filter((f) => !!f);

  const linhas: Linha[] = lista.linhas.map((v) => {
    const comprador = v.email ?? "comprador sem e-mail";
    const parcial = v.situacao === "PAGA" && v.reembolsadoCentavos > 0;
    const sub = [v.renovacao && "Renovação", v.cupom && `Cupom ${v.cupom}`, v.afiliado && `Afiliado ${v.afiliado}`].filter(Boolean).join(" · ");
    return [
      {
        tipo: "no",
        // Largura fixa: e-mail longo trunca em vez de empurrar as colunas de valor para fora.
        conteudo: (
          <div className="w-[158px]" title={v.email ?? undefined}>
            <CelulaTabela celula={{ tipo: "membro", nome: v.nome ?? v.email ?? "Visitante", email: v.nome ? (v.email ?? "") : v.email ? "Ainda sem conta" : "E-mail informado no pagamento" }} />
          </div>
        ),
      },
      {
        tipo: "no",
        conteudo: (
          <div className="w-[166px] min-w-0" title={[v.oferta, sub].filter(Boolean).join(" · ")}>
            <div className="truncate font-medium">{v.oferta}</div>
            {sub && <div className="truncate text-xs text-muted">{sub}</div>}
          </div>
        ),
      },
      dinheiro(v.valorCentavos),
      zeroOuDinheiro(v.descontoCentavos),
      dinheiro(v.taxaCentavos),
      zeroOuDinheiro(v.comissaoCentavos),
      // Só venda paga (ou reembolsada) tem líquido; pendente/expirada/falha ainda não entrou dinheiro.
      contaNoLiquido(v.situacao) ? { tipo: "no", conteudo: <span className="font-semibold">{formatarCentavos(v.liquidoEstimadoCentavos)}</span> } : { tipo: "data", texto: "—" },
      {
        tipo: "no",
        conteudo: (
          <div className="flex flex-col items-start gap-0.5">
            <Selo tom={TOM_SITUACAO_VENDA[v.situacao]} title={ROTULO_SITUACAO_VENDA[v.situacao]}>
              {v.situacao === "AGUARDANDO_PAGAMENTO" ? "Aguardando" : ROTULO_SITUACAO_VENDA[v.situacao]}
            </Selo>
            <span className="text-xs text-muted">{dataHoraCurta(v.criadaEm)}</span>
            {parcial && <span className="text-xs text-muted">{formatarCentavos(v.reembolsadoCentavos)} reembolsado</span>}
          </div>
        ),
      },
      ...(podeReembolsar
        ? [
            {
              tipo: "no" as const,
              conteudo:
                v.situacao === "PAGA" && v.reembolsadoCentavos < v.valorCentavos ? (
                  <ReembolsarVenda
                    venda={{
                      id: v.id,
                      versao: v.versao.toISOString(),
                      comprador,
                      oferta: v.oferta,
                      restanteCentavos: v.valorCentavos - v.reembolsadoCentavos,
                      assinatura: v.tipo === "ASSINATURA",
                    }}
                  />
                ) : null,
            },
          ]
        : []),
    ];
  });
  const filtrando = filtrosAtivos.length > 0;
  return (
    <PaginaTabela
      titulo="Vendas"
      estatistica={`${lista.total} ${lista.total === 1 ? "venda" : "vendas"}${filtrando ? " no filtro" : ""} · líquido estimado = valor − reembolsos − taxa da plataforma (sem as taxas do Stripe)`}
      abas={ABAS_VENDAS}
      abaAtiva="Vendas"
      busca="Pesquise pelo e-mail do comprador..."
      valorBusca={atual.q}
      formBusca={{ nome: "q", manter: manter(atual) }}
      filtrosAtivos={filtrosAtivos}
      controles={
        <>
          <MenusFiltro
            menus={[
              {
                rotulo: "Situação",
                itens: SITUACOES_VENDA.map((s) => ({ rotulo: ROTULO_SITUACAO_VENDA[s], href: href({ situacao: s.toLowerCase() }), marcado: situacao === s })),
              },
              { rotulo: "Oferta", itens: ofertas.map((o) => ({ rotulo: o.nome, href: href({ oferta: o.id }), marcado: atual.oferta === o.id })) },
            ]}
          />
          <SeletorDatas valor={periodo} hoje={hoje} caminho={BASE} manter={{ q: atual.q, situacao: atual.situacao, oferta: atual.oferta }} />
        </>
      }
      colunas={podeReembolsar ? [...COLUNAS, COLUNA_ACOES] : COLUNAS}
      linhas={linhas}
      chaves={lista.linhas.map((v) => v.id)}
      paginacao={{ pagina, porPagina: POR_PAGINA, total: lista.total, href: (n) => href({ pagina: String(n) }) }}
      vazio={
        filtrando
          ? { titulo: "Nenhuma venda encontrada", descricao: "Ajuste a busca ou remova os filtros." }
          : { titulo: "Nenhuma venda ainda", descricao: "As compras feitas pelos links das ofertas aparecem aqui, com valor, taxa e situação." }
      }
    />
  );
}

/** Vendas do criador do HOST (só DONO, RN-215/216). Filtros e página na URL. */
export default function PaginaVendas({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={<CarregandoLista />}>
      <Vendas searchParams={searchParams} />
    </Suspense>
  );
}
