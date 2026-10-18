import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const COR = { ok: "text-ok", warn: "text-warn", accent: "text-accent", neutro: "text-muted" } as const;

/** Status de linha: a cor fica só no ícone; o texto diz o estado (nunca só a cor). */
export function Status({ icone, tom, children, sub }: { icone: ReactNode; tom: keyof typeof COR; children: ReactNode; sub?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap">
        <span aria-hidden className={cn("inline-flex [&_svg]:size-3.5", COR[tom])}>
          {icone}
        </span>
        {children}
      </span>
      {sub && <span className="truncate pl-5 text-xs text-muted">{sub}</span>}
    </span>
  );
}
