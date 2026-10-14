import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Selo } from "@/components/ui/selo";
import { coortesCacheadas } from "@/lib/analytics/cache";
import { COORTE_PEQUENA, faixaDeCalor, montarCoortes, SEMANAS_COORTE } from "@/lib/analytics/regras";
import { diaMes } from "@/lib/painel/regras";
import { cn } from "@/lib/utils";
import { contextoAnalytics, type ParametrosAnalytics } from "./contexto";

const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat("pt-BR");

/** Um tom (accent), do claro ao forte; o número vai SEMPRE escrito na célula (cor só reforça). */
const CALOR = ["bg-surface-2 text-muted", "bg-accent/12", "bg-accent/28", "bg-accent/50", "bg-accent/80 text-accent-ink"] as const;
const CELULA = "px-2 py-2 first:pl-5 last:pr-5";

export async function AbaRetencao({ parametros }: { parametros: ParametrosAnalytics }) {
  const { criadorId, filtros, cursoTitulo } = await contextoAnalytics(parametros);
  const coortes = montarCoortes(await coortesCacheadas(criadorId, filtros.curso));
  const total = coortes.reduce((s, c) => s + c.tamanho, 0);

  return (
    <Cartao como="section" padding={0} aria-labelledby="titulo-coortes" className="min-w-0">
      <div className="flex flex-col gap-1 px-5 py-4">
        <CartaoTitulo id="titulo-coortes" tamanho={15} como="h2">Retenção por semana de matrícula</CartaoTitulo>
        <p className="m-0 text-xs text-muted">
          Cada linha são os alunos que tiveram a primeira matrícula{cursoTitulo ? ` em ${cursoTitulo}` : ""} naquela semana (segunda a domingo). Cada coluna é a % deles que
          assistiu alguma aula N semanas depois (semana 0 = a da matrícula). Atividade conta qualquer aula do criador. Linhas com menos de {COORTE_PEQUENA} alunos são amostra pequena.
        </p>
      </div>
      {total === 0 ? (
        <EstadoVazio
          icone={<CalendarRange />}
          titulo={`Nenhuma matrícula nas últimas ${SEMANAS_COORTE} semanas`}
          descricao="As coortes aparecem quando alunos forem matriculados."
          acao={<Link href="/admin/matriculas" className={buttonVariants({ variant: "secundario", size: "36" })}>Matricular alunos</Link>}
          className="pb-8"
        />
      ) : (
        <div className="relative overflow-x-auto pb-2">
          <table className="w-full min-w-[640px] border-collapse text-center text-[13px] tabular-nums">
            <caption className="sr-only">Porcentagem de alunos de cada coorte com atividade nas semanas seguintes à matrícula</caption>
            <thead>
              <tr className="border-y border-border bg-surface-2 text-xs text-muted">
                <th scope="col" className={cn(CELULA, "text-left font-normal")}>Semana de entrada</th>
                <th scope="col" className={cn(CELULA, "text-right font-normal")}>Alunos</th>
                {coortes.map((_, k) => (
                  <th key={k} scope="col" className={cn(CELULA, "font-normal")}>
                    <span aria-hidden>S{k}</span>
                    <span className="sr-only">Semana {k}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coortes.map((c) => (
                <tr key={c.semana} className="border-b border-border last:border-b-0">
                  <th scope="row" className={cn(CELULA, "text-left font-semibold whitespace-nowrap")}>
                    <span className="flex flex-col items-start gap-1 desk:flex-row desk:items-center desk:gap-2">
                      {diaMes(c.semana)}
                      {c.pequena && (
                        <Selo tom="neutro" forma="etiqueta">
                          amostra pequena
                        </Selo>
                      )}
                    </span>
                  </th>
                  <td className={cn(CELULA, "text-right")}>{numero.format(c.tamanho)}</td>
                  {c.celulas.map((x, k) =>
                    x === null || c.tamanho === 0 ? (
                      <td key={k} className={cn(CELULA, "text-muted")}>
                        <span aria-hidden>·</span>
                        <span className="sr-only">{c.tamanho === 0 ? "sem alunos" : "semana ainda não chegou"}</span>
                      </td>
                    ) : (
                      <td key={k} className={CELULA}>
                        <span
                          className={cn("block min-w-11 rounded-md px-1.5 py-1.5 font-semibold", CALOR[faixaDeCalor(x.taxa)])}
                          title={`${numero.format(x.ativos)} de ${numero.format(c.tamanho)} alunos`}
                        >
                          {pct.format(x.taxa ?? 0)}
                          <span className="sr-only"> ({numero.format(x.ativos)} de {numero.format(c.tamanho)} alunos)</span>
                        </span>
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}
