"use client";

import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { controleVariants } from "./campo";

export interface CampoCodigoProps {
  /** Nome do <input hidden> que leva o codigo inteiro no formulario. */
  name: string;
  /** Rotulo do grupo (visivel; leitor de tela anuncia junto de cada caixa). */
  rotulo: string;
  /** Quantidade de digitos (padrao 6). */
  comprimento?: number;
  /** Chamado quando a ultima caixa e preenchida, com o codigo inteiro (envio automatico). */
  onCompleto?: (codigo: string) => void;
  erro?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

const soDigitos = (s: string) => s.replace(/\D/g, "");

/**
 * Codigo numerico em caixas separadas (segundo fator). Colar ou o preenchimento do celular
 * (`one-time-code`) distribui o codigo inteiro; Backspace volta; setas navegam.
 * Para limpar depois de um erro, troque a `key` do componente.
 */
export function CampoCodigo({
  name,
  rotulo,
  comprimento = 6,
  onCompleto,
  erro,
  disabled,
  autoFocus,
  className,
}: CampoCodigoProps) {
  const id = useId();
  const [digitos, setDigitos] = useState<string[]>(() => Array(comprimento).fill(""));
  const caixas = useRef<(HTMLInputElement | null)[]>([]);
  const focar = (i: number) => caixas.current[Math.max(0, Math.min(comprimento - 1, i))]?.focus();

  /** Escreve `texto` a partir da caixa `inicio` e avanca o foco. */
  function preencher(inicio: number, texto: string) {
    const novos = [...digitos];
    const entrada = soDigitos(texto).slice(0, comprimento - inicio);
    [...entrada].forEach((d, k) => (novos[inicio + k] = d));
    setDigitos(novos);
    focar(inicio + entrada.length);
    const codigo = novos.join("");
    if (entrada.length > 0 && codigo.length === comprimento) onCompleto?.(codigo);
  }

  function aoTeclar(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digitos[i] && i > 0) {
      e.preventDefault();
      setDigitos((d) => d.map((v, k) => (k === i - 1 ? "" : v)));
      focar(i - 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focar(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focar(i + 1);
    }
  }

  function aoColar(i: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    preencher(i, e.clipboardData.getData("text"));
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div id={`${id}-rotulo`} className="text-[13px] font-semibold text-text">
        {rotulo}
      </div>
      <div
        role="group"
        aria-labelledby={`${id}-rotulo`}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${comprimento}, minmax(0, 1fr))` }}
      >
        {digitos.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              caixas.current[i] = el;
            }}
            value={d}
            onChange={(e) => {
              const v = soDigitos(e.target.value);
              // Varios digitos de uma vez = autopreenchimento do celular: distribui pelas caixas.
              if (v) preencher(i, v);
              else setDigitos((atual) => atual.map((x, k) => (k === i ? "" : x)));
            }}
            onKeyDown={(e) => aoTeclar(i, e)}
            onPaste={(e) => aoColar(i, e)}
            onFocus={(e) => e.target.select()}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={autoFocus && i === 0}
            disabled={disabled}
            aria-label={`Dígito ${i + 1} de ${comprimento}`}
            aria-invalid={erro ? true : undefined}
            className={cn(
              controleVariants({ tamanho: "48", fundo: "surface" }),
              "h-14 px-0 text-center font-sans text-xl font-semibold tabular-nums caret-accent"
            )}
          />
        ))}
      </div>
      <input type="hidden" name={name} value={digitos.join("")} />
      {erro && (
        <p id={`${id}-erro`} className="text-xs font-semibold text-warn">
          {erro}
        </p>
      )}
    </div>
  );
}
