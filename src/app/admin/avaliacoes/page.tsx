import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { avaliacoesDoAdmin } from "@/lib/avaliacoes/admin";
import { formatarNota } from "@/lib/avaliacoes/regras";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { listarProdutos } from "@/lib/catalogo/consultas";
import { STATUS_AVALIACAO, TIPOS_AVALIACAO } from "@/lib/db/schema/_enums";
import { ehUuid } from "../conteudos/_components/comum";
import { AcoesAvaliacao } from "./_components/acoes-avaliacao";
import { percentual, ROTULO_STATUS_AVALIACAO, TOM_STATUS_AVALIACAO } from "./_components/comum";
import { FiltrosAvaliacoes } from "./_components/filtros-avaliacoes";

export const metadata: Metadata = { title: "Avaliações" };

const COLUNAS: Coluna[] = [
  { titulo: "Avaliação" },
  { titulo: "Curso", largura: 200 },
  { titulo: "Tipo", largura: 100 },
  { titulo: "Questões", largura: 90 },
  { titulo: "Tentativas", largura: 100 },
  { titulo: "Aprovação", largura: 150 },
  { titulo: "Situação", largura: 110 },
  { titulo: "Ações", largura: 56 },
];
const ABA_DO_TIPO = { QUIZ: "Quizzes", PROVA: "Provas", SIMULADO: "Simulados" } as const;

type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

async function Avaliacoes({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  // searchParams são entrada do usuário: só passa o que tem formato conhecido.
  const curso = um(sp.curso);
  const filtros = {
    busca: um(sp.q)?.slice(0, 100),
    produtoId: curso && ehUuid(curso) ? curso : undefined,
    status: STATUS_AVALIACAO.find((s) => s === um(sp.situacao)),
  };
  const tipo = TIPOS_AVALIACAO.find((t) => t === um(sp.tipo));
  const [{ resumo, linhas: todas }, produtos] = await Promise.all([
    avaliacoesDoAdmin(criador.id, filtros),
    listarProdutos(criador.id, { pagina: 1, porPagina: 200 }),
  ]);
  const lista = tipo ? todas.filter((a) => a.tipo === tipo) : todas;
  const nomeCurso = produtos.linhas.find((p) => p.id === filtros.produtoId)?.titulo;

  const href = (mudar: Partial<Record<"q" | "curso" | "situacao" | "tipo", string | undefined>>) => {
    const p = new URLSearchParams();
    const atual = { q: filtros.busca, curso: filtros.produtoId, situacao: filtros.status, tipo, ...mudar };
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/admin/avaliacoes?${qs}` : "/admin/avaliacoes";
  };
  const filtrosAtivos = [
    nomeCurso && { rotulo: `Curso · ${nomeCurso}`, hrefRemover: href({ curso: undefined }) },
    filtros.status && { rotulo: `Situação · ${ROTULO_STATUS_AVALIACAO[filtros.status]}`, hrefRemover: href({ situacao: undefined }) },
    filtros.busca && { rotulo: `Busca · ${filtros.busca}`, hrefRemover: href({ q: undefined }) },
  ].filter((f) => !!f);

  const linhas: Linha[] = lista.map((a) => [
    { tipo: "texto", texto: a.titulo, sub: `Nota mínima ${a.notaMinima}%${a.obrigatoriaParaCertificado ? " · vale para o certificado" : ""}` },
    { tipo: "texto", texto: a.produto.titulo, sub: a.modulo?.titulo ?? "Avaliação do curso" },
    { tipo: "texto", texto: a.tipoRotulo },
    { tipo: "numeroDestaque", texto: String(a.questoes) },
    { tipo: "texto", texto: String(a.tentativas), sub: a.alunos ? `${a.alunos} ${a.alunos === 1 ? "aluno" : "alunos"}` : undefined },
    a.taxaAprovacao === null
      ? { tipo: "texto", texto: "—", sub: "sem tentativas" }
      : { tipo: "texto", texto: `${percentual(a.taxaAprovacao)} aprovados`, sub: `nota média ${formatarNota(a.notaMedia ?? 0)}` },
    { tipo: "selo", texto: ROTULO_STATUS_AVALIACAO[a.status], tom: TOM_STATUS_AVALIACAO[a.status] },
    { tipo: "no", conteudo: <AcoesAvaliacao avaliacao={{ id: a.id, titulo: a.titulo, questoes: a.questoes, tentativas: a.tentativas, versao: a.versao }} /> },
  ]);

  const filtrando = !!tipo || Object.values(filtros).some(Boolean);
  const novaHref = filtros.produtoId ? `/admin/avaliacoes/nova?curso=${filtros.produtoId}` : "/admin/avaliacoes/nova";
  return (
    <PaginaTabela
      titulo="Avaliações"
      estatistica={`${resumo.total} ${resumo.total === 1 ? "avaliação" : "avaliações"} · ${resumo.publicadas} ${resumo.publicadas === 1 ? "publicada" : "publicadas"} · aprovação média ${percentual(resumo.aprovacaoMedia)}`}
      abas={[{ rotulo: "Todas", href: href({ tipo: undefined }) }, ...TIPOS_AVALIACAO.map((t) => ({ rotulo: ABA_DO_TIPO[t], href: href({ tipo: t }) }))]}
      abaAtiva={tipo ? ABA_DO_TIPO[tipo] : "Todas"}
      busca="Pesquise pelo título..."
      valorBusca={filtros.busca}
      formBusca={{
        nome: "q",
        manter: Object.fromEntries(Object.entries({ curso: filtros.produtoId, situacao: filtros.status, tipo }).filter(([, v]) => v)) as Record<string, string>,
      }}
      filtrosAtivos={filtrosAtivos}
      controles={
        <FiltrosAvaliacoes
          cursos={[
            { rotulo: "Todos os cursos", href: href({ curso: undefined }), marcado: !filtros.produtoId },
            ...produtos.linhas.map((p) => ({ rotulo: p.titulo, href: href({ curso: p.id }), marcado: filtros.produtoId === p.id })),
          ]}
          situacoes={STATUS_AVALIACAO.map((s) => ({ rotulo: ROTULO_STATUS_AVALIACAO[s], href: href({ situacao: s }), marcado: filtros.status === s }))}
        />
      }
      acaoPrincipal={{ rotulo: "Nova avaliação", icone: Plus, href: novaHref }}
      colunas={COLUNAS}
      linhas={linhas}
      chaves={lista.map((a) => a.id)}
      vazio={
        filtrando
          ? { titulo: "Nenhuma avaliação encontrada", descricao: "Ajuste a busca ou remova os filtros." }
          : { titulo: "Nenhuma avaliação ainda", descricao: "Crie o primeiro quiz, prova ou simulado em “Nova avaliação”." }
      }
    />
  );
}

/** Avaliações do criador do HOST (DONO e ADMIN). Aba por tipo, busca e filtros na URL. */
export default function PaginaAvaliacoes({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Avaliacoes searchParams={searchParams} />
    </Suspense>
  );
}
