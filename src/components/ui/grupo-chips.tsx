"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { useSelecaoUnica, type OpcaoSelecao } from "./use-selecao-unica";

export interface GrupoChipsProps<T extends string>
  extends Omit<ComponentProps<"div">, "role" | "onChange" | "defaultValue"> {
  opcoes: readonly OpcaoSelecao<T>[];
  valor?: T;
  valorInicial?: T;
  onMudar?: (valor: T) => void;
  /** Com `name`, envia o valor num <input hidden> (form de Server Action). */
  name?: string;
}

/**
 * Chips pilula 34px de selecao unica (construtor: tipo, quantidade, ordenacao,
 * quem ve; abas Vitrine/Player e Desktop/Mobile). `role="radiogroup"`, setas no
 * teclado. Nome acessivel: `aria-label` ou `aria-labelledby`.
 */
export function GrupoChips<T extends string>({
  opcoes,
  valor,
  valorInicial,
  onMudar,
  name,
  className,
  ...props
}: GrupoChipsProps<T>) {
  const { atual, propsItem } = useSelecaoUnica({ opcoes, valor, valorInicial, onMudar });
  return (
    <div role="radiogroup" className={cn("flex flex-wrap gap-1.5", className)} {...props}>
      {opcoes.map((o, i) => {
        const marcado = o.valor === atual;
        return (
          <button
            key={o.valor}
            role="radio"
            aria-checked={marcado}
            {...propsItem(i)}
            className={cn(
              "relative h-[34px] cursor-pointer rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 before:absolute before:-inset-y-[5px] before:inset-x-0 before:content-[''] active:scale-[.98]",
              marcado
                ? "border-accent bg-accent text-accent-ink"
                : "border-border bg-transparent text-text hover:bg-surface-2"
            )}
          >
            {o.rotulo}
          </button>
        );
      })}
      {name && <input type="hidden" name={name} value={atual ?? ""} />}
    </div>
  );
}
