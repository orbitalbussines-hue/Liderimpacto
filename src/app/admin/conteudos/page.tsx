import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { listarProdutos } from "@/lib/catalogo/consultas";
import { ROTULO_STATUS_PRODUTO, ROTULO_TIPO_PRODUTO, resumoDoProduto } from "@/lib/catalogo/regras";
import { STATUS_PRODUTO, TIPOS_PRODUTO } from "@/lib/db/schema/_enums";
import { AcoesProduto } from "./_components/acoes-produto";
import { TOM_STATUS_PRODUTO, dataHoraCurta } from "./_components/comum";
import { FiltrosConteudos } from "./_components/filtros-conteudos";

export const metadata: Metadata = { title: "Conteúdos" };

const POR_PAGINA = 20;
const COLUNAS: Coluna[] = [
  { titulo: "Capa", largura: 56 },
  { titulo: "Título" },
  { titulo: "Tipo", largura: 120 },
  { titulo: "Situação", largura: 120 },
  { titulo: "Atualização", largura: 130 },
  { titulo: "Ações", largura: 56 },
];
const ABA_DO_TIPO = { CURSO: "Cursos", MENTORIA: "Mentorias", EVENTO: "Eventos" } as const;

type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

async function Conteudos({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  // searchParams sao entrada do usuario: so passa o que tem formato conhecido.
  const filtros = {
    busca: um(sp.q)?.slice(0, 100),
    tipo: TIPOS_PRODUTO.find((t) => t === um(sp.tipo)),
    status: STATUS_PRODUTO.find((s) => s === um(sp.situacao)),
  };
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(um(sp.pagina) ?? "1", 10) || 1));
  const lista = await listarProdutos(criador.id, { ...filtros, pagina, porPagina: POR_PAGINA });
  const capas = await Promise.all(lista.linhas.map((p) => urlDeImagemOuNula(criador.id, p.capaChave)));

  const href = (mudar: Partial<Record<"q" | "tipo" | "situacao" | "pagina", string | undefined>>) => {
    const p = new URLSearchParams();
    const atual = { q: filtros.busca, tipo: filtros.tipo, situacao: filtros.status, pagina: undefined as string | undefined, ...mudar };
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/admin/conteudos?${qs}` : "/admin/conteudos";
  };
  const filtrosAtivos = [
    filtros.status && { rotulo: `Situação · ${ROTULO_STATUS_PRODUTO[filtros.status]}`, hrefRemover: href({ situacao: undefined }) },
    filtros.busca && { rotulo: `Busca · ${filtros.busca}`, hrefRemover: href({ q: undefined }) },
  ].filter((f) => !!f);

  const linhas: Linha[] = lista.linhas.map((p, i) => [
    { tipo: "capa", alt: `Capa de ${p.titulo}`, src: capas[i] },
    { tipo: "texto", texto: p.titulo, sub: resumoDoProduto({ codigo: p.codigo, aulas: p.aulas, alunos: 0 }), caixaAlta: true },
    { tipo: "texto", texto: ROTULO_TIPO_PRODUTO[p.tipo] },
    { tipo: "selo", texto: ROTULO_STATUS_PRODUTO[p.status], tom: TOM_STATUS_PRODUTO[p.status] },
    { tipo: "data", texto: dataHoraCurta(p.atualizado) },
    { tipo: "no", conteudo: <AcoesProduto produto={{ id: p.id, titulo: p.titulo, status: p.status, versao: p.atualizado.toISOString() }} /> },
  ]);

  const filtrando = Object.values(filtros).some(Boolean);
  return (
    <PaginaTabela
      titulo="Gerenciar produtos"
      estatistica={`${lista.total} ${lista.total === 1 ? "produto" : "produtos"}`}
      abas={[
        { rotulo: "Todos", href: href({ tipo: undefined }) },
        ...TIPOS_PRODUTO.map((t) => ({ rotulo: ABA_DO_TIPO[t], href: href({ tipo: t }) })),
      ]}
      abaAtiva={filtros.tipo ? ABA_DO_TIPO[filtros.tipo] : "Todos"}
      busca="Pesquise pelo título..."
      valorBusca={filtros.busca}
      formBusca={{ nome: "q", manter: Object.fromEntries(Object.entries({ tipo: filtros.tipo, situacao: filtros.status }).filter(([, v]) => v)) as Record<string, string> }}
      filtrosAtivos={filtrosAtivos}
      controles={
        <FiltrosConteudos
          tipos={[
            { rotulo: "Todos os tipos", href: href({ tipo: undefined }), marcado: !filtros.tipo },
            ...TIPOS_PRODUTO.map((t) => ({ rotulo: ROTULO_TIPO_PRODUTO[t], href: href({ tipo: t }), marcado: filtros.tipo === t })),
          ]}
          situacoes={STATUS_PRODUTO.map((s) => ({ rotulo: ROTULO_STATUS_PRODUTO[s], href: href({ situacao: s }), marcado: filtros.status === s }))}
        />
      }
      acaoPrincipal={{ rotulo: "Novo produto", icone: Plus, href: "/admin/conteudos/novo" }}
      colunas={COLUNAS}
      linhas={linhas}
      chaves={lista.linhas.map((p) => p.id)}
      paginacao={{ pagina, porPagina: POR_PAGINA, total: lista.total, href: (n) => href({ pagina: String(n) }) }}
      vazio={
        filtrando
          ? { titulo: "Nenhum produto encontrado", descricao: "Ajuste a busca ou remova os filtros." }
          : { titulo: "Nenhum produto ainda", descricao: "Crie o primeiro curso, mentoria ou evento em “Novo produto”." }
      }
    />
  );
}

/** Produtos do criador do HOST (DONO e ADMIN). Aba por tipo, busca, filtros e página na URL. */
export default function PaginaConteudos({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Conteudos searchParams={searchParams} />
    </Suspense>
  );
}
