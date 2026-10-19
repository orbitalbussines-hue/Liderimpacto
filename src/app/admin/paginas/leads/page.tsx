import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download, Send } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { MenuFiltro } from "@/components/comunidade/menu-filtro";
import { buttonVariants } from "@/components/ui/button";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { POR_PAGINA_LEADS, listarLeads, paginasParaFunil } from "@/lib/paginas/consultas";
import { filtrosLeadsSchema } from "@/lib/validators/paginas";
import { dataHoraCurta } from "../../conteudos/_components/comum";
import { ABAS_PAGINAS } from "../_components/comum";

export const metadata: Metadata = { title: "Leads" };

const COLUNAS: Coluna[] = [
  { titulo: "Lead" },
  { titulo: "Origem", largura: 220 },
  { titulo: "Tag", largura: 130 },
  { titulo: "UTM", largura: 170 },
  { titulo: "Consentimento", largura: 150 },
  { titulo: "Situação", largura: 130 },
];

type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const traco = <span className="text-muted">—</span>;

async function Leads({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const f = filtrosLeadsSchema.safeParse({ pagina: um(sp.pagina), busca: um(sp.q), pagina_n: um(sp.n) ?? 1 });
  const filtros = f.success ? f.data : { pagina_n: 1 as number, pagina: undefined, busca: undefined };
  const [lista, paginas] = await Promise.all([listarLeads(criador.id, { paginaId: filtros.pagina, busca: filtros.busca, pagina: filtros.pagina_n }), paginasParaFunil(criador.id)]);
  const base = "/admin/paginas/leads";
  const href = (x: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ pagina: filtros.pagina, q: filtros.busca, ...x }).filter((e): e is [string, string] => !!e[1]));
    return q.size ? `${base}?${q}` : base;
  };
  const paginaFiltro = paginas.find((p) => p.id === filtros.pagina);
  const exportar = `${base}/exportar${filtros.pagina || filtros.busca ? `?${new URLSearchParams(Object.entries({ pagina: filtros.pagina, q: filtros.busca }).filter((e): e is [string, string] => !!e[1]))}` : ""}`;
  const campanha = `/admin/campanhas/nova?leads=1${paginaFiltro ? `&pagina=${paginaFiltro.id}` : ""}`;

  const linhas: Linha[] = lista.linhas.map((l) => [
    { tipo: "membro", nome: l.nome, email: l.email },
    {
      tipo: "no",
      conteudo: (
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{l.pagina}</div>
          <div className="truncate text-xs text-muted">{l.funil ? `Funil ${l.funil}` : "Fora de funil"}</div>
        </div>
      ),
    },
    l.tag ? { tipo: "etiqueta", texto: l.tag } : { tipo: "no", conteudo: traco },
    {
      tipo: "no",
      conteudo: l.utm.source || l.utm.campaign ? <span className="block truncate text-xs text-muted">{[l.utm.source, l.utm.medium, l.utm.campaign].filter(Boolean).join(" · ")}</span> : traco,
    },
    { tipo: "no", conteudo: <span title={l.consentimentoTexto} className="text-[13px] tabular-nums">{dataHoraCurta(l.consentimentoEm)}</span> },
    l.descadastrado ? { tipo: "selo", texto: "Descadastrado", tom: "warn" } : { tipo: "selo", texto: l.capturas > 1 ? `Inscrito · ${l.capturas}×` : "Inscrito", tom: "ok" },
  ]);

  return (
    <PaginaTabela
      titulo="Leads"
      estatistica={
        <>
          {lista.total.toLocaleString("pt-BR")} {lista.total === 1 ? "lead" : "leads"} {paginaFiltro ? `da página ${paginaFiltro.titulo}` : "de todas as páginas"}
        </>
      }
      abas={ABAS_PAGINAS}
      abaAtiva="Leads"
      acoes={
        <>
          {/* Arquivo gerado na hora pelo servidor (DONO/ADMIN), com os filtros da tela; a busca não vira público de campanha. */}
          <a href={exportar} download className={buttonVariants({ variant: "contorno", size: "36" })}>
            <Download className="size-3.5" aria-hidden />
            Exportar CSV
          </a>
          <Link href={campanha} className={buttonVariants({ size: "36" })}>
            <Send className="size-3.5" aria-hidden />
            Criar campanha para estes leads
          </Link>
        </>
      }
      busca="Pesquise por nome ou e-mail..."
      valorBusca={filtros.busca}
      formBusca={{ nome: "q", manter: filtros.pagina ? { pagina: filtros.pagina } : {} }}
      filtrosAtivos={paginaFiltro ? [{ rotulo: `Página · ${paginaFiltro.titulo}`, hrefRemover: href({ pagina: undefined, n: undefined }) }] : []}
      controles={
        <MenuFiltro
          rotulo="Página"
          itens={[{ rotulo: "Todas", href: href({ pagina: undefined }), marcado: !paginaFiltro }, ...paginas.map((p) => ({ rotulo: p.titulo, href: href({ pagina: p.id }), marcado: p.id === filtros.pagina }))]}
        />
      }
      colunas={COLUNAS}
      linhas={linhas}
      chaves={lista.linhas.map((l) => l.id)}
      paginacao={{ pagina: filtros.pagina_n, porPagina: POR_PAGINA_LEADS, total: lista.total, href: (n) => href({ n: String(n) }) }}
      vazio={
        filtros.busca || paginaFiltro
          ? { titulo: "Nenhum lead encontrado", descricao: "Remova o filtro ou a busca para ver todos." }
          : { titulo: "Nenhum lead ainda", descricao: "Quem preencher o formulário de captura de uma página publicada aparece aqui, com o consentimento e a origem." }
      }
    />
  );
}

/**
 * Leads das páginas (DONO e ADMIN), RN-243/RN-247: nome, e-mail, origem, tag, UTM, consentimento (texto
 * no título da data) e se o e-mail saiu da lista de marketing da área (descadastro, RN-227). Exporta CSV
 * (RN-254) e abre uma campanha já com o público de leads da página filtrada (RN-250).
 */
export default function PaginaLeads({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Leads searchParams={searchParams} />
    </Suspense>
  );
}
