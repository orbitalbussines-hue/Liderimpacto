"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSelecaoUnica } from "./use-selecao-unica";

export interface ItemAba {
  valor: string;
  rotulo: ReactNode;
  /** Com href em TODOS os itens, as abas viram navegacao por link. */
  href?: string;
  /** Modo botao: id do painel controlado (aria-controls). */
  idPainel?: string;
}

export interface AbasProps {
  itens: readonly ItemAba[];
  /** Valor ativo (controlado). Em modo link e obrigatorio para marcar aria-current. */
  ativo?: string;
  valorInicial?: string;
  onSelecionar?: (valor: string) => void;
  /** `aluno` 14px (continuar, player) · `admin` 13px (tabelas do painel). */
  tamanho?: "aluno" | "admin";
  "aria-label"?: string;
  className?: string;
}

const estiloItem = {
  aluno: "px-3.5 py-2.5 text-sm",
  admin: "px-3 py-2.5 text-[13px]",
};

/**
 * Abas sublinhadas: ativa = texto + borda inferior 2px accent; inativa muted.
 * Rolam no eixo x sem barra. Modo link (`href`): <nav> + `aria-current="page"`.
 * Modo botao: `role="tablist"`, `aria-selected` e setas no teclado.
 */
export function Abas({
  itens,
  ativo,
  valorInicial,
  onSelecionar,
  tamanho = "aluno",
  className,
  ...props
}: AbasProps) {
  const { atual, propsItem } = useSelecaoUnica({
    opcoes: itens,
    valor: ativo,
    valorInicial: valorInicial ?? itens[0]?.valor,
    onMudar: onSelecionar,
  });
  // No celular a barra rola: traz a aba ativa para a vista (sem mexer na rolagem da página).
  const barra = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = barra.current;
    const el = c?.querySelector<HTMLElement>('[aria-current="page"], [aria-selected="true"]');
    if (!c || !el) return;
    const a = el.getBoundingClientRect();
    const b = c.getBoundingClientRect();
    if (a.right > b.right || a.left < b.left) c.scrollLeft += a.left - b.left - 16;
  }, [atual]);
  const modoLink = itens.length > 0 && itens.every((i) => i.href);
  const classe = (marcado: boolean) =>
    cn(
      "-mb-px shrink-0 cursor-pointer border-b-2 font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:-outline-offset-2",
      estiloItem[tamanho],
      marcado ? "border-accent text-text" : "border-transparent text-muted hover:text-text"
    );
  const container = cn("scrollbar-oculta flex gap-1 overflow-x-auto border-b border-border", className);

  if (modoLink) {
    return (
      <nav ref={barra} className={container} {...props}>
        {itens.map((i) => (
          <Link
            key={i.valor}
            href={i.href!}
            aria-current={i.valor === atual ? "page" : undefined}
            className={classe(i.valor === atual)}
          >
            {i.rotulo}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <div ref={barra} role="tablist" className={container} {...props}>
      {itens.map((i, n) => (
        <button
          key={i.valor}
          role="tab"
          aria-selected={i.valor === atual}
          aria-controls={i.idPainel}
          {...propsItem(n)}
          className={classe(i.valor === atual)}
        >
          {i.rotulo}
        </button>
      ))}
    </div>
  );
}
