import type { Metadata } from "next";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { Avatar } from "@/components/ui/avatar";
import { PeriodoRankingLinks } from "@/components/gamificacao/periodo-ranking";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { configDaGamificacao } from "@/lib/gamificacao/pontos";
import { rankingDoCriador, saldosDosMembros } from "@/lib/gamificacao/ranking";
import { lerPeriodoRanking, nivelDoMembro, pontosPtBr, ROTULO_PERIODO_RANKING } from "@/lib/gamificacao/regras";
import { AvisoDesligada } from "../_components/aviso-desligada";
import { ABAS_DESAFIOS } from "../_components/comum";

export const metadata: Metadata = { title: "Ranking" };

const COLUNAS: Coluna[] = [
  { titulo: "Posição", largura: 80 },
  { titulo: "Aluno" },
  { titulo: "Nível", largura: 150 },
  { titulo: "Pontos", largura: 110 },
];

type Busca = Promise<Record<string, string | string[] | undefined>>;

/** Top 50 por semana/mês/total (RN-146): só alunos ativos que não saíram do ranking. */
async function Ranking({ searchParams }: { searchParams: Busca }) {
  const { criador, membro } = await membroDaPagina(EQUIPE);
  const periodo = lerPeriodoRanking((await searchParams).periodo);
  const agora = new Date();
  const [lista, config] = await Promise.all([rankingDoCriador(criador.id, periodo, agora, 50), configDaGamificacao(criador.id)]);
  const saldos = periodo === "total" ? new Map(lista.map((l) => [l.membroId, l.pontos])) : await saldosDosMembros(criador.id, lista.map((l) => l.membroId));

  const linhas: Linha[] = lista.map((l) => [
    { tipo: "no", conteudo: <span className="font-extrabold tabular-nums">{l.posicao}º</span> },
    {
      tipo: "no",
      conteudo: (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar nome={l.nome} src={l.imagem} tamanho={32} />
          <span className="truncate font-bold">{l.nome}</span>
        </span>
      ),
    },
    { tipo: "texto", texto: nivelDoMembro(saldos.get(l.membroId) ?? 0, config.niveis).atual.nome },
    { tipo: "numeroDestaque", texto: pontosPtBr(l.pontos) },
  ]);

  return (
    <div className="flex flex-col gap-4">
      {!config.ligada && <AvisoDesligada dono={membro.papel === "DONO"} />}
      <PaginaTabela
        titulo="Desafios"
        estatistica={`Ranking · ${ROTULO_PERIODO_RANKING[periodo].toLowerCase()} · ${lista.length === 50 ? "top 50" : `${lista.length} ${lista.length === 1 ? "aluno" : "alunos"}`}`}
        abas={ABAS_DESAFIOS}
        abaAtiva="Ranking"
        controles={<PeriodoRankingLinks ativo={periodo} href={(p) => (p === "semana" ? "/admin/desafios/ranking" : `/admin/desafios/ranking?periodo=${p}`)} />}
        colunas={COLUNAS}
        linhas={linhas}
        chaves={lista.map((l) => l.membroId)}
        semBusca
        vazio={{ titulo: "Ninguém pontuou neste período", descricao: "Aparecem aqui os alunos ativos com pontos no período que não saíram do ranking no Perfil." }}
      />
    </div>
  );
}

export default function PaginaRanking({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Ranking searchParams={searchParams} />
    </Suspense>
  );
}
