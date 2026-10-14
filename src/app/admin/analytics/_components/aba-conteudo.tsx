import Link from "next/link";
import { BookOpen, TrendingDown } from "lucide-react";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { buttonVariants } from "@/components/ui/button";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Estatistica } from "@/components/ui/estatistica";
import { Selo } from "@/components/ui/selo";
import { conteudoCacheado } from "@/lib/analytics/cache";
import { abandono, consulta, formatarDuracao, maiorQueda, ordenarAulas, taxa, type OrdemConteudo } from "@/lib/analytics/regras";
import { formatarTaxa } from "@/lib/painel/regras";
import { cn } from "@/lib/utils";
import { contextoAnalytics, type ParametrosAnalytics } from "./contexto";

const numero = new Intl.NumberFormat("pt-BR");
const pct = (t: number | null) => (t === null ? "—" : formatarTaxa(t));
const CELULA = "px-3 py-2.5 align-middle first:pl-5 last:pr-5";

export async function AbaConteudo({ parametros }: { parametros: ParametrosAnalytics }) {
  const { criadorId, filtros } = await contextoAnalytics(parametros);
  const { cursos, aulas } = await conteudoCacheado(criadorId, filtros.curso);

  if (cursos.length === 0) {
    return (
      <Cartao>
        <EstadoVazio
          icone={<BookOpen />}
          titulo="Nenhum curso ainda"
          descricao="Conclusão e abandono por aula aparecem depois que houver um curso com aulas publicadas."
          acao={<Link href="/admin/conteudos" className={buttonVariants({ variant: "secundario", size: "36" })}>Ir para Conteúdos</Link>}
          className="py-8"
        />
      </Cartao>
    );
  }

  const queda = maiorQueda(aulas);
  const linhas = ordenarAulas(aulas, filtros.ordem);
  const ordens: { valor: OrdemConteudo; rotulo: string }[] = [
    { valor: "abandono", rotulo: "Maior abandono" },
    { valor: "estrutura", rotulo: "Ordem do curso" },
  ];

  return (
    <>
      <p className="m-0 text-xs text-muted">Situação de hoje, acumulada desde o início (não depende do período). Só alunos; equipe não conta.</p>

      <section aria-label="Resumo por curso" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3.5">
        {cursos.map((c) => {
          const q = maiorQueda(aulas.filter((a) => a.produtoId === c.produtoId));
          return (
            <Cartao key={c.produtoId} como="article" className="flex min-w-0 flex-col gap-3">
              <CartaoTitulo tamanho={15} como="h2" className="truncate">{c.curso}</CartaoTitulo>
              <div className="grid grid-cols-2 gap-2.5">
                <Estatistica valor={numero.format(c.iniciaram)} rotulo="Começaram" />
                <Estatistica valor={numero.format(c.concluiram)} rotulo="Concluíram o curso" />
                <Estatistica valor={pct(taxa(c.concluiram, c.iniciaram))} rotulo="Conclusão do curso" />
                <Estatistica valor={c.iniciaram ? formatarDuracao(c.tempoMedioSeg) : "—"} rotulo="Tempo médio por aluno" />
              </div>
              <div className="text-xs text-muted">
                {q ? (
                  <>
                    <TrendingDown className="mr-1 inline size-3.5 align-[-2px] text-warn" aria-hidden />
                    Maior queda: <b className="font-semibold text-text">Aula {q.numero} · {q.titulo}</b> ({pct(abandono(q))} pararam)
                  </>
                ) : (
                  "Nenhum aluno parou no meio de uma aula."
                )}
              </div>
            </Cartao>
          );
        })}
      </section>

      <Cartao como="section" padding={0} aria-labelledby="titulo-aulas" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <CartaoTitulo id="titulo-aulas" tamanho={15} como="h2">Onde os alunos param</CartaoTitulo>
            <p className="m-0 mt-0.5 text-xs text-muted">Abandono = começou a aula e não chegou a 90%.</p>
          </div>
          <nav aria-label="Ordenar aulas" className="inline-flex overflow-hidden rounded-[9px] border border-border bg-surface">
            {ordens.map((o) => (
              <Link
                key={o.valor}
                href={`/admin/analytics?${consulta({ ...filtros, ordem: o.valor })}`}
                scroll={false}
                aria-current={filtros.ordem === o.valor ? "page" : undefined}
                className={cn(
                  "grid min-h-11 place-items-center px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap no-underline desk:min-h-0",
                  filtros.ordem === o.valor ? "bg-accent-soft text-accent" : "text-muted hover:text-text"
                )}
              >
                {o.rotulo}
              </Link>
            ))}
          </nav>
        </div>
        {linhas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma aula publicada" descricao="Publique um módulo com aulas para ver o funil." className="pb-8" />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-[13px] desk:min-w-[760px]">
              <caption className="sr-only">Aulas por taxa de abandono{filtros.ordem === "abandono" ? ", maior primeiro" : ", na ordem do curso"}</caption>
              <thead>
                <tr className="border-y border-border bg-surface-2 text-xs text-muted">
                  <th scope="col" className={cn(CELULA, "font-normal")}>Aula</th>
                  <th scope="col" className={cn(CELULA, "font-normal desk:w-[230px]")} aria-sort={filtros.ordem === "abandono" ? "descending" : undefined}>Abandono</th>
                  <th scope="col" className={cn(CELULA, "text-right font-normal")}>Começaram</th>
                  <th scope="col" className={cn(CELULA, "text-right font-normal")}>Concluíram</th>
                  <th scope="col" className={cn(CELULA, "text-right font-normal")}>Conclusão</th>
                  <th scope="col" className={cn(CELULA, "text-right font-normal")}>Tempo médio</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((a) => {
                  const ab = abandono(a);
                  const destaque = queda?.aulaId === a.aulaId;
                  return (
                    <tr key={a.aulaId} className={cn("border-b border-border last:border-b-0", destaque && "bg-warn-soft")}>
                      <th scope="row" className={cn(CELULA, "font-normal")}>
                        <div className="w-[180px] desk:w-auto desk:max-w-[340px]">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-semibold">{a.numero} · {a.titulo}</span>
                            {destaque && <Selo tom="warn" className="shrink-0">Maior queda</Selo>}
                          </div>
                          <div className="truncate text-[11px] text-muted">{a.curso}</div>
                        </div>
                      </th>
                      <td className={CELULA}>
                        {ab === null ? (
                          <span className="whitespace-nowrap text-muted">Ninguém começou</span>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <div aria-hidden className="hidden flex-1 desk:block">
                              <BarraProgresso valor={ab * 100} />
                            </div>
                            <span className="shrink-0 whitespace-nowrap tabular-nums desk:w-[92px] desk:text-right">
                              {pct(ab)} <span className="text-muted">({numero.format(a.pararam)})</span>
                            </span>
                          </div>
                        )}
                      </td>
                      <td className={cn(CELULA, "text-right tabular-nums")}>{numero.format(a.iniciaram)}</td>
                      <td className={cn(CELULA, "text-right tabular-nums")}>{numero.format(a.concluiram)}</td>
                      <td className={cn(CELULA, "text-right tabular-nums")}>{pct(taxa(a.concluiram, a.iniciaram))}</td>
                      <td className={cn(CELULA, "text-right tabular-nums")}>{a.iniciaram ? formatarDuracao(a.tempoMedioSeg) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </>
  );
}
