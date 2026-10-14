import { cn } from "@/lib/utils";
import { diaMes } from "@/lib/painel/regras";
import type { AcessoDoDia } from "@/lib/painel/consultas";

const numero = new Intl.NumberFormat("pt-BR");

/**
 * Barras dos últimos 14 dias (CSS puro, sem biblioteca). Um eixo; hoje em accent, os outros dias
 * em tom neutro; rótulo de valor só em hoje e no maior dia; dica no hover/foco de cada coluna; 3
 * datas no eixo (cabem no celular). Para leitor de tela, a figura vira uma `<table>` sr-only.
 */
export function GraficoAcessos({ dias }: { dias: AcessoDoDia[] }) {
  const maior = Math.max(1, ...dias.map((d) => d.alunos));
  const iMaior = dias.findIndex((d) => d.alunos === maior);
  const ultimo = dias.length - 1;
  const eixo = [0, Math.floor(ultimo / 2), ultimo];
  return (
    <figure className="m-0 flex flex-col gap-2">
      <div aria-hidden className="flex h-[180px] items-end gap-1.5 border-b border-border pt-5">
        {dias.map((d, i) => {
          const hoje = i === ultimo;
          const rotulo = hoje || (i === iMaior && d.alunos > 0);
          return (
            <div key={d.dia} className="group relative flex h-full flex-1 flex-col justify-end" title={`${diaMes(d.dia)}: ${d.alunos} aluno(s)`}>
              <div
                className={cn(
                  "relative w-full rounded-t-[4px] transition-colors duration-150",
                  hoje ? "bg-accent" : "bg-muted/30 group-hover:bg-muted/50"
                )}
                style={{ height: `${(d.alunos / maior) * 100}%`, minHeight: d.alunos > 0 ? 3 : 0 }}
              >
                <span
                  className={cn(
                    "pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap tabular-nums",
                    hoje ? "text-text" : "text-muted",
                    !rotulo && "opacity-0 group-hover:opacity-100"
                  )}
                >
                  {numero.format(d.alunos)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div aria-hidden className="flex justify-between text-[11px] text-muted tabular-nums">
        {eixo.map((i) => (
          <span key={i}>{i === ultimo ? "hoje" : diaMes(dias[i].dia)}</span>
        ))}
      </div>
      {/* sr-only numa <div>: tabela ignora width 1px e, absoluta, esticaria a pagina no celular. */}
      <div className="sr-only">
      <table>
        <caption>Alunos com atividade de aula por dia, últimos 14 dias</caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col">Alunos</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d.dia}>
              <th scope="row">{diaMes(d.dia)}</th>
              <td>{d.alunos}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}
