import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { formatarNota } from "@/lib/avaliacoes/regras";
import { tentativasDoCriador } from "@/lib/matriculas/abas";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { dataHoraCurta } from "../../conteudos/_components/comum";
import { CarregandoLista } from "../_components/carregando";
import { ABAS_MATRICULAS, lerBusca, lerPagina, linkCom, manter, POR_PAGINA, um, uuid, type Busca } from "../_components/comum";
import { MenusFiltro } from "../_components/menus-filtro";
import { Status } from "../_components/status";

export const metadata: Metadata = { title: "Avaliações dos alunos" };

const BASE = "/admin/matriculas/avaliacoes";
const COLUNAS: Coluna[] = [
  { titulo: "Aluno" },
  { titulo: "Avaliação", largura: 230 },
  { titulo: "Tentativa", largura: 90 },
  { titulo: "Nota", largura: 110 },
  { titulo: "Resultado", largura: 150 },
  { titulo: "Quando", largura: 130 },
];

async function Avaliacoes({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const resultado = um(sp.resultado);
  const filtros = {
    busca: lerBusca(sp.q),
    produtoId: uuid(sp.produto),
    aprovada: resultado === "aprovadas" ? true : resultado === "reprovadas" ? false : undefined,
  };
  const pagina = lerPagina(sp.pagina);
  const [lista, produtos] = await Promise.all([
    tentativasDoCriador(criador.id, { ...filtros, pagina, porPagina: POR_PAGINA }),
    produtosParaMatricular(criador.id),
  ]);

  const atual = { q: filtros.busca, produto: filtros.produtoId, resultado: filtros.aprovada === undefined ? undefined : filtros.aprovada ? "aprovadas" : "reprovadas" };
  const href = (mudar: Record<string, string | undefined>) => linkCom(BASE, atual, mudar);
  const produtoAtivo = produtos.find((p) => p.id === filtros.produtoId);
  const filtrosAtivos = [
    produtoAtivo && { rotulo: `Curso · ${produtoAtivo.titulo}`, hrefRemover: href({ produto: undefined }) },
    atual.resultado && { rotulo: atual.resultado === "aprovadas" ? "Só aprovadas" : "Só reprovadas", hrefRemover: href({ resultado: undefined }) },
    filtros.busca && { rotulo: `Busca · ${filtros.busca}`, hrefRemover: href({ q: undefined }) },
  ].filter((f) => !!f);

  const linhas: Linha[] = lista.linhas.map((t) => [
    { tipo: "membro", nome: t.nome, email: t.email },
    { tipo: "texto", texto: t.avaliacao, sub: t.produto },
    { tipo: "no", conteudo: <span className="tabular-nums">{t.numero}ª</span> },
    t.nota === null
      ? { tipo: "texto", texto: "—" }
      : {
          tipo: "no",
          conteudo: (
            <span className="flex flex-col">
              <span className="font-bold tabular-nums">{formatarNota(t.nota)}%</span>
              <span className="text-xs text-muted tabular-nums">mínimo {formatarNota(t.notaMinima)}%</span>
            </span>
          ),
        },
    {
      tipo: "no",
      conteudo: t.emAndamento ? (
        <Status icone={<Clock />} tom="neutro">
          Em andamento
        </Status>
      ) : t.aprovada ? (
        <Status icone={<CheckCircle2 />} tom="ok">
          Aprovado
        </Status>
      ) : (
        <Status icone={<XCircle />} tom="warn" sub={t.finalizadaPor === "TEMPO" ? "tempo esgotado" : undefined}>
          Reprovado
        </Status>
      ),
    },
    { tipo: "data", texto: dataHoraCurta(t.finalizadaEm ?? t.iniciadaEm) },
  ]);

  const filtrando = Object.values(filtros).some((v) => v !== undefined);
  return (
    <PaginaTabela
      titulo="Matrículas"
      estatistica={`Avaliações · ${lista.total} ${lista.total === 1 ? "tentativa" : "tentativas"} de alunos${filtrando ? " no filtro" : ""}`}
      abas={ABAS_MATRICULAS}
      abaAtiva="Avaliações"
      busca="Pesquise pelo nome ou e-mail do aluno..."
      valorBusca={filtros.busca}
      formBusca={{ nome: "q", manter: manter(atual) }}
      filtrosAtivos={filtrosAtivos}
      controles={
        <MenusFiltro
          menus={[
            { rotulo: "Curso", itens: produtos.map((p) => ({ rotulo: p.titulo, href: href({ produto: p.id }), marcado: filtros.produtoId === p.id })) },
            {
              rotulo: "Resultado",
              itens: [
                { rotulo: "Todos", href: href({ resultado: undefined }), marcado: !atual.resultado },
                { rotulo: "Aprovadas", href: href({ resultado: "aprovadas" }), marcado: atual.resultado === "aprovadas" },
                { rotulo: "Reprovadas", href: href({ resultado: "reprovadas" }), marcado: atual.resultado === "reprovadas" },
              ],
            },
          ]}
        />
      }
      colunas={COLUNAS}
      linhas={linhas}
      chaves={lista.linhas.map((t) => t.tentativaId)}
      paginacao={{ pagina, porPagina: POR_PAGINA, total: lista.total, href: (n) => href({ pagina: String(n) }) }}
      vazio={
        filtrando
          ? { titulo: "Nenhuma tentativa encontrada", descricao: "Ajuste a busca ou remova os filtros." }
          : { titulo: "Nenhuma tentativa ainda", descricao: "Quando um aluno fizer uma avaliação, cada tentativa aparece aqui com a nota. A prévia da equipe não entra." }
      }
    />
  );
}

/** Tentativas dos alunos em todas as avaliações (RN-205), mais recentes primeiro. */
export default function PaginaAvaliacoesDosAlunos({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={<CarregandoLista />}>
      <Avaliacoes searchParams={searchParams} />
    </Suspense>
  );
}
