import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Bloco de carregamento: bg-surface-2 + pulse (o globals.css desliga a animacao
 * com prefers-reduced-motion). Monte o formato com className:
 * <Esqueleto className="aspect-video w-[280px] rounded-lg" />  (capa de fileira)
 * <Esqueleto className="h-3.5 w-40" />                           (linha de texto)
 * Agrupe num container com aria-busy e um texto sr-only "Carregando...".
 */
export function Esqueleto({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-2", className)} {...props} />;
}
