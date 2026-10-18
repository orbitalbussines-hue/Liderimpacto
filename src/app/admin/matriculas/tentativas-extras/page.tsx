import type { Metadata } from "next";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { SegmentosLink } from "@/components/ui/segmentos-link";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { formatarNota } from "@/lib/avaliacoes/regras";
import { concessoesDoCriador, esgotaramSemAprovar } from "@/lib/matriculas/abas";
import { ConcederTentativa } from "../../avaliacoes/[id]/alunos/conceder-tentativa";
import { dataHoraCurta } from "../../conteudos/_components/comum";
import { CarregandoLista } from "../_components/carregando";
import { ABAS_MATRICULAS, lerBusca, lerPagina, linkCom, manter, POR_PAGINA, um, type Busca } from "../_components/comum";

export const metadata: Metadata = { title: "Tentativas extras" };

const BASE = "/admin/matriculas/tentativas-extras";
const COLUNAS_FILA: Coluna[] = [
  { titulo: "Aluno" },
  { titulo: "Avaliação", largura: 230 },
  { titulo: "Tentativas", largura: 130 },
  { titulo: "Melhor nota", largura: 100 },
  { titulo: "Última em", largura: 130 },
  { titulo: "Ação", largura: 200 },
];
const COLUNAS_HISTORICO: Coluna[] = [
  { titulo: "Aluno", largura: 230 },
  { titulo: "Avaliação", largura: 210 },
  { titulo: "Extras", largura: 80 },
  { titulo: "Motivo" },
  { titulo: "Concedida por", largura: 150 },
  { titulo: "Quando", largura: 130 },
];

const sem = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

async function TentativasExtras({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const historico = um(sp.ver) === "historico";
  const busca = historico ? undefined : lerBusca(sp.q);
  const pagina = lerPagina(sp.pagina);
  // A fila vem inteira (até 200, a consulta limita): busca e página aqui, como em Avaliações › Alunos.
  const [fila, concessoes] = await Promise.all([
    esgotaramSemAprovar(criador.id),
    historico ? concessoesDoCriador(criador.id, { pagina, porPagina: POR_PAGINA }) : null,
  ]);
  const filtrada = busca ? fila.filter((a) => sem(`${a.nome} ${a.email}`).includes(sem(busca))) : fila;
  const filaDaPagina = filtrada.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const atual = { ver: historico ? "historico" : undefined, q: busca };
  const href = (mudar: Record<string, string | undefined>) => linkCom(BASE, atual, mudar);

  const linhas: Linha[] = concessoes
    ? concessoes.linhas.map((c) => [
        { tipo: "membro", nome: c.nome, email: c.email },
        { tipo: "texto", texto: c.avaliacao },
        { tipo: "no", conteudo: <span className="font-semibold tabular-nums">+{c.quantidade}</span> },
        {
          tipo: "no",
          conteudo: (
            <p className="m-0 line-clamp-2 break-words whitespace-normal" title={c.motivo}>
              {c.motivo}
            </p>
          ),
        },
        { tipo: "texto", texto: c.concedidaPor ?? "—" },
        { tipo: "data", texto: dataHoraCurta(c.quando) },
      ])
    : filaDaPagina.map((a) => [
        { tipo: "membro", nome: a.nome, email: a.email },
        { tipo: "texto", texto: a.avaliacao, sub: a.produto },
        {
          tipo: "texto",
          texto: `${a.finalizadas} ${a.finalizadas === 1 ? "feita" : "feitas"}`,
          sub: a.extras ? `+${a.extras} ${a.extras === 1 ? "concedida" : "concedidas"} antes` : "nenhuma extra ainda",
        },
        a.melhorNota === null ? { tipo: "texto", texto: "—" } : { tipo: "no", conteudo: <span className="font-bold tabular-nums">{formatarNota(a.melhorNota)}%</span> },
        { tipo: "data", texto: dataHoraCurta(a.ultimaEm) },
        { tipo: "no", conteudo: <ConcederTentativa avaliacaoId={a.avaliacaoId} aluno={{ membroId: a.membroId, nome: a.nome }} /> },
      ]);

  const estatistica = historico
    ? `${concessoes?.total ?? 0} ${concessoes?.total === 1 ? "concessão" : "concessões"} no histórico`
    : `${fila.length} ${fila.length === 1 ? "aluno aguardando" : "alunos aguardando"} decisão${fila.length === 200 ? " (mostrando os 200 mais recentes)" : ""}`;

  return (
    <PaginaTabela
      titulo="Matrículas"
      estatistica={`Tentativas extras · ${estatistica}`}
      abas={ABAS_MATRICULAS}
      abaAtiva="Tentativas extras"
      semBusca={historico}
      busca="Pesquise pelo nome ou e-mail do aluno..."
      valorBusca={busca}
      formBusca={{ nome: "q", manter: manter(atual) }}
      filtrosAtivos={busca ? [{ rotulo: `Busca · ${busca}`, hrefRemover: href({ q: undefined }) }] : []}
      controles={
        <SegmentosLink
          aria-label="Visão das tentativas extras"
          opcoes={[
            { rotulo: "Esgotaram sem aprovar", href: BASE, ativo: !historico },
            { rotulo: "Histórico", href: `${BASE}?ver=historico`, ativo: historico },
          ]}
        />
      }
      colunas={historico ? COLUNAS_HISTORICO : COLUNAS_FILA}
      linhas={linhas}
      chaves={concessoes ? concessoes.linhas.map((c) => c.id) : filaDaPagina.map((a) => `${a.membroId}:${a.avaliacaoId}`)}
      paginacao={{ pagina, porPagina: POR_PAGINA, total: concessoes ? concessoes.total : filtrada.length, href: (n) => href({ pagina: String(n) }) }}
      vazio={
        historico
          ? { titulo: "Nenhuma tentativa concedida ainda", descricao: "Cada tentativa extra fica registrada aqui com o motivo e quem concedeu." }
          : busca
            ? { titulo: "Nenhum aluno encontrado", descricao: "Tente outro nome ou e-mail." }
            : { titulo: "Ninguém aguardando", descricao: "Quem esgotar as tentativas de uma avaliação sem aprovar aparece aqui para a equipe decidir se libera mais uma." }
      }
    />
  );
}

/**
 * Tentativas extras (ADR-0018 item 6, no lugar de "Correção"): quem esgotou sem aprovar, com
 * "Conceder tentativa" (motivo + modal block), e o histórico das concessões.
 */
export default function PaginaTentativasExtras({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={<CarregandoLista />}>
      <TentativasExtras searchParams={searchParams} />
    </Suspense>
  );
}
