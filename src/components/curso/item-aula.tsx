import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarcaAula } from "./marca-aula";
import type { AulaResumo } from "./tipos";

const LINHA = "flex items-center gap-3 border-t border-border px-[18px] py-3";

/**
 * Linha de aula dentro do módulo aberto. Liberada: link (a atual leva `aria-current="step"`).
 * Travada (`bloqueio`): não é link; cadeado no lugar do círculo e o motivo no lugar da duração.
 */
export function ItemAula({ aula }: { aula: AulaResumo }) {
  if (aula.bloqueio) {
    return (
      <div className={cn(LINHA, "text-muted")}>
        <span aria-hidden className="grid size-5 shrink-0 place-items-center">
          <Lock className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium">
          {aula.titulo}
          <span className="sr-only">. Bloqueada: </span>
        </span>
        <span className="shrink-0 text-right text-xs font-semibold">{aula.bloqueio}</span>
      </div>
    );
  }
  const atual = aula.estado === "atual";
  return (
    <Link href={aula.href} aria-current={atual ? "step" : undefined} className={cn(LINHA, "hover:bg-surface-2", atual && "bg-accent-soft")}>
      <MarcaAula estado={aula.estado} />
      <span className={cn("min-w-0 flex-1 text-sm", atual ? "font-bold" : "font-medium")}>{aula.titulo}</span>
      <span className="shrink-0 text-xs text-muted">{aula.duracao}</span>
    </Link>
  );
}
