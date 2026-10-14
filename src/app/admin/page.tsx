import { Suspense } from "react";
import { saudacaoPorHorario } from "@/components/admin/saudacao";
import { SeletorPeriodo } from "@/components/admin/seletor-periodo";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { lerPeriodo } from "@/lib/painel/regras";
import { BlocoAcessos, BlocoAgora, BlocoKpis, BlocoMaisAssistidas, BlocoSaude, type ParametrosPainel } from "./_components/blocos-painel";
import { EsqueletoCartao, EsqueletoKpis } from "./_components/esqueletos-painel";

/** Sessao e hora mudam a cada request: fora do prerender (cacheComponents), atras do Suspense. */
async function Saudacao() {
  const { usuario } = await membroDaPagina(EQUIPE);
  return `${saudacaoPorHorario(new Date())}, ${usuario.nome.split(/\s+/)[0]}`;
}

async function Periodo({ parametros }: { parametros: ParametrosPainel }) {
  return <SeletorPeriodo atual={lerPeriodo((await parametros).periodo)} />;
}

/** Duas colunas no desktop (1,6fr | 1fr, como o protótipo); uma no celular. */
const LINHA = "grid items-start gap-3.5 desk:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]";

/**
 * Home do admin (DONO e ADMIN; o layout já barra ALUNO e cada bloco confere de novo). Período
 * em `?periodo=7|30|90` (padrão 30). Cada bloco carrega no seu <Suspense> com esqueleto próprio.
 */
export default function HomeAdmin({ searchParams }: { searchParams: ParametrosPainel }) {
  return (
    <>
      <CabecalhoPagina
        variante="admin"
        titulo={
          <Suspense fallback="Olá">
            <Saudacao />
          </Suspense>
        }
        descricao="O pulso da sua área de membros"
        acoes={
          <Suspense fallback={<SeletorPeriodo />}>
            <Periodo parametros={searchParams} />
          </Suspense>
        }
      />
      <Suspense fallback={<EsqueletoKpis />}>
        <BlocoKpis parametros={searchParams} />
      </Suspense>
      <div className={LINHA}>
        <Suspense fallback={<EsqueletoCartao titulo="acessos por dia" grafico />}>
          <BlocoAcessos />
        </Suspense>
        <Suspense fallback={<EsqueletoCartao titulo="o que está acontecendo" />}>
          <BlocoAgora />
        </Suspense>
      </div>
      <div className={LINHA}>
        <Suspense fallback={<EsqueletoCartao titulo="conteúdos mais assistidos" linhas={5} />}>
          <BlocoMaisAssistidas parametros={searchParams} />
        </Suspense>
        <Suspense fallback={<EsqueletoCartao titulo="saúde dos produtos" linhas={2} />}>
          <BlocoSaude />
        </Suspense>
      </div>
    </>
  );
}
