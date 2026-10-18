import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BarChart3 } from "lucide-react";
import { MolduraAbas } from "@/components/admin/moldura-abas";
import { MenuFiltro } from "@/components/comunidade/menu-filtro";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Estatistica } from "@/components/ui/estatistica";
import { FiltroAtivo } from "@/components/ui/filtro-ativo";
import { SegmentosLink } from "@/components/ui/segmentos-link";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { formatarTempo } from "@/lib/validators/catalogo";
import { estatisticasDosVideos, type EstatisticaVideo } from "@/lib/video/estatisticas";
import { produtosComVideo } from "@/lib/video/estudio";
import { ehUuid } from "../../conteudos/_components/comum";
import { ABAS_ESTUDIO, ROTA_ESTUDIO, numero, um, type Busca } from "../_components/comum";

export const metadata: Metadata = { title: "Estatísticas · Estúdio de vídeo" };

const PERIODOS = [7, 30, 90] as const;
const PADRAO = 30;
const NO_GRAFICO = 10;
const CAMINHO = `${ROTA_ESTUDIO}/estatisticas`;

/** Retenção geral = média das aulas pesada por quem abriu cada uma. */
function totais(linhas: readonly EstatisticaVideo[]) {
  const espectadores = linhas.reduce((s, l) => s + l.espectadores, 0);
  return {
    visualizacoes: linhas.reduce((s, l) => s + l.visualizacoes, 0),
    minutos: linhas.reduce((s, l) => s + l.minutosAssistidos, 0),
    retencao: espectadores ? Math.round(linhas.reduce((s, l) => s + l.retencaoMedia * l.espectadores, 0) / espectadores) : 0,
    conclusoes: linhas.reduce((s, l) => s + l.conclusoes, 0),
  };
}

/** Barras horizontais em CSS, UM eixo (visualizações no período), tom neutro. */
function GraficoMaisVistos({ linhas, dias }: { linhas: readonly EstatisticaVideo[]; dias: number }) {
  const top = linhas.filter((l) => l.visualizacoes > 0).slice(0, NO_GRAFICO);
  const maior = Math.max(1, ...top.map((l) => l.visualizacoes));
  return (
    <section aria-labelledby="titulo-mais-vistos" className="flex flex-col gap-3">
      <h2 id="titulo-mais-vistos" className="m-0 text-[15px] font-semibold">
        Mais vistos nos últimos {dias} dias
      </h2>
      {top.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">Nenhuma visualização neste período.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {top.map((l) => (
            <li key={l.videoId} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate">
                  {l.aula} <span className="text-muted">· {l.produto}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{numero(l.visualizacoes)}</span>
              </div>
              <div aria-hidden className="h-1.5 rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-muted/45" style={{ width: `${(l.visualizacoes / maior) * 100}%`, minWidth: 3 }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const COLUNAS = ["Aula", "Duração", "Visualizações", "Pessoas", "Minutos assistidos", "Retenção média", "Conclusões"];

function TabelaVideos({ linhas }: { linhas: readonly EstatisticaVideo[] }) {
  return (
    <section aria-label="Estatísticas por vídeo" className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[760px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-surface-2 text-xs text-muted">
            {COLUNAS.map((c, i) => (
              <th key={c} scope="col" className={`px-4 py-2.5 font-normal ${i ? "text-right" : "text-left"}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.videoId} className="border-t border-border tabular-nums">
              <th scope="row" className="max-w-[320px] px-4 py-2.5 text-left font-normal">
                <Link href={`/admin/conteudos/${l.produtoId}/aulas/${l.aulaId}`} className="block truncate font-semibold text-text hover:underline">
                  {l.aula}
                </Link>
                <span className="block truncate text-xs text-muted">{l.produto}</span>
              </th>
              <td className="px-4 py-2.5 text-right">{l.duracaoSeg != null ? formatarTempo(l.duracaoSeg) : "—"}</td>
              <td className="px-4 py-2.5 text-right font-semibold">{numero(l.visualizacoes)}</td>
              <td className="px-4 py-2.5 text-right">{numero(l.espectadores)}</td>
              <td className="px-4 py-2.5 text-right">{numero(l.minutosAssistidos)}</td>
              <td className="px-4 py-2.5 text-right">{l.espectadores ? `${l.retencaoMedia}%` : "—"}</td>
              <td className="px-4 py-2.5 text-right">{numero(l.conclusoes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  // searchParams são entrada do usuário: só períodos da lista e UUID.
  const dias = PERIODOS.find((p) => String(p) === um(sp.dias)) ?? PADRAO;
  const produtoId = ehUuid(um(sp.curso) ?? "") ? um(sp.curso) : undefined;
  const [linhas, cursos] = await Promise.all([estatisticasDosVideos(criador.id, { produtoId, dias }), produtosComVideo(criador.id)]);

  const href = (mudar: { dias?: number; curso?: string | null }) => {
    const p = new URLSearchParams();
    const d = mudar.dias ?? dias;
    const c = mudar.curso === null ? undefined : (mudar.curso ?? produtoId);
    if (d !== PADRAO) p.set("dias", String(d));
    if (c) p.set("curso", c);
    const qs = p.toString();
    return qs ? `${CAMINHO}?${qs}` : CAMINHO;
  };
  const cursoAtivo = cursos.find((c) => c.id === produtoId);
  const t = totais(linhas);

  return (
    <MolduraAbas titulo="Estúdio de vídeo" meta={`${linhas.length} ${linhas.length === 1 ? "vídeo pronto" : "vídeos prontos"}`} abas={ABAS_ESTUDIO} ativa="Estatísticas">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentosLink aria-label="Período" opcoes={PERIODOS.map((p) => ({ rotulo: `${p} dias`, href: href({ dias: p }), ativo: p === dias }))} />
          {cursos.length > 0 && (
            <MenuFiltro
              rotulo="Curso"
              itens={[
                { rotulo: "Todos os cursos", href: href({ curso: null }), marcado: !produtoId },
                ...cursos.map((c) => ({ rotulo: c.titulo, href: href({ curso: c.id }), marcado: c.id === produtoId })),
              ]}
            />
          )}
          {cursoAtivo && <FiltroAtivo rotulo={`Curso · ${cursoAtivo.titulo}`} hrefRemover={href({ curso: null })} />}
        </div>

        {linhas.length === 0 ? (
          <EstadoVazio
            comMoldura
            icone={<BarChart3 />}
            titulo="Nenhum vídeo pronto"
            descricao={produtoId ? "Este curso ainda não tem vídeo pronto para assistir." : "As estatísticas aparecem quando o primeiro vídeo terminar de processar."}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 desk:grid-cols-4">
              <Estatistica valor={numero(t.visualizacoes)} rotulo={`Visualizações nos últimos ${dias} dias`} />
              <Estatistica valor={numero(t.minutos)} rotulo="Minutos assistidos (acumulado)" />
              <Estatistica valor={`${t.retencao}%`} rotulo="Retenção média (acumulado)" />
              <Estatistica valor={numero(t.conclusoes)} rotulo="Conclusões (acumulado)" />
            </div>
            <GraficoMaisVistos linhas={linhas} dias={dias} />
            <TabelaVideos linhas={linhas} />
          </>
        )}
        <p className="m-0 text-xs leading-relaxed text-muted">
          Visualizações contam uma por pessoa por dia, só no período escolhido. Pessoas, minutos assistidos (cada trecho conta uma vez por pessoa), retenção
          média (quanto do vídeo cada pessoa viu) e conclusões são o acumulado de cada aula desde a publicação. A equipe entra na conta.
        </p>
      </div>
    </MolduraAbas>
  );
}

/** Estatísticas por vídeo pronto (RN-205), DONO e ADMIN. */
export default function PaginaEstatisticasEstudio({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}
