"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface OpcaoSelecao<T extends string = string> {
  valor: T;
  rotulo: ReactNode;
}

interface UseSelecaoUnica<T extends string> {
  opcoes: readonly OpcaoSelecao<T>[];
  /** Controlado. Omitido = estado interno a partir de `valorInicial`. */
  valor?: T;
  valorInicial?: T;
  onMudar?: (valor: T) => void;
}

const PASSOS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Selecao unica com "roving tabindex": so o item ativo entra no Tab; setas,
 * Home e End movem o foco e selecionam (padrao WAI-ARIA de radiogroup e tabs).
 * Usado por GrupoChips, ControleSegmentado e Abas (modo botao).
 */
export function useSelecaoUnica<T extends string>({
  opcoes,
  valor,
  valorInicial,
  onMudar,
}: UseSelecaoUnica<T>) {
  const [interno, setInterno] = useState<T | undefined>(valorInicial);
  const atual = valor ?? interno;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const indiceAtivo = Math.max(
    0,
    opcoes.findIndex((o) => o.valor === atual)
  );

  function selecionar(v: T) {
    if (valor === undefined) setInterno(v);
    if (v !== atual) onMudar?.(v);
  }

  function aoTeclar(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const n = opcoes.length;
    const alvo =
      e.key === "Home" ? 0 : e.key === "End" ? n - 1 : e.key in PASSOS ? (i + PASSOS[e.key] + n) % n : -1;
    if (alvo < 0) return;
    e.preventDefault();
    refs.current[alvo]?.focus();
    selecionar(opcoes[alvo].valor);
  }

  /** Props de cada item; o componente acrescenta `role` e `aria-checked`/`aria-selected`. */
  function propsItem(i: number) {
    return {
      ref: (el: HTMLButtonElement | null) => {
        refs.current[i] = el;
      },
      type: "button" as const,
      tabIndex: i === indiceAtivo ? 0 : -1,
      onClick: () => selecionar(opcoes[i].valor),
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => aoTeclar(e, i),
    };
  }

  return { atual, propsItem };
}
