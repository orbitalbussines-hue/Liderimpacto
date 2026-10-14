import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { desafiosDoAdmin } from "@/lib/gamificacao/admin";
import { configDaGamificacao } from "@/lib/gamificacao/pontos";
import { textoDaMeta } from "@/lib/gamificacao/regras";
import { AcoesDesafio } from "./_components/acoes-desafio";
import { ABAS_DESAFIOS, SELO_SITUACAO, periodoCurto } from "./_components/comum";
import { AvisoDesligada } from "./_components/aviso-desligada";

export const metadata: Metadata = { title: "Desafios" };

const COLUNAS: Coluna[] = [
  { titulo: "Desafio" },
  { titulo: "Período", largura: 130 },
  { titulo: "Meta", largura: 190 },
  { titulo: "Participantes", largura: 110 },
  { titulo: "Concluídos", largura: 100 },
  { titulo: "Situação", largura: 110 },
  { titulo: "Ações", largura: 56 },
];

type Busca = Promise<Record<string, string | string[] | undefined>>;

async function Desafios({ searchParams }: { searchParams: Busca }) {
  const { criador, membro } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const busca = (typeof sp.q === "string" ? sp.q.trim() : "").slice(0, 100);
  const agora = new Date();
  const [todos, config] = await Promise.all([desafiosDoAdmin(criador.id, agora), configDaGamificacao(criador.id)]);
  // ponytail: filtro em memória (até 200 desafios por criador); levar à consulta se passar disso.
  const termo = busca.toLocaleLowerCase("pt-BR");
  const desafios = termo ? todos.filter((d) => d.titulo.toLocaleLowerCase("pt-BR").includes(termo)) : todos;
  const ativos = todos.filter((d) => d.momento === "ATIVO").length;

  const linhas: Linha[] = desafios.map((d) => [
    {
      tipo: "no",
      conteudo: (
        <Link href={`/admin/desafios/${d.id}`} className="block min-w-0 font-semibold hover:underline">
          <span className="block truncate">{d.titulo}</span>
          {d.recompensa && <span className="block truncate text-xs font-normal text-muted">Recompensa: {d.recompensa}</span>}
        </Link>
      ),
    },
    { tipo: "texto", texto: periodoCurto(d.inicioEm, d.fimEm) },
    { tipo: "texto", texto: textoDaMeta(d.metaTipo, d.meta) },
    { tipo: "numeroDestaque", texto: String(d.participantes) },
    { tipo: "numeroDestaque", texto: String(d.concluidos) },
    { tipo: "selo", texto: SELO_SITUACAO[d.momento].texto, tom: SELO_SITUACAO[d.momento].tom },
    {
      tipo: "no",
      conteudo: <AcoesDesafio desafio={{ id: d.id, titulo: d.titulo, situacao: d.situacao, participantes: d.participantes, versao: d.versao.toISOString() }} />,
    },
  ]);

  return (
    <div className="flex flex-col gap-4">
      {!config.ligada && <AvisoDesligada dono={membro.papel === "DONO"} />}
      <PaginaTabela
        titulo="Desafios"
        estatistica={
          <>
            {todos.length} total · <b className="text-ok">{ativos === 1 ? "1 ativo" : `${ativos} ativos`}</b> · {todos.filter((d) => d.situacao === "RASCUNHO").length} em rascunho
          </>
        }
        abas={ABAS_DESAFIOS}
        abaAtiva="Desafios"
        busca="Pesquise pelo título..."
        valorBusca={busca || undefined}
        formBusca={{ nome: "q" }}
        filtrosAtivos={busca ? [{ rotulo: `Busca · ${busca}`, hrefRemover: "/admin/desafios" }] : []}
        acaoPrincipal={{ rotulo: "Novo desafio", icone: Plus, href: "/admin/desafios/novo" }}
        colunas={COLUNAS}
        linhas={linhas}
        chaves={desafios.map((d) => d.id)}
        vazio={
          busca
            ? { titulo: "Nenhum desafio encontrado", descricao: "Ajuste a busca." }
            : { titulo: "Nenhum desafio ainda", descricao: "Crie uma meta com prazo (aulas, curso, avaliação ou publicações), um bônus em pontos e, se quiser, uma recompensa." }
        }
      />
    </div>
  );
}

/** Desafios do criador do HOST (DONO e ADMIN): RN-147. */
export default function PaginaDesafios({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Desafios searchParams={searchParams} />
    </Suspense>
  );
}
