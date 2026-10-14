import { Suspense } from "react";
import { saudacaoPorHorario } from "@/components/admin/saudacao";
import { SeletorDatas } from "@/components/admin/seletor-datas";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { Esqueleto } from "@/components/ui/esqueleto";
import { hojeEmBrasilia, lerIntervalo } from "@/lib/painel/periodo";
import { BlocoAcessos, BlocoAgora, BlocoKpis, BlocoMaisAssistidas, BlocoSaude, type ParametrosPainel } from "./_components/blocos-painel";
import { EsqueletoCartao, EsqueletoKpis } from "./_components/esqueletos-painel";

/** Sessao e hora mudam a cada request: fora do prerender (cacheComponents), atras do Suspense. */
async function Saudacao() {
  const { usuario } = await membroDaPagina(EQUIPE);
  return `${saudacaoPorHorario(new Date())}, ${usuario.nome.split(/\s+/)[0]}`;
}

async function Periodo({ parametros }: { parametros: ParametrosPainel }) {
  // A guarda (cookies) torna o bloco dinâmico antes de ler o relógio (cacheComponents recusa `new Date()` no prerender).
  await membroDaPagina(EQUIPE);
  const p = await parametros;
  const hoje = hojeEmBrasilia();
  return <SeletorDatas valor={lerIntervalo(p, hoje)} hoje={hoje} caminho="/admin" />;
}

/** Duas colunas no desktop (1,6fr | 1fr, como o protótipo); uma no celular. */
const LINHA = "grid items-start gap-3.5 desk:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]";

/**
 * Home do admin (DONO e ADMIN; o layout já barra ALUNO e cada bloco confere de novo). Período
 * em `?de=AAAA-MM-DD&ate=AAAA-MM-DD` (padrão: últimos 30 dias; legado `?periodo=7|30|90`). Cada bloco carrega no seu <Suspense> com esqueleto próprio.
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
          <Suspense fallback={<Esqueleto className="h-11 w-[232px] rounded-md desk:h-9" />}>
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
