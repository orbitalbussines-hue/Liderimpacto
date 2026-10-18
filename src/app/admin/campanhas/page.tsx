import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { MenuFiltro } from "@/components/comunidade/menu-filtro";
import { buttonVariants } from "@/components/ui/button";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { SITUACOES_CAMPANHA, type SituacaoCampanha } from "@/lib/db/schema/_enums";
import { listarCampanhas } from "@/lib/marketing/consultas";
import { ROTULO_SITUACAO_CAMPANHA } from "@/lib/marketing/regras";
import { dataHoraCurta } from "../conteudos/_components/comum";
import { AcoesCampanha } from "./_components/acoes-campanha";
import { ABAS_CAMPANHAS, TOM_SITUACAO_CAMPANHA } from "./_components/comum";

export const metadata: Metadata = { title: "Campanhas" };

const COLUNAS: Coluna[] = [
  { titulo: "Campanha" },
  { titulo: "Situação", largura: 120 },
  { titulo: "Quando", largura: 150 },
  { titulo: "Enviados", largura: 100, alinhar: "direita" },
  { titulo: "Aberturas", largura: 120, alinhar: "direita" },
  { titulo: "Cliques", largura: 110, alinhar: "direita" },
  { titulo: "Ações", largura: 56 },
];

type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const traco = <span className="text-muted">—</span>;

type ItemLista = Awaited<ReturnType<typeof listarCampanhas>>[number];

/** Data que importa em cada situação. */
function quando(c: ItemLista): string | null {
  if (c.situacao === "AGENDADA" && c.agendadaPara) return dataHoraCurta(c.agendadaPara);
  if (c.situacao === "CANCELADA" && c.canceladaEm) return dataHoraCurta(c.canceladaEm);
  if (c.concluidaEm) return dataHoraCurta(c.concluidaEm);
  if (c.iniciadaEm) return dataHoraCurta(c.iniciadaEm);
  return null;
}

const comTaxa = (n: number, t: number, enviados: number) =>
  enviados ? (
    <span>
      {n.toLocaleString("pt-BR")} <span className="text-muted">· {t.toLocaleString("pt-BR")}%</span>
    </span>
  ) : (
    traco
  );

async function Campanhas({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const situacao = SITUACOES_CAMPANHA.find((s) => s === um(sp.situacao)) as SituacaoCampanha | undefined;
  const [todas, filtradas] = await Promise.all([listarCampanhas(criador.id), situacao ? listarCampanhas(criador.id, { situacao }) : null]);
  const campanhas = filtradas ?? todas;
  const base = "/admin/campanhas";

  const linhas: Linha[] = campanhas.map((c) => {
    const alvo = c.situacao === "RASCUNHO" ? `${base}/${c.id}/editar` : `${base}/${c.id}`;
    const q = quando(c);
    return [
      {
        tipo: "no",
        conteudo: (
          <div className="min-w-0">
            <Link href={alvo} className="block truncate font-bold text-text hover:underline">
              {c.nome}
            </Link>
            <div className="truncate text-xs text-muted">{c.assunto}</div>
          </div>
        ),
      },
      { tipo: "selo", texto: ROTULO_SITUACAO_CAMPANHA[c.situacao], tom: TOM_SITUACAO_CAMPANHA[c.situacao] },
      q ? { tipo: "data", texto: q } : { tipo: "no", conteudo: traco },
      { tipo: "no", conteudo: c.total ? c.enviados.toLocaleString("pt-BR") : traco },
      { tipo: "no", conteudo: comTaxa(c.aberturas, c.taxaAbertura, c.enviados) },
      { tipo: "no", conteudo: comTaxa(c.cliques, c.taxaClique, c.enviados) },
      { tipo: "no", conteudo: <AcoesCampanha campanha={{ id: c.id, nome: c.nome, situacao: c.situacao, versao: c.versao.toISOString() }} /> },
    ];
  });

  const conta = (s: SituacaoCampanha) => todas.filter((c) => c.situacao === s).length;
  const enviados = todas.reduce((s, c) => s + c.enviados, 0);
  return (
    <PaginaTabela
      titulo="Campanhas"
      estatistica={
        <>
          {todas.length} {todas.length === 1 ? "campanha" : "campanhas"} · {conta("AGENDADA")} {conta("AGENDADA") === 1 ? "agendada" : "agendadas"} · {conta("RASCUNHO")} {conta("RASCUNHO") === 1 ? "rascunho" : "rascunhos"} ·{" "}
          <b className="text-ok">{enviados.toLocaleString("pt-BR")} e-mails enviados</b>
        </>
      }
      abas={ABAS_CAMPANHAS}
      abaAtiva="Campanhas"
      semBusca
      filtrosAtivos={situacao ? [{ rotulo: `Situação · ${ROTULO_SITUACAO_CAMPANHA[situacao]}`, hrefRemover: base }] : []}
      controles={
        <MenuFiltro
          rotulo="Situação"
          itens={[
            { rotulo: "Todas", href: base, marcado: !situacao },
            ...SITUACOES_CAMPANHA.map((s) => ({ rotulo: ROTULO_SITUACAO_CAMPANHA[s], href: `${base}?situacao=${s}`, marcado: situacao === s })),
          ]}
        />
      }
      acoes={
        <Link href={`${base}/nova`} className={buttonVariants({ variant: "primario", size: "36" })}>
          <Plus className="size-3.5" aria-hidden />
          Nova campanha
        </Link>
      }
      colunas={COLUNAS}
      linhas={linhas}
      chaves={campanhas.map((c) => c.id)}
      vazio={
        situacao
          ? { titulo: "Nenhuma campanha nesta situação", descricao: "Remova o filtro para ver todas." }
          : { titulo: "Nenhuma campanha ainda", descricao: "Uma campanha é um e-mail para um grupo de alunos, enviado agora ou no dia e hora que você escolher." }
      }
    />
  );
}

/** Campanhas de e-mail do criador do HOST (DONO e ADMIN), RN-220. Situação na URL. */
export default function PaginaCampanhas({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Campanhas searchParams={searchParams} />
    </Suspense>
  );
}
