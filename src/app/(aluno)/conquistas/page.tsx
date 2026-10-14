import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Flag } from "lucide-react";
import { PeriodoRankingLinks } from "@/components/gamificacao/periodo-ranking";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Esqueleto } from "@/components/ui/esqueleto";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { conquistasDoMembro } from "@/lib/gamificacao/conquistas";
import type { DesafioDoMembro } from "@/lib/gamificacao/desafios";
import { lerPeriodoRanking } from "@/lib/gamificacao/regras";
import { CartaoDesafio } from "./_components/cartao-desafio";
import { CartaoNivel } from "./_components/cartao-nivel";
import { ExtratoPontos } from "./_components/extrato-pontos";
import { ListaRanking } from "./_components/lista-ranking";

export const metadata: Metadata = { title: "Conquistas" };

type Busca = Promise<Record<string, string | string[] | undefined>>;

const GRADE = "grid gap-4 min-[700px]:grid-cols-2";

function GrupoDesafios({ titulo, id, desafios }: { titulo: string; id: string; desafios: DesafioDoMembro[] }) {
  if (desafios.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="m-0 text-sm font-bold text-muted">
        {titulo} <span className="font-normal">({desafios.length})</span>
      </h3>
      <ul className={`m-0 list-none p-0 ${GRADE}`}>
        {desafios.map((d) => (
          <li key={d.id} className="grid">
            <CartaoDesafio desafio={d} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Conquistas do aluno (RN-144 a RN-147): pontos e nível, desafios, ranking e extrato. Desligada = 404. */
async function Conquistas({ searchParams }: { searchParams: Busca }) {
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  const periodo = lerPeriodoRanking((await searchParams).periodo);
  const c = await conquistasDoMembro(q, periodo, new Date());
  if (!c) notFound();
  const { disponiveis, emAndamento, concluidos } = c.desafios;
  const semDesafios = disponiveis.length + emAndamento.length + concluidos.length === 0;
  const minha = c.minhaForaDoTop && { ...c.minhaForaDoTop, nome: q.usuario.nome };

  return (
    <div className="grid items-start gap-6 desk:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-6">
        {c.resumo && <CartaoNivel resumo={c.resumo} />}
        <section aria-labelledby="titulo-desafios" className="flex flex-col gap-4">
          <h2 id="titulo-desafios" className="m-0 text-lg font-extrabold">
            Desafios
          </h2>
          {semDesafios ? (
            <EstadoVazio comMoldura icone={<Flag />} titulo="Nenhum desafio por enquanto" descricao="Quando a equipe abrir um desafio para você, ele aparece aqui com a meta, o prazo e o bônus." />
          ) : (
            <>
              <GrupoDesafios id="desafios-andamento" titulo="Em andamento" desafios={emAndamento} />
              <GrupoDesafios id="desafios-disponiveis" titulo="Disponíveis" desafios={disponiveis} />
              <GrupoDesafios id="desafios-concluidos" titulo="Concluídos" desafios={concluidos} />
            </>
          )}
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-6">
        <Cartao como="section" raio={18} padding={20} aria-labelledby="titulo-ranking" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CartaoTitulo id="titulo-ranking" tamanho={16} como="h2">
              Ranking
            </CartaoTitulo>
            <PeriodoRankingLinks ativo={periodo} href={(p) => (p === "semana" ? "/conquistas" : `/conquistas?periodo=${p}`)} />
          </div>
          {c.ranking.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">Ninguém pontuou neste período ainda.</p>
          ) : (
            <ListaRanking linhas={c.ranking} meuId={q.membro.id} minhaForaDoTop={minha} />
          )}
        </Cartao>
        {c.resumo && (
          <Cartao como="section" raio={18} padding={20} aria-labelledby="titulo-extrato" className="flex flex-col gap-2">
            <CartaoTitulo id="titulo-extrato" tamanho={16} como="h2">
              Últimos pontos
            </CartaoTitulo>
            <ExtratoPontos lancamentos={c.extrato} />
          </Cartao>
        )}
      </aside>
    </div>
  );
}

function EsqueletoConquistas() {
  return (
    <div aria-busy="true" className="grid items-start gap-6 desk:grid-cols-[minmax(0,1fr)_380px]">
      <span className="sr-only">Carregando suas conquistas</span>
      <div className="flex flex-col gap-6">
        <Esqueleto className="h-[260px] rounded-[18px]" />
        <Esqueleto className="h-[220px] rounded-2xl" />
      </div>
      <Esqueleto className="h-[420px] rounded-[18px]" />
    </div>
  );
}

export default function PaginaConquistas({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <CabecalhoPagina variante="aluno" titulo="Conquistas" descricao="Seus pontos, os desafios abertos e como você está no ranking da turma." />
      <Suspense fallback={<EsqueletoConquistas />}>
        <Conquistas searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
