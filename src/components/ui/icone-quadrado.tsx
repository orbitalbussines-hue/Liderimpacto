import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const iconeQuadradoVariants = cva(
  // Texto (PDF/DOC) sai 10px/800; o svg e dimensionado por tamanho.
  "inline-grid shrink-0 place-items-center text-[10px] font-extrabold tracking-wide",
  {
    variants: {
      tamanho: {
        32: "size-8 rounded-[9px] [&_svg:not([class*='size-'])]:size-4",
        42: "size-[42px] rounded-[11px] [&_svg:not([class*='size-'])]:size-5",
        44: "size-11 rounded-xl [&_svg:not([class*='size-'])]:size-5",
      },
      tom: {
        accent: "bg-accent-soft text-accent",
        ok: "bg-ok-soft text-ok",
        warn: "bg-warn-soft text-warn",
        neutro: "bg-surface-2 text-muted",
      },
    },
    defaultVariants: { tamanho: 42, tom: "accent" },
  }
);

export interface IconeQuadradoProps extends VariantProps<typeof iconeQuadradoVariants> {
  /** Um icone lucide (<Rocket />) ou texto curto ("PDF"). */
  children: ReactNode;
  className?: string;
}

/** Tile de icone (construtor, paginas de cards, avaliacoes, anexos). Decorativo: aria-hidden. */
export function IconeQuadrado({ tamanho, tom, className, children }: IconeQuadradoProps) {
  return (
    <span aria-hidden className={cn(iconeQuadradoVariants({ tamanho, tom }), className)}>
      {children}
    </span>
  );
}
