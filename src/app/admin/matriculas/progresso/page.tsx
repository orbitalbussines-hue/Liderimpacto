import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { progressoDasMatriculas } from "@/lib/matriculas/abas";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { dataCurta } from "../../membros/_components/comum";
import { CarregandoLista } from "../_components/carregando";
import { ABAS_MATRICULAS, haQuanto, lerBusca, lerPagina, linkCom, manter, POR_PAGINA, um, uuid, type Busca } from "../_components/comum";
import { MenusFiltro } from "../_components/menus-filtro";
import { Status } from "../_components/status";

export const metadata: Metadata = { title: "Progresso" };

const BASE = "/admin/matriculas/progresso";
const COLUNAS: Coluna[] = [
  { titulo: "Aluno" },
  { titulo: "Curso", largura: 200 },
  { titulo: "Progresso", largura: 190 },
  { titulo: "Última atividade", largura: 130 },
  { titulo: "Situação", largura: 140 },
];

async function Progresso({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const agora = new Date();
  const filtros = { busca: lerBusca(sp.q), produtoId: uuid(sp.produto), soEmAndamento: um(sp.situacao) === "andamento" };
  const pagina = lerPagina(sp.pagina);
  const [lista, produtos] = await Promise.all([
    progressoDasMatriculas(criador.id, { ...filtros, pagina, porPagina: POR_PAGINA }),
    produtosParaMatricular(criador.id),
  ]);

  const atual = { q: filtros.busca, produto: filtros.produtoId, situacao: filtros.soEmAndamento ? "andamento" : undefined };
  const href = (mudar: Record<string, string | undefined>) => linkCom(BASE, atual, mudar);
  const produtoAtivo = produtos.find((p) => p.id === filtros.produtoId);
  const filtrosAtivos = [
    produtoAtivo && { rotulo: `Curso · ${produtoAtivo.titulo}`, hrefRemover: href({ produto: undefined }) },
    filtros.soEmAndamento && { rotulo: "Só em andamento", hrefRemover: href({ situacao: undefined }) },
    filtros.busca && { rotulo: `Busca · ${filtros.busca}`, hrefRemover: href({ q: undefined }) },
  ].filter((f) => !!f);

  const linhas: Linha[] = lista.linhas.map((l) => [
    { tipo: "membro", nome: l.nome, email: l.email },
    { tipo: "texto", texto: l.produto, sub: `Desde ${dataCurta(l.iniciadaEm)}` },
    {
      tipo: "no",
      conteudo: (
        <div className="flex min-w-0 flex-col gap-1">
          <BarraProgresso valor={l.percentual} rotulo={`Progresso de ${l.nome} em ${l.produto}`} mostrarPercentual />
          <span className="text-xs text-muted tabular-nums">
            {l.concluidas} de {l.totalAulas} {l.totalAulas === 1 ? "aula" : "aulas"}
          </span>
        </div>
      ),
    },
    {
      tipo: "no",
      conteudo: l.ultimaAtividade ? (
        <span className="text-muted" title={dataCurta(l.ultimaAtividade)}>
          {haQuanto(l.ultimaAtividade, agora, dataCurta)}
        </span>
      ) : (
        <span className="text-muted">Não começou</span>
      ),
    },
    {
      tipo: "no",
      conteudo: l.concluidaEm ? (
        <Status icone={<CheckCircle2 />} tom="ok" sub={`em ${dataCurta(l.concluidaEm)}`}>
          Concluído
        </Status>
      ) : (
        <Status icone={<CircleDashed />} tom="neutro">
          Em andamento
        </Status>
      ),
    },
  ]);

  const filtrando = Object.values(filtros).some(Boolean);
  return (
    <PaginaTabela
      titulo="Matrículas"
      estatistica={`Progresso · ${lista.total} ${lista.total === 1 ? "matrícula ativa" : "matrículas ativas"}${filtrando ? " no filtro" : ""}`}
      abas={ABAS_MATRICULAS}
      abaAtiva="Progresso"
      busca="Pesquise pelo nome ou e-mail do aluno..."
      valorBusca={filtros.busca}
      formBusca={{ nome: "q", manter: manter(atual) }}
      filtrosAtivos={filtrosAtivos}
      controles={
        <MenusFiltro
          menus={[
            { rotulo: "Curso", itens: produtos.map((p) => ({ rotulo: p.titulo, href: href({ produto: p.id }), marcado: filtros.produtoId === p.id })) },
            {
              rotulo: "Situação",
              itens: [
                { rotulo: "Todas", href: href({ situacao: undefined }), marcado: !filtros.soEmAndamento },
                { rotulo: "Só em andamento", href: href({ situacao: "andamento" }), marcado: filtros.soEmAndamento },
              ],
            },
          ]}
        />
      }
      colunas={COLUNAS}
      linhas={linhas}
      chaves={lista.linhas.map((l) => l.matriculaId)}
      paginacao={{ pagina, porPagina: POR_PAGINA, total: lista.total, href: (n) => href({ pagina: String(n) }) }}
      vazio={
        filtrando
          ? { titulo: "Nenhuma matrícula encontrada", descricao: "Ajuste a busca ou remova os filtros." }
          : { titulo: "Nenhuma matrícula ativa", descricao: "O progresso de cada aluno aparece aqui assim que houver matrícula ativa." }
      }
    />
  );
}

/** Progresso por aluno × curso (RN-205): só matrículas ativas; aulas publicadas contam. */
export default function PaginaProgresso({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={<CarregandoLista />}>
      <Progresso searchParams={searchParams} />
    </Suspense>
  );
}
