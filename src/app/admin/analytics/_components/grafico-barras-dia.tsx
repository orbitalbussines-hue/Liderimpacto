import { cn } from "@/lib/utils";
import { diaMes } from "@/lib/painel/regras";

const numero = new Intl.NumberFormat("pt-BR");

export interface PontoDia {
  /** AAAA-MM-DD (Brasília). */
  dia: string;
  valor: number;
}

/**
 * Barras por dia (ou por semana, `porSemana`, quando o período passa de 92 dias), no estilo do
 * `GraficoAcessos` do painel: CSS puro, UM eixo, o último ponto em accent quando é hoje e os demais
 * em tom neutro, rótulo de valor só no último e no maior, dica no hover, 3 datas no eixo. O vão
 * entre barras encolhe com o número de pontos (92 barras cabem em 390 px). Leitor de tela:
 * `<table>` dentro de uma `<div className="sr-only">`.
 */
export function GraficoBarrasDia({
  pontos,
  legenda,
  unidade,
  ultimoEhHoje = true,
  porSemana = false,
}: {
  pontos: readonly PontoDia[];
  legenda: string;
  unidade: string;
  /** O período termina hoje (o último ponto vira "hoje" e ganha o accent). */
  ultimoEhHoje?: boolean;
  /** Cada ponto é uma semana (o `dia` é o primeiro dia dela dentro do período). */
  porSemana?: boolean;
}) {
  const nome = (dia: string) => (porSemana ? `semana de ${diaMes(dia)}` : diaMes(dia));
  const maior = Math.max(1, ...pontos.map((p) => p.valor));
  const iMaior = pontos.findIndex((p) => p.valor === maior);
  const ultimo = pontos.length - 1;
  const eixo = [0, Math.floor(ultimo / 2), ultimo];
  const vao = pontos.length > 31 ? "gap-px" : pontos.length > 14 ? "gap-0.5" : "gap-1.5";
  return (
    <figure className="m-0 flex flex-col gap-2">
      <div aria-hidden className={cn("flex h-[160px] items-end border-b border-border pt-5", vao)}>
        {pontos.map((p, i) => {
          const hoje = ultimoEhHoje && !porSemana && i === ultimo;
          const rotulo = i === ultimo || (i === iMaior && p.valor > 0);
          return (
            <div key={p.dia} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${nome(p.dia)}: ${numero.format(p.valor)} ${unidade}`}>
              <div
                className={cn("relative w-full rounded-t-[3px] transition-colors duration-150", hoje ? "bg-accent" : "bg-muted/30 group-hover:bg-muted/50")}
                style={{ height: `${(p.valor / maior) * 100}%`, minHeight: p.valor > 0 ? 3 : 0 }}
              >
                <span
                  className={cn(
                    "pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap tabular-nums",
                    hoje ? "text-text" : "text-muted",
                    !rotulo && "opacity-0 group-hover:opacity-100"
                  )}
                >
                  {numero.format(p.valor)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div aria-hidden className="flex justify-between text-[11px] text-muted tabular-nums">
        {eixo.map((i) => (
          <span key={i}>{i === ultimo && ultimoEhHoje && !porSemana ? "hoje" : diaMes(pontos[i].dia)}</span>
        ))}
      </div>
      <div className="sr-only">
        <table>
          <caption>{legenda}</caption>
          <thead>
            <tr>
              <th scope="col">{porSemana ? "Semana" : "Dia"}</th>
              <th scope="col">{unidade}</th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((p) => (
              <tr key={p.dia}>
                <th scope="row">{nome(p.dia)}</th>
                <td>{p.valor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
