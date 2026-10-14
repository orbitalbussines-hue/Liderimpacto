import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { MenuFiltro } from "@/components/comunidade/menu-filtro";
import { Cartao } from "@/components/ui/cartao";
import { Estatistica } from "@/components/ui/estatistica";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { SITUACOES_VIDEO, type SituacaoVideo } from "@/lib/db/schema/_enums";
import { formatarTempo } from "@/lib/validators/catalogo";
import { estadoDaFila, listarVideos, produtosComVideo, totaisDoEstudio, type EstadoFila } from "@/lib/video/estudio";
import { ROTULO_SITUACAO_VIDEO, TOM_SITUACAO_VIDEO, formatarBytes, formatarHoras } from "@/lib/video/regras";
import { dataHoraCurta, ehUuid } from "../conteudos/_components/comum";
import { AcoesVideo } from "./_components/acoes-video";

export const metadata: Metadata = { title: "Estúdio de vídeo" };

const POR_PAGINA = 20;
const COLUNAS: Coluna[] = [
  { titulo: "Aula" },
  { titulo: "Situação", largura: 130 },
  { titulo: "Duração", largura: 90 },
  { titulo: "Resoluções", largura: 120 },
  { titulo: "Legenda", largura: 80 },
  { titulo: "Original", largura: 90 },
  { titulo: "Tentativas", largura: 90 },
  { titulo: "Enviado em", largura: 140 },
  { titulo: "Ações", largura: 56 },
];
const ABA_DA_SITUACAO: Record<SituacaoVideo, string> = { PRONTO: "Prontos", PROCESSANDO: "Processando", FALHOU: "Falharam", ENVIANDO: "Enviando" };
const ORDEM_ABAS: SituacaoVideo[] = ["PRONTO", "PROCESSANDO", "FALHOU", "ENVIANDO"];

type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
/** "1080p" antes de "720p". */
const ordenarResolucoes = (r: string[]) => [...r].sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));

function TextoFila({ fila }: { fila: EstadoFila }) {
  if (!fila.disponivel) return <span className="text-warn">Indisponível</span>;
  return <>{fila.aguardando + fila.processando}</>;
}

function RotuloFila({ fila }: { fila: EstadoFila }) {
  if (!fila.disponivel) return <>Fila de processamento fora do ar: os envios esperam no banco</>;
  return (
    <>
      Vídeos na fila agora: {fila.aguardando} aguardando · {fila.processando} processando ·{" "}
      <span className={fila.falhos > 0 ? "font-semibold text-warn" : undefined}>{fila.falhos} falhos</span>
    </>
  );
}

async function Estudio({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  // searchParams sao entrada do usuario: so passa o que tem formato conhecido.
  const filtros = {
    busca: um(sp.q)?.slice(0, 100),
    situacao: SITUACOES_VIDEO.find((s) => s === um(sp.situacao)),
    produtoId: ehUuid(um(sp.curso) ?? "") ? um(sp.curso) : undefined,
  };
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(um(sp.pagina) ?? "1", 10) || 1));
  const [lista, totais, cursos, fila] = await Promise.all([
    listarVideos(criador.id, { ...filtros, pagina, porPagina: POR_PAGINA }),
    totaisDoEstudio(criador.id),
    produtosComVideo(criador.id),
    estadoDaFila(criador.id),
  ]);

  const href = (mudar: Partial<Record<"q" | "situacao" | "curso" | "pagina", string | undefined>>) => {
    const p = new URLSearchParams();
    const atual = { q: filtros.busca, situacao: filtros.situacao, curso: filtros.produtoId, pagina: undefined as string | undefined, ...mudar };
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/admin/estudio-de-video?${qs}` : "/admin/estudio-de-video";
  };
  const cursoAtivo = cursos.find((c) => c.id === filtros.produtoId);
  const filtrosAtivos = [
    cursoAtivo && { rotulo: `Curso · ${cursoAtivo.titulo}`, hrefRemover: href({ curso: undefined }) },
    filtros.busca && { rotulo: `Busca · ${filtros.busca}`, hrefRemover: href({ q: undefined }) },
  ].filter((f) => !!f);

  const linhas: Linha[] = lista.linhas.map((v) => {
    const hrefAula = `/admin/conteudos/${v.produtoId}/aulas/${v.aulaId}`;
    return [
      {
        tipo: "no",
        conteudo: (
          <div className="min-w-0">
            <Link href={hrefAula} className="block truncate font-semibold text-text hover:underline">
              {v.aula}
            </Link>
            <span className="block truncate text-xs text-muted">
              {v.produto} · {v.modulo}
            </span>
          </div>
        ),
      },
      {
        tipo: "no",
        conteudo: (
          <div className="flex flex-col items-start gap-1">
            <Selo tom={TOM_SITUACAO_VIDEO[v.situacao]}>{ROTULO_SITUACAO_VIDEO[v.situacao]}</Selo>
            {v.situacao === "FALHOU" && v.erro && <span className="line-clamp-2 text-xs text-warn">{v.erro}</span>}
          </div>
        ),
      },
      { tipo: "texto", texto: v.duracaoSeg != null ? formatarTempo(v.duracaoSeg) : "—" },
      { tipo: "texto", texto: v.resolucoes.length ? ordenarResolucoes(v.resolucoes).join(" · ") : "—" },
      { tipo: "texto", texto: v.legendas ?? "—" },
      { tipo: "texto", texto: formatarBytes(v.tamanhoBytes) },
      { tipo: "texto", texto: String(v.tentativas) },
      { tipo: "data", texto: dataHoraCurta(v.enviadoEm) },
      { tipo: "no", conteudo: <AcoesVideo video={{ id: v.id, nome: v.nomeOriginal, situacao: v.situacao, aula: v.aula }} hrefAula={hrefAula} /> },
    ];
  });

  const filtrando = Object.values(filtros).some(Boolean);
  return (
    <div className="flex flex-col gap-4">
      <Cartao padding={16} como="section" aria-label="Resumo do estúdio">
        <div className="grid grid-cols-2 gap-3 desk:grid-cols-4">
          <Estatistica
            valor={totais.videos}
            rotulo={
              <>
                Vídeos · {totais.processando} em andamento ·{" "}
                <span className={totais.falhos > 0 ? "font-semibold text-warn" : undefined}>{totais.falhos} falharam</span>
              </>
            }
          />
          <Estatistica valor={formatarHoras(totais.segundosProntos)} rotulo="De conteúdo pronto para assistir" />
          <Estatistica valor={formatarBytes(totais.bytesOriginais)} rotulo="Armazenamento estimado (arquivos originais)" />
          <Estatistica valor={<TextoFila fila={fila} />} rotulo={<RotuloFila fila={fila} />} />
        </div>
      </Cartao>
      <PaginaTabela
        titulo="Estúdio de vídeo"
        estatistica={`${lista.total} ${lista.total === 1 ? "vídeo" : "vídeos"}`}
        abas={[{ rotulo: "Todos", href: href({ situacao: undefined }) }, ...ORDEM_ABAS.map((s) => ({ rotulo: ABA_DA_SITUACAO[s], href: href({ situacao: s }) }))]}
        abaAtiva={filtros.situacao ? ABA_DA_SITUACAO[filtros.situacao] : "Todos"}
        busca="Pesquise pela aula ou pelo nome do arquivo..."
        valorBusca={filtros.busca}
        formBusca={{ nome: "q", manter: Object.fromEntries(Object.entries({ situacao: filtros.situacao, curso: filtros.produtoId }).filter(([, v]) => v)) as Record<string, string> }}
        filtrosAtivos={filtrosAtivos}
        controles={
          cursos.length > 0 && (
            <MenuFiltro
              rotulo="Curso"
              itens={[
                { rotulo: "Todos os cursos", href: href({ curso: undefined }), marcado: !filtros.produtoId },
                ...cursos.map((c) => ({ rotulo: c.titulo, href: href({ curso: c.id }), marcado: c.id === filtros.produtoId })),
              ]}
            />
          )
        }
        colunas={COLUNAS}
        linhas={linhas}
        chaves={lista.linhas.map((v) => v.id)}
        paginacao={{ pagina, porPagina: POR_PAGINA, total: lista.total, href: (n) => href({ pagina: String(n) }) }}
        vazio={
          filtrando
            ? { titulo: "Nenhum vídeo encontrado", descricao: "Ajuste a busca ou remova os filtros." }
            : { titulo: "Nenhum vídeo ainda", descricao: "O vídeo é enviado no editor de cada aula, em Conteúdos." }
        }
      />
    </div>
  );
}

/** Vídeos das aulas do criador do HOST (DONO e ADMIN): situação, fila e reprocessamento. */
export default function PaginaEstudio({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Estudio searchParams={searchParams} />
    </Suspense>
  );
}
