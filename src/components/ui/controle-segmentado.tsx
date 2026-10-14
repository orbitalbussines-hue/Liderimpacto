"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { useSelecaoUnica, type OpcaoSelecao } from "./use-selecao-unica";

export interface ControleSegmentadoProps<T extends string>
  extends Omit<ComponentProps<"div">, "role" | "onChange" | "defaultValue"> {
  opcoes: readonly OpcaoSelecao<T>[];
  valor?: T;
  valorInicial?: T;
  onMudar?: (valor: T) => void;
}

/**
 * Seletor segmentado (periodo do dashboard: 7 dias / 30 dias / 6 meses): borda
 * unica, item ativo com fundo accent-soft. `role="radiogroup"`, setas no teclado.
 * Nome acessivel: `aria-label`.
 */
export function ControleSegmentado<T extends string>({
  opcoes,
  valor,
  valorInicial,
  onMudar,
  className,
  ...props
}: ControleSegmentadoProps<T>) {
  const { atual, propsItem } = useSelecaoUnica({ opcoes, valor, valorInicial, onMudar });
  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex overflow-hidden rounded-[9px] border border-border bg-surface",
        className
      )}
      {...props}
    >
      {opcoes.map((o, i) => {
        const marcado = o.valor === atual;
        return (
          <button
            key={o.valor}
            role="radio"
            aria-checked={marcado}
            {...propsItem(i)}
            className={cn(
              "min-h-11 cursor-pointer px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:-outline-offset-2 desk:min-h-0",
              marcado ? "bg-accent-soft text-accent" : "text-muted hover:text-text"
            )}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
