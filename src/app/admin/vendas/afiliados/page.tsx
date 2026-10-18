import type { Metadata } from "next";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { FiltrosMembros } from "@/app/admin/membros/_components/filtros-membros";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { SITUACOES_AFILIADO, type SituacaoAfiliado } from "@/lib/db/schema/_enums";
import { linkDeCompra } from "@/lib/pagamentos/checkout";
import { listarAfiliados, listarOfertas } from "@/lib/pagamentos/consultas";
import { formatarCentavos } from "@/lib/pagamentos/regras";
import { ABAS_VENDAS } from "../_components/abas";
import { CopiarLink } from "../ofertas/_components/copiar-link";
import { filtrosDaLista, type Busca } from "../ofertas/_components/filtros";
import { formatarPercentual } from "../ofertas/_components/valores";
import { AcoesAfiliado, NovoAfiliado } from "./form-afiliado";

export const metadata: Metadata = { title: "Afiliados" };

const COLUNAS: Coluna[] = [
  { titulo: "Afiliado" },
  { titulo: "Código", largura: 110 },
  { titulo: "Comissão", largura: 90, alinhar: "direita" },
  { titulo: "Vendas", largura: 70, alinhar: "direita" },
  { titulo: "Vendido", largura: 110, alinhar: "direita" },
  { titulo: "A pagar", largura: 120, alinhar: "direita" },
  { titulo: "Link do afiliado", largura: 150 },
  { titulo: "Situação", largura: 90 },
  { titulo: "Ações", largura: 56 },
];
const ROTULO_SITUACAO: Record<SituacaoAfiliado, string> = { ATIVO: "Ativo", PAUSADO: "Pausado" };

async function Afiliados({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const [todos, ofertas] = await Promise.all([listarAfiliados(criador.id), listarOfertas(criador.id, criador.slug)]);
  const f = filtrosDaLista(await searchParams, "/admin/vendas/afiliados", SITUACOES_AFILIADO, ROTULO_SITUACAO);
  const afiliados = todos.filter((a) => f.casa(a.situacao, a.nome, a.email, a.codigo));
  const aVenda = ofertas.filter((o) => o.situacao === "ATIVA");

  const linhas: Linha[] = afiliados.map((a) => [
    { tipo: "membro", nome: a.nome, email: a.email },
    { tipo: "no", conteudo: <span className="font-mono font-bold tracking-[.04em]">{a.codigo}</span> },
    { tipo: "texto", texto: formatarPercentual(a.comissaoBps) },
    { tipo: "texto", texto: String(a.vendas) },
    { tipo: "texto", texto: formatarCentavos(a.vendidoCentavos) },
    { tipo: "texto", texto: formatarCentavos(a.comissaoCentavos) },
    {
      tipo: "no",
      conteudo: <CopiarLink links={aVenda.map((o) => ({ rotulo: o.nome, url: linkDeCompra(criador.slug, o.id, a.codigo) }))} descricao={`link do afiliado ${a.nome}`} />,
    },
    { tipo: "selo", texto: ROTULO_SITUACAO[a.situacao], tom: a.situacao === "ATIVO" ? "ok" : "neutro" },
    {
      tipo: "no",
      conteudo: (
        <AcoesAfiliado
          afiliado={{ id: a.id, nome: a.nome, email: a.email, codigo: a.codigo, comissaoBps: a.comissaoBps, situacao: a.situacao, versao: a.versao.toISOString() }}
        />
      ),
    },
  ]);

  const devido = todos.reduce((s, a) => s + a.comissaoCentavos, 0);
  return (
    <PaginaTabela
      titulo="Vendas"
      estatistica={
        <>
          {todos.length} {todos.length === 1 ? "afiliado" : "afiliados"} · comissão a pagar <b className="text-text tabular-nums">{formatarCentavos(devido)}</b> · o pagamento ao afiliado é
          feito por você, fora da plataforma
        </>
      }
      abas={ABAS_VENDAS}
      abaAtiva="Afiliados"
      busca="Pesquise pelo nome, e-mail ou código..."
      valorBusca={f.busca}
      formBusca={f.formBusca}
      filtrosAtivos={f.filtrosAtivos}
      controles={<FiltrosMembros menus={f.menus} />}
      acoes={<NovoAfiliado />}
      colunas={COLUNAS}
      linhas={linhas}
      chaves={afiliados.map((a) => a.id)}
      vazio={
        f.filtrando
          ? { titulo: "Nenhum afiliado encontrado", descricao: "Ajuste a busca ou remova os filtros." }
          : {
              titulo: "Nenhum afiliado ainda",
              descricao: "O afiliado divulga o link de compra com o código dele; a venda paga fica atribuída e a comissão é calculada. Você paga a comissão por fora.",
            }
      }
    />
  );
}

/** Afiliados do criador do HOST (DONO e ADMIN), RN-214: vendas pagas e comissão calculada. */
export default function PaginaAfiliados({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Afiliados searchParams={searchParams} />
    </Suspense>
  );
}
