import { Suspense } from "react";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Esqueleto } from "@/components/ui/esqueleto";
import { lerAba } from "@/lib/analytics/regras";
import { EsqueletoCartao, EsqueletoKpis } from "../_components/esqueletos-painel";
import { AbaAvaliacoes } from "./_components/aba-avaliacoes";
import { AbaConteudo } from "./_components/aba-conteudo";
import { AbaRetencao } from "./_components/aba-retencao";
import { AbaVisaoGeral } from "./_components/aba-visao-geral";
import type { ParametrosAnalytics } from "./_components/contexto";
import { FiltrosAnalytics } from "./_components/filtros";

/** Escolhe a aba pela URL (`?aba=`); cada aba confere sessão e papel por conta própria. */
async function Aba({ parametros }: { parametros: ParametrosAnalytics }) {
  switch (lerAba((await parametros).aba)) {
    case "conteudo":
      return <AbaConteudo parametros={parametros} />;
    case "retencao":
      return <AbaRetencao parametros={parametros} />;
    case "avaliacoes":
      return <AbaAvaliacoes parametros={parametros} />;
    default:
      return <AbaVisaoGeral parametros={parametros} />;
  }
}

function EsqueletoAba() {
  return (
    <>
      <EsqueletoKpis />
      <EsqueletoCartao titulo="gráficos" grafico />
    </>
  );
}

/**
 * Analytics do admin (DONO e ADMIN; o layout já barra ALUNO e cada bloco confere de novo).
 * Filtros na URL: `?aba=visao-geral|conteudo|retencao|avaliacoes&de=AAAA-MM-DD&ate=AAAA-MM-DD&curso=<id>`
 * (+ `ordem=estrutura` no Conteúdo). Métricas definidas em docs/back.md (Analytics) e RN-139.
 */
export default function PaginaAnalytics({ searchParams }: { searchParams: ParametrosAnalytics }) {
  return (
    <>
      <CabecalhoPagina variante="admin" titulo="Analytics" descricao="Atividade, conclusão por aula, retenção e avaliações dos alunos" />
      <Suspense fallback={<Esqueleto className="h-[92px] w-full rounded-xl" />}>
        <FiltrosAnalytics parametros={searchParams} />
      </Suspense>
      <Suspense fallback={<EsqueletoAba />}>
        <Aba parametros={searchParams} />
      </Suspense>
    </>
  );
}
