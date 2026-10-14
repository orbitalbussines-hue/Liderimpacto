import Link from "next/link";
import { cn } from "@/lib/utils";

export interface SegmentoLink {
  rotulo: string;
  href: string;
  ativo: boolean;
}

export interface SegmentosLinkProps {
  opcoes: readonly SegmentoLink[];
  "aria-label": string;
  className?: string;
}

/**
 * O desenho do `ControleSegmentado` em modo LINK (filtro na URL, sem JS): borda única, ativo em
 * accent-soft com `aria-current`. Alvo de 44 px no celular.
 */
export function SegmentosLink({ opcoes, className, ...props }: SegmentosLinkProps) {
  return (
    <nav className={cn("inline-flex overflow-hidden rounded-[9px] border border-border bg-surface", className)} {...props}>
      {opcoes.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          scroll={false}
          aria-current={o.ativo ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:-outline-offset-2 desk:min-h-9",
            o.ativo ? "bg-accent-soft text-accent" : "text-muted hover:text-text"
          )}
        >
          {o.rotulo}
        </Link>
      ))}
    </nav>
  );
}
