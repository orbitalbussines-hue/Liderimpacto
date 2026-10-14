import Link from "next/link";
import { cn } from "@/lib/utils";
import { DIAS_PERIODO, PERIODO_PADRAO, type DiasPeriodo } from "@/lib/painel/regras";

export interface SeletorPeriodoProps {
  /** Período em vigor (lido de `?periodo=`). Padrão: 30 dias. */
  atual?: DiasPeriodo;
  /** Rota do painel; cada opção vira `<caminho>?periodo=N`. */
  caminho?: string;
  className?: string;
}

/**
 * Período do dashboard (7 / 30 / 90 dias) como LINKS `?periodo=N`: funciona sem JS e a URL
 * guarda o filtro. Mesmo visual do ControleSegmentado (borda única, ativo em accent-soft).
 */
export function SeletorPeriodo({ atual = PERIODO_PADRAO, caminho = "/admin", className }: SeletorPeriodoProps) {
  return (
    <nav aria-label="Período" className={cn("inline-flex overflow-hidden rounded-[9px] border border-border bg-surface", className)}>
      {DIAS_PERIODO.map((dias) => {
        const marcado = dias === atual;
        return (
          <Link
            key={dias}
            href={`${caminho}?periodo=${dias}`}
            scroll={false}
            aria-current={marcado ? "page" : undefined}
            className={cn(
              "grid min-h-11 place-items-center px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap no-underline transition-colors duration-150 focus-visible:-outline-offset-2 desk:min-h-0",
              marcado ? "bg-accent-soft text-accent" : "text-muted hover:text-text"
            )}
          >
            {dias} dias
          </Link>
        );
      })}
    </nav>
  );
}
