import Link from "next/link";
import { cn } from "@/lib/utils";
import { MarcaAula } from "./marca-aula";
import type { AulaResumo } from "./tipos";

/** Linha de aula dentro do módulo aberto. É um link; a atual leva `aria-current="step"`. */
export function ItemAula({ aula }: { aula: AulaResumo }) {
  const atual = aula.estado === "atual";
  return (
    <Link
      href={aula.href}
      aria-current={atual ? "step" : undefined}
      className={cn(
        "flex items-center gap-3 border-t border-border px-[18px] py-3 hover:bg-surface-2",
        atual && "bg-accent-soft"
      )}
    >
      <MarcaAula estado={aula.estado} />
      <span className={cn("min-w-0 flex-1 text-sm", atual ? "font-bold" : "font-medium")}>{aula.titulo}</span>
      <span className="text-xs text-muted">{aula.duracao}</span>
    </Link>
  );
}
