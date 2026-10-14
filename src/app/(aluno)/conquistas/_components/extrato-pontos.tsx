import type { LancamentoDoMembro } from "@/lib/gamificacao/ranking";
import { ROTULO_DO_MOTIVO, pontosPtBr } from "@/lib/gamificacao/regras";
import type { MotivoPontos } from "@/lib/db/schema/_enums";
import { cn } from "@/lib/utils";

const quando = (d: Date) =>
  d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });

/** Últimos lançamentos do próprio aluno (RN-145): motivo, quando e o valor com sinal. */
export function ExtratoPontos({ lancamentos }: { lancamentos: readonly LancamentoDoMembro[] }) {
  if (lancamentos.length === 0) return <p className="m-0 text-[13px] text-muted">Seus pontos aparecem aqui assim que você concluir uma aula.</p>;
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {lancamentos.map((l) => (
        <li key={l.id} className="flex items-start justify-between gap-3 border-b border-border py-2.5 last:border-b-0">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{ROTULO_DO_MOTIVO[l.motivo as MotivoPontos] ?? l.motivo}</span>
            <span className="block text-xs text-muted">
              {quando(l.ocorridoEm)}
              {l.justificativa && <> · {l.justificativa}</>}
            </span>
          </span>
          <span className={cn("shrink-0 text-sm font-bold tabular-nums", l.pontos < 0 ? "text-warn" : "text-text")}>
            {l.pontos > 0 ? "+" : "−"}
            {pontosPtBr(Math.abs(l.pontos))}
          </span>
        </li>
      ))}
    </ul>
  );
}
