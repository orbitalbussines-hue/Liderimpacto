import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { buttonVariants } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { historicoDaAutomacao, listarAutomacoes } from "@/lib/marketing/consultas";
import { dataHoraCurta, ehUuid } from "../../conteudos/_components/comum";
import { ABAS_AUTOMACOES, descreverGatilho, descreverReferencia, resultadoDaExecucao } from "../_components/comum";
import { EscolherAutomacao } from "../_components/escolher-automacao";

export const metadata: Metadata = { title: "Histórico das automações" };

const POR_PAGINA = 30;
const COLUNAS: Coluna[] = [
  { titulo: "Pessoa" },
  { titulo: "O que aconteceu", largura: 190 },
  { titulo: "Quando", largura: 150 },
  { titulo: "Resultado", largura: 240 },
];

type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const dataCurta = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });

async function Historico({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const automacoes = await listarAutomacoes(criador.id);
  const pedida = um(sp.automacao);
  if (pedida && !ehUuid(pedida)) notFound();
  // Sem escolha: a mais recente que já fez algo (senão, a mais recente).
  const a = pedida ? automacoes.find((x) => x.id === pedida) : (automacoes.find((x) => x.execucoes + x.agendadas > 0) ?? automacoes[0]);
  if (pedida && !a) notFound();
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(um(sp.pagina) ?? "1", 10) || 1));
  const h = a ? await historicoDaAutomacao(criador.id, a.id, { pagina, porPagina: POR_PAGINA }) : null;

  const linhas: Linha[] = (h?.linhas ?? []).map((l) => {
    const r = resultadoDaExecucao(l);
    const extras = [l.tagAplicada && l.envioSituacao ? "tag aplicada" : null, l.abertoEm ? "abriu" : null, l.clicadoEm ? "clicou" : null].filter(Boolean).join(" · ");
    return [
      { tipo: "membro", nome: l.nome, email: l.email },
      { tipo: "texto", texto: descreverReferencia(l.referencia, dataCurta) },
      {
        tipo: "no",
        conteudo: (
          <div className="flex flex-col text-[13px]">
            <span className="tabular-nums">{dataHoraCurta(l.executadaEm ?? l.executarEm)}</span>
            {l.situacao === "AGENDADA" && <span className="text-xs text-muted">horário marcado</span>}
          </div>
        ),
      },
      {
        tipo: "no",
        conteudo: (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <Selo tom={r.tom}>{r.texto}</Selo>
              {extras && <span className="text-xs text-muted">{extras}</span>}
            </span>
            {r.detalhe && (
              <span className="line-clamp-2 text-xs text-muted" title={r.detalhe}>
                {r.detalhe}
              </span>
            )}
          </div>
        ),
      },
    ];
  });

  const total = h?.total ?? 0;
  return (
    <PaginaTabela
      titulo="Automações"
      estatistica={a ? `${descreverGatilho(a.gatilho, a.produto, a.dias)} · ${total.toLocaleString("pt-BR")} ${total === 1 ? "registro" : "registros"}` : undefined}
      abas={ABAS_AUTOMACOES}
      abaAtiva="Histórico"
      semBusca
      controles={
        a && (
          <>
            <EscolherAutomacao opcoes={automacoes.map((x) => ({ valor: x.id, rotulo: `${x.nome}${x.situacao === "PAUSADA" ? " (pausada)" : ""}` }))} atual={a.id} />
            <Link href={`/admin/automacoes/${a.id}`} className={buttonVariants({ variant: "contorno", size: "36" })}>
              Editar automação
            </Link>
          </>
        )
      }
      colunas={COLUNAS}
      linhas={linhas}
      chaves={h?.linhas.map((l) => l.id)}
      paginacao={{ pagina, porPagina: POR_PAGINA, total, href: (p) => `/admin/automacoes/historico?automacao=${a?.id ?? ""}&pagina=${p}` }}
      vazio={
        a
          ? { titulo: "Nada aconteceu ainda", descricao: a.situacao === "PAUSADA" ? "Esta automação está pausada. Ative para ela começar a agir." : "Assim que alguém disparar o gatilho, aparece aqui." }
          : { titulo: "Nenhuma automação ainda", descricao: "Crie uma automação na aba Automações; o que ela fizer aparece aqui." }
      }
    />
  );
}

/** Aba "Histórico" (RN-224): cada execução da automação — quem, o quê, quando e o resultado. */
export default function PaginaHistoricoAutomacoes({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Historico searchParams={searchParams} />
    </Suspense>
  );
}
