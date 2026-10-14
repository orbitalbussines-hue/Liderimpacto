import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { CartaoKpi } from "@/components/admin/cartao-kpi";
import { buttonVariants } from "@/components/ui/button";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { visaoGeralCacheada } from "@/lib/analytics/cache";
import { formatarHoras, taxa, variacaoEmPontos } from "@/lib/analytics/regras";
import { agrupamentoDaSerie, frasePeriodo, rotuloDoPeriodo } from "@/lib/painel/periodo";
import { formatarTaxa, textoDaVariacao, variacao } from "@/lib/painel/regras";
import { contextoAnalytics, type ParametrosAnalytics } from "./contexto";
import { GraficoBarrasDia } from "./grafico-barras-dia";

const numero = new Intl.NumberFormat("pt-BR");

/** KPI com variação relativa (contagens). `anterior` nulo = comparação indisponível (dito por extenso). */
function KpiContagem({ rotulo, atual, anterior, valor, indisponivel, complemento }: { rotulo: string; atual: number; anterior: number | null; valor?: string; indisponivel?: string; complemento?: string }) {
  if (anterior === null) {
    return <CartaoKpi rotulo={rotulo} valor={valor ?? numero.format(atual)} variacao={indisponivel} legenda="" complemento={complemento} />;
  }
  const vr = variacao(atual, anterior);
  const v = textoDaVariacao(vr);
  const vazio = vr.tipo === "sem-dados";
  return (
    <CartaoKpi
      rotulo={rotulo}
      valor={valor ?? numero.format(atual)}
      variacao={vazio ? "Sem movimento nos dois períodos" : v.texto}
      variacaoLeitor={vazio ? undefined : v.leitor}
      tom={v.tom}
      legenda={vazio ? "" : undefined}
      complemento={complemento}
    />
  );
}

export async function AbaVisaoGeral({ parametros }: { parametros: ParametrosAnalytics }) {
  const { criadorId, filtros, periodo, hoje, cursoTitulo } = await contextoAnalytics(parametros);
  const { curso } = filtros;
  const { kpis: k, horas, serie } = await visaoGeralCacheada(criadorId, periodo, curso);
  const frase = frasePeriodo(periodo, hoje);
  const rotulo = rotuloDoPeriodo(periodo, hoje);
  const porSemana = agrupamentoDaSerie(periodo.dias) === "semana";
  const porQuando = porSemana ? "por semana" : "por dia";
  const grafico = { ultimoEhHoje: periodo.ate === hoje, porSemana };
  const conclusao = taxa(k.validasConcluidas, k.validas);
  const aprovacao = taxa(k.aprovados, k.avaliados);
  const vAprov = variacaoEmPontos(aprovacao, taxa(k.aprovadosAnt, k.avaliadosAnt));
  const semAtividade = serie.every((d) => d.alunos === 0 && d.visualizacoes === 0);

  return (
    <>
      <section aria-label={`Indicadores ${frase}${cursoTitulo ? ` em ${cursoTitulo}` : ""}`} className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5">
        <KpiContagem rotulo="Alunos ativos" atual={k.ativos} anterior={k.ativosAnt} indisponivel="Comparação indisponível por curso" />
        <KpiContagem
          rotulo="Horas assistidas"
          atual={horas.segundos}
          anterior={horas.recorte === "periodo" ? horas.segundosAnt : null}
          valor={formatarHoras(horas.segundos)}
          indisponivel="Acumulado desde o início"
          complemento={horas.recorte === "acumulado" ? "Ainda sem recorte por período" : undefined}
        />
        <KpiContagem rotulo="Aulas concluídas" atual={k.aulas} anterior={k.aulasAnt} />
        <CartaoKpi
          rotulo="Conclusão de cursos"
          valor={conclusao === null ? "—" : formatarTaxa(conclusao)}
          variacao={k.validas === 0 ? "Nenhuma matrícula valendo" : `${numero.format(k.validasConcluidas)} de ${numero.format(k.validas)} matrículas valendo`}
          legenda=""
          complemento={`${numero.format(k.cursosConcluidos)} ${k.cursosConcluidos === 1 ? "concluído" : "concluídos"} no período (antes: ${numero.format(k.cursosConcluidosAnt)})`}
        />
        <CartaoKpi
          rotulo="Aprovação em avaliações"
          valor={aprovacao === null ? "—" : formatarTaxa(aprovacao)}
          variacao={aprovacao === null ? "Nenhuma avaliação finalizada" : vAprov.texto === "—" ? "Sem avaliação no período anterior" : vAprov.texto}
          variacaoLeitor={aprovacao === null || vAprov.texto === "—" ? undefined : vAprov.leitor}
          tom={vAprov.tom}
          legenda={aprovacao === null || vAprov.texto === "—" ? "" : undefined}
          complemento={k.avaliados > 0 ? `${numero.format(k.aprovados)} de ${numero.format(k.avaliados)} ${k.avaliados === 1 ? "aluno" : "alunos"} (por avaliação)` : undefined}
        />
      </section>

      {semAtividade ? (
        <Cartao>
          <EstadoVazio
            icone={<BarChart3 />}
            titulo={`Nenhuma aula assistida ${frase}`}
            descricao="Os gráficos aparecem quando os alunos matriculados começarem a assistir."
            acao={
              <Link href="/admin/matriculas" className={buttonVariants({ variant: "secundario", size: "36" })}>
                Ver matrículas
              </Link>
            }
            className="py-8"
          />
        </Cartao>
      ) : (
        <div className="grid items-start gap-3.5 desk:grid-cols-2">
          <Cartao como="section" aria-labelledby="titulo-ativos-dia" className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <CartaoTitulo id="titulo-ativos-dia" tamanho={15} como="h2">
                Alunos ativos {porQuando}
              </CartaoTitulo>
              <span className="text-xs text-muted">{curso ? "todos os cursos" : rotulo}</span>
            </div>
            <p className="m-0 -mt-2 text-xs text-muted">
              {curso ? "O registro diário de atividade não separa por curso: esta série mostra todos os cursos." : porSemana ? "Alunos distintos que assistiram a alguma aula na semana." : "Alunos distintos que assistiram a alguma aula no dia."}
            </p>
            <GraficoBarrasDia pontos={serie.map((d) => ({ dia: d.dia, valor: d.alunos }))} unidade="alunos" legenda={`Alunos com atividade de aula ${porQuando}, ${frase}, todos os cursos`} {...grafico} />
          </Cartao>
          <Cartao como="section" aria-labelledby="titulo-visualizacoes-dia" className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <CartaoTitulo id="titulo-visualizacoes-dia" tamanho={15} como="h2">
                Visualizações de aula {porQuando}
              </CartaoTitulo>
              <span className="text-xs text-muted">{cursoTitulo ?? rotulo}</span>
            </div>
            <p className="m-0 -mt-2 text-xs text-muted">Cada aluno conta 1 vez por aula por dia. Horas por dia ainda não são medidas.</p>
            <GraficoBarrasDia
              pontos={serie.map((d) => ({ dia: d.dia, valor: d.visualizacoes }))}
              unidade="visualizações"
              legenda={`Visualizações de aula ${porQuando}, ${frase}${cursoTitulo ? `, ${cursoTitulo}` : ""}`}
              {...grafico}
            />
          </Cartao>
        </div>
      )}
    </>
  );
}
