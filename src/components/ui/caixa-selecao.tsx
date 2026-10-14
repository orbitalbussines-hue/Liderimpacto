import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CaixaSelecaoProps extends Omit<ComponentProps<"input">, "type"> {
  rotulo: ReactNode;
}

/** Checkbox nativo com accent-color ("Manter conectado"). O rotulo inteiro e clicavel (alvo 44px). */
export function CaixaSelecao({ rotulo, className, ...props }: CaixaSelecaoProps) {
  return (
    <label
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-muted has-disabled:cursor-not-allowed has-disabled:opacity-50",
        className
      )}
    >
      <input type="checkbox" className="size-4 shrink-0 cursor-pointer accent-accent" {...props} />
      {rotulo}
    </label>
  );
}
