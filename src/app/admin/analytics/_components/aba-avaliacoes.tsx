import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Estatistica } from "@/components/ui/estatistica";
import { avaliacoesCacheadas } from "@/lib/analytics/cache";
import { taxa } from "@/lib/analytics/regras";
import { frasePeriodo } from "@/lib/painel/periodo";
import { formatarTaxa } from "@/lib/painel/regras";
import { contextoAnalytics, type ParametrosAnalytics } from "./contexto";

const numero = new Intl.NumberFormat("pt-BR");
const nota = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export async function AbaAvaliacoes({ parametros }: { parametros: ParametrosAnalytics }) {
  const { criadorId, filtros, periodo, hoje } = await contextoAnalytics(parametros);
  const avs = await avaliacoesCacheadas(criadorId, periodo, filtros.curso);

  if (avs.length === 0) {
    return (
      <Cartao>
        <EstadoVazio
          icone={<ClipboardList />}
          titulo="Nenhuma avaliação publicada"
          descricao="Tentativas, aprovação e as questões com mais erros aparecem aqui depois que uma avaliação for publicada."
          acao={<Link href="/admin/avaliacoes" className={buttonVariants({ variant: "secundario", size: "36" })}>Ir para Avaliações</Link>}
          className="py-8"
        />
      </Cartao>
    );
  }

  return (
    <>
      <p className="m-0 text-xs text-muted">
        Tentativas de alunos finalizadas {frasePeriodo(periodo, hoje)}. Aprovação = alunos com ao menos uma tentativa aprovada ÷ alunos que finalizaram.
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-3.5">
        {avs.map((a) => {
          const ap = taxa(a.aprovados, a.alunos);
          return (
            <Cartao key={a.avaliacaoId} como="article" aria-labelledby={`av-${a.avaliacaoId}`} className="flex min-w-0 flex-col gap-3.5">
              <div className="min-w-0">
                <CartaoTitulo id={`av-${a.avaliacaoId}`} tamanho={15} como="h2" className="truncate">{a.titulo}</CartaoTitulo>
                <div className="truncate text-xs text-muted">{a.curso} · nota mínima {a.notaMinima}</div>
              </div>
              {a.tentativas === 0 ? (
                <p className="m-0 rounded-xl bg-surface-2 p-3.5 text-[13px] text-muted">Nenhuma tentativa finalizada no período.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Estatistica valor={numero.format(a.tentativas)} rotulo={`Tentativas · ${numero.format(a.alunos)} ${a.alunos === 1 ? "aluno" : "alunos"}`} />
                    <Estatistica valor={ap === null ? "—" : formatarTaxa(ap)} rotulo={`Aprovação · ${numero.format(a.aprovados)} ${a.aprovados === 1 ? "aprovado" : "aprovados"}`} />
                    <Estatistica valor={a.notaMedia === null ? "—" : nota.format(a.notaMedia)} rotulo={`Nota média de 0 a 100 · mínima ${a.notaMinima}`} className="col-span-2" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <h3 className="m-0 text-[11px] font-bold tracking-[.1em] text-muted uppercase">Questões com mais erros</h3>
                    {a.questoes.length === 0 ? (
                      <p className="m-0 text-[13px] text-muted">Nenhum erro no período.</p>
                    ) : (
                      <ol className="m-0 flex list-none flex-col gap-2 p-0">
                        {a.questoes.map((q) => (
                          <li key={q.questaoId} className="flex items-start justify-between gap-3 border-b border-border pb-2 text-[13px] last:border-b-0 last:pb-0">
                            <span className="min-w-0">
                              {q.enunciado === null ? (
                                <span className="text-muted">Questão removida</span>
                              ) : (
                                <span className="line-clamp-2">
                                  <b className="font-semibold">{q.ordem}.</b> {q.enunciado}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-right tabular-nums">
                              <b className="font-semibold">{formatarTaxa(q.erros / q.respostas)}</b>
                              <span className="block text-[11px] text-muted">{numero.format(q.erros)} de {numero.format(q.respostas)} erraram</span>
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </>
              )}
            </Cartao>
          );
        })}
      </div>
    </>
  );
}
