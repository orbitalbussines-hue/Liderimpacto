"use client";

import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export interface InterruptorProps
  extends Omit<ComponentProps<"button">, "onClick" | "role" | "aria-checked" | "value"> {
  /** Controlado: estado vindo do pai. Omitido = o componente guarda o proprio estado. */
  ligado?: boolean;
  /** Estado inicial quando nao controlado. */
  ligadoInicial?: boolean;
  onAlternar?: (ligado: boolean) => void;
  /** Com `name`, envia "on"/"" num <input hidden> (form de Server Action). */
  name?: string;
}

/**
 * Toggle 44x26 (perfil e construtor). `role="switch"` + `aria-checked`.
 * Precisa de nome acessivel: `aria-label` ou `aria-labelledby` apontando para o texto ao lado.
 */
export function Interruptor({
  ligado,
  ligadoInicial = false,
  onAlternar,
  name,
  className,
  disabled,
  ...props
}: InterruptorProps) {
  const [interno, setInterno] = useState(ligadoInicial);
  const atual = ligado ?? interno;

  function alternar() {
    if (ligado === undefined) setInterno(!atual);
    onAlternar?.(!atual);
  }

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={atual}
        disabled={disabled}
        onClick={alternar}
        className={cn(
          // before: amplia a area de toque para 44px de altura sem mudar o desenho.
          "relative inline-flex h-[26px] w-11 shrink-0 cursor-pointer items-center rounded-full border p-[2px] transition-colors duration-150 before:absolute before:-inset-y-[9px] before:inset-x-0 before:content-[''] disabled:cursor-not-allowed disabled:opacity-50",
          atual ? "border-accent bg-accent" : "border-border bg-surface-2",
          className
        )}
        {...props}
      >
        <span
          aria-hidden
          className={cn(
            "size-5 rounded-full transition-transform duration-150",
            atual ? "translate-x-[18px] bg-accent-ink" : "translate-x-0 bg-muted"
          )}
        />
      </button>
      {name && <input type="hidden" name={name} value={atual ? "on" : ""} />}
    </>
  );
}
