import type { Metadata } from "next";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha, TomSelo } from "@/components/admin/tabela-tipos";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { contadoresDeMatriculas, listarMatriculas, produtosParaMatricular } from "@/lib/matriculas/consultas";
import { ROTULO_ORIGEM_MATRICULA, ROTULO_SITUACAO_MATRICULA, SITUACOES_MATRICULA, situacaoDaMatricula, type SituacaoMatricula } from "@/lib/matriculas/regras";
import { listarGrupos } from "@/lib/membros/consultas";
import { dataCurta } from "../membros/_components/comum";
import { AcoesMatricula } from "./_components/acoes-matricula";
import { BotoesMatriculas } from "./_components/botoes-matriculas";
import { FiltrosMatriculas } from "./_components/filtros-matriculas";

export const metadata: Metadata = { title: "Matrículas" };

const POR_PAGINA = 20;
const COLUNAS: Coluna[] = [
  { titulo: "Aluno" },
  { titulo: "Produto", largura: 200 },
  { titulo: "Origem", largura: 110 },
  { titulo: "Situação", largura: 110 },
  { titulo: "Iniciada em", largura: 110 },
  { titulo: "Expira em", largura: 110 },
  { titulo: "Ações", largura: 56 },
];
const TOM: Record<SituacaoMatricula, TomSelo> = { ATIVA: "ok", PENDENTE: "accent", CANCELADA: "warn", EXPIRADA: "neutro" };
/** Abas do protótipo; as que dependem do progresso/avaliações (passo 5+) aparecem "Em breve". */
const ABAS = [{ rotulo: "Matrículas", href: "/admin/matriculas" }, ...["Progresso", "Feedbacks de conteúdo", "Avaliações", "Correção"].map((rotulo) => ({ rotulo, emBreve: true }))];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

async function Matriculas({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const agora = new Date();
  // searchParams sao entrada do usuario: so passa o que tem formato conhecido.
  const filtros = {
    busca: um(sp.q)?.slice(0, 100),
    produtoId: UUID.test(um(sp.produto) ?? "") ? um(sp.produto) : undefined,
    situacao: SITUACOES_MATRICULA.find((s) => s.toLowerCase() === um(sp.situacao)),
  };
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(um(sp.pagina) ?? "1", 10) || 1));
  const [contadores, lista, produtos, grupos] = await Promise.all([
    contadoresDeMatriculas(criador.id, agora),
    listarMatriculas(criador.id, { ...filtros, pagina, porPagina: POR_PAGINA }, agora),
    produtosParaMatricular(criador.id),
    listarGrupos(criador.id),
  ]);

  const href = (mudar: Partial<Record<"q" | "produto" | "situacao" | "pagina", string | undefined>>) => {
    const p = new URLSearchParams();
    const atual = { q: filtros.busca, produto: filtros.produtoId, situacao: filtros.situacao?.toLowerCase(), pagina: undefined as string | undefined, ...mudar };
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/admin/matriculas?${qs}` : "/admin/matriculas";
  };
  const produtoAtivo = produtos.find((p) => p.id === filtros.produtoId);
  const filtrosAtivos = [
    produtoAtivo && { rotulo: `Produto · ${produtoAtivo.titulo}`, hrefRemover: href({ produto: undefined }) },
    filtros.situacao && { rotulo: `Situação · ${ROTULO_SITUACAO_MATRICULA[filtros.situacao]}`, hrefRemover: href({ situacao: undefined }) },
    filtros.busca && { rotulo: `Busca · ${filtros.busca}`, hrefRemover: href({ q: undefined }) },
  ].filter((f) => !!f);

  const linhas: Linha[] = lista.linhas.map((m) => {
    const situacao = situacaoDaMatricula({ status: m.status, expiraEm: m.expiraEm }, agora);
    return [
      { tipo: "membro", nome: m.nome, email: m.email, src: m.imagem },
      { tipo: "texto", texto: m.produto, sub: `Cód. ${m.produtoCodigo}` },
      { tipo: "texto", texto: ROTULO_ORIGEM_MATRICULA[m.origem] },
      { tipo: "selo", texto: ROTULO_SITUACAO_MATRICULA[situacao], tom: TOM[situacao] },
      { tipo: "data", texto: dataCurta(m.iniciadaEm) },
      { tipo: "data", texto: m.expiraEm ? dataCurta(m.expiraEm) : "—" },
      {
        tipo: "no",
        conteudo: (
          <AcoesMatricula
            matricula={{ id: m.id, nome: m.nome, produto: m.produto, situacao, expiraEm: m.expiraEm?.toISOString() ?? null, versao: m.versao.toISOString() }}
          />
        ),
      },
    ];
  });

  const filtrando = Object.values(filtros).some(Boolean);
  return (
    <PaginaTabela
      titulo="Matrículas"
      estatistica={
        <>
          {contadores.total} total · <b className="text-ok">{contadores.ativas} ativas</b> · {contadores.pendentes} pendentes · {contadores.canceladas} canceladas ·{" "}
          {contadores.expiradas} expiradas
        </>
      }
      abas={ABAS}
      abaAtiva="Matrículas"
      busca="Pesquise pelo nome ou e-mail do aluno..."
      valorBusca={filtros.busca}
      formBusca={{
        nome: "q",
        manter: Object.fromEntries(Object.entries({ produto: filtros.produtoId, situacao: filtros.situacao?.toLowerCase() }).filter(([, v]) => v)) as Record<string, string>,
      }}
      filtrosAtivos={filtrosAtivos}
      controles={
        <FiltrosMatriculas
          produtos={produtos.map((p) => ({ rotulo: p.titulo, href: href({ produto: p.id }), marcado: filtros.produtoId === p.id }))}
          situacoes={SITUACOES_MATRICULA.map((s) => ({ rotulo: ROTULO_SITUACAO_MATRICULA[s], href: href({ situacao: s.toLowerCase() }), marcado: filtros.situacao === s }))}
        />
      }
      acoes={
        <BotoesMatriculas
          produtos={produtos.map((p) => ({ id: p.id, titulo: p.titulo, status: p.status }))}
          grupos={grupos.map((g) => ({ id: g.id, nome: g.nome }))}
        />
      }
      colunas={COLUNAS}
      linhas={linhas}
      chaves={lista.linhas.map((m) => m.id)}
      paginacao={{ pagina, porPagina: POR_PAGINA, total: lista.total, href: (n) => href({ pagina: String(n) }) }}
      vazio={
        filtrando
          ? { titulo: "Nenhuma matrícula encontrada", descricao: "Ajuste a busca ou remova os filtros." }
          : { titulo: "Nenhuma matrícula ainda", descricao: "Matricule pessoas ou um grupo em “Matricular”, ou importe uma lista em CSV." }
      }
    />
  );
}

/** Matrículas do criador do HOST (DONO e ADMIN). Busca, filtros e página na URL. */
export default function PaginaMatriculas({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Matriculas searchParams={searchParams} />
    </Suspense>
  );
}
