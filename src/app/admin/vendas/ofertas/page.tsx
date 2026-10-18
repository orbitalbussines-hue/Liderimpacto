import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { Aviso } from "@/components/ui/aviso";
import { FiltrosMembros } from "@/app/admin/membros/_components/filtros-membros";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { SITUACOES_OFERTA, type SituacaoOferta } from "@/lib/db/schema/_enums";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { contaStripe, listarOfertas } from "@/lib/pagamentos/consultas";
import { calcularTaxa, formatarCentavos, TAXA_PADRAO_BPS } from "@/lib/pagamentos/regras";
import { ABAS_VENDAS } from "../_components/abas";
import { CopiarLink } from "./_components/copiar-link";
import { filtrosDaLista, type Busca } from "./_components/filtros";
import { formatarPercentual } from "./_components/valores";
import { AcoesOferta, NovaOferta } from "./form-oferta";

export const metadata: Metadata = { title: "Ofertas" };

const COLUNAS: Coluna[] = [
  { titulo: "Oferta" },
  { titulo: "Tipo", largura: 150 },
  { titulo: "Preço", largura: 110, alinhar: "direita" },
  { titulo: "Você recebe", largura: 120, alinhar: "direita" },
  { titulo: "Link de compra", largura: 150 },
  { titulo: "Situação", largura: 100 },
  { titulo: "Ações", largura: 56 },
];
const ROTULO_SITUACAO: Record<SituacaoOferta, string> = { ATIVA: "Ativa", PAUSADA: "Pausada" };

const tipoDaOferta = (o: { tipo: string; intervalo: string | null; diasAcesso: number | null }) =>
  o.tipo === "ASSINATURA"
    ? { texto: o.intervalo === "ANO" ? "Assinatura anual" : "Assinatura mensal" }
    : { texto: "Compra única", sub: o.diasAcesso === null ? "Acesso vitalício" : `${o.diasAcesso} ${o.diasAcesso === 1 ? "dia" : "dias"} de acesso` };

async function Ofertas({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const [todas, produtos, conta] = await Promise.all([listarOfertas(criador.id, criador.slug), produtosParaMatricular(criador.id), contaStripe(criador.id)]);
  const f = filtrosDaLista(await searchParams, "/admin/vendas/ofertas", SITUACOES_OFERTA, ROTULO_SITUACAO);
  const ofertas = todas.filter((o) => f.casa(o.situacao, o.nome, ...o.produtos.map((p) => p.titulo)));
  const taxaBps = conta?.taxaBps ?? TAXA_PADRAO_BPS;
  const comum = { produtos: produtos.map((p) => ({ id: p.id, titulo: p.titulo, status: p.status })), taxaBps };

  const linhas: Linha[] = ofertas.map((o) => {
    const t = tipoDaOferta(o);
    return [
      {
        tipo: "texto",
        texto: o.nome,
        sub: o.produtos.length ? o.produtos.map((p) => p.titulo).join(", ") : "Nenhum curso",
      },
      { tipo: "texto", texto: t.texto, sub: t.sub },
      { tipo: "texto", texto: formatarCentavos(o.precoCentavos) },
      { tipo: "texto", texto: formatarCentavos(o.precoCentavos - calcularTaxa(o.precoCentavos, taxaBps)) },
      { tipo: "no", conteudo: <CopiarLink links={[{ rotulo: o.nome, url: o.link }]} descricao={`link de compra de ${o.nome}`} /> },
      { tipo: "selo", texto: ROTULO_SITUACAO[o.situacao], tom: o.situacao === "ATIVA" ? "ok" : "neutro" },
      {
        tipo: "no",
        conteudo: (
          <AcoesOferta
            oferta={{
              id: o.id,
              nome: o.nome,
              tipo: o.tipo,
              precoCentavos: o.precoCentavos,
              intervalo: o.intervalo,
              diasAcesso: o.diasAcesso,
              situacao: o.situacao,
              versao: o.versao.toISOString(),
              produtoIds: o.produtos.map((p) => p.id),
            }}
            {...comum}
          />
        ),
      },
    ];
  });

  const ativas = todas.filter((o) => o.situacao === "ATIVA").length;
  return (
    <div className="flex flex-col gap-3">
      {!conta?.cobrancasAtivas && (
        <Aviso>
          A conta Stripe desta área ainda não está liberada para cobranças: os links de compra só vendem depois disso.{" "}
          <Link href="/admin/configuracoes/pagamentos" className="font-semibold text-accent underline-offset-4 hover:underline">
            Configurar pagamentos
          </Link>
        </Aviso>
      )}
      <PaginaTabela
        titulo="Vendas"
        estatistica={
          <>
            {todas.length} {todas.length === 1 ? "oferta" : "ofertas"} · <b className="text-ok">{ativas} à venda</b> · taxa da plataforma {formatarPercentual(taxaBps)}; “Você recebe” é
            estimado, antes da taxa do Stripe
          </>
        }
        abas={ABAS_VENDAS}
        abaAtiva="Ofertas"
        busca="Pesquise pelo nome da oferta ou do curso..."
        valorBusca={f.busca}
        formBusca={f.formBusca}
        filtrosAtivos={f.filtrosAtivos}
        controles={<FiltrosMembros menus={f.menus} />}
        acoes={<NovaOferta {...comum} />}
        colunas={COLUNAS}
        linhas={linhas}
        chaves={ofertas.map((o) => o.id)}
        vazio={
          f.filtrando
            ? { titulo: "Nenhuma oferta encontrada", descricao: "Ajuste a busca ou remova os filtros." }
            : { titulo: "Nenhuma oferta ainda", descricao: "Uma oferta junta preço e cursos num link de compra: compra única (vitalícia ou por dias) ou assinatura mensal/anual." }
        }
      />
    </div>
  );
}

/** Ofertas do criador do HOST (DONO e ADMIN), RN-212. Busca e situação na URL. */
export default function PaginaOfertas({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Ofertas searchParams={searchParams} />
    </Suspense>
  );
}
