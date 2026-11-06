"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Selo } from "@/components/ui/selo";
import { cn } from "@/lib/utils";
import { CartaoFileira } from "./cartao-fileira";
import type { ItemFileira, VarianteCartao } from "./tipos";

export interface FileiraProps {
  titulo: string;
  /** Selo accent ao lado do título ("TOP 10"). */
  tag?: string;
  variante?: VarianteCartao;
  itens: ItemFileira[];
  /** Nível do título: h3 na vitrine (abaixo do h1 do destaque); h2 numa página com seções (curso). */
  nivel?: "h2" | "h3";
  /** Sangra até a borda da tela (vitrine). Falso = fica na coluna (página do curso, ao lado da lateral). */
  sangrar?: boolean;
}

const SETA =
  "absolute top-1/2 z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-fixo-vidro-forte text-fixo-text opacity-0 transition-opacity group-focus-within/fileira:opacity-100 group-hover/fileira:opacity-100 focus-visible:opacity-100 desk:grid";

/**
 * Fileira horizontal da vitrine. Sangra até a borda da tela (margem negativa = padding
 * lateral da área) e sem itens não renderiza nada (docs/SISTEMA.md §6).
 */
export function Fileira({ titulo, tag, variante = "padrao", itens, nivel: Titulo = "h3", sangrar = true }: FileiraProps) {
  const rolagem = useRef<HTMLUListElement>(null);
  if (itens.length === 0) return null;

  const rolar = (sentido: 1 | -1) => {
    const el = rolagem.current;
    if (el) el.scrollBy({ left: sentido * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section className="group/fileira relative flex flex-col gap-2.5" aria-label={titulo}>
      <div className="flex items-baseline gap-2.5">
        {/* h2 = seção de página (curso): mesmo estilo dos h2 irmãos ("Conteúdo do curso"). */}
        <Titulo className={cn("m-0 font-sans", Titulo === "h2" ? "text-lg font-extrabold tracking-normal" : "text-[17px] font-bold tracking-[-.005em] desk:text-[21px]")}>{titulo}</Titulo>
        {tag && (
          <Selo forma="etiqueta" className="px-[7px] font-extrabold tracking-[.12em]">
            {tag}
          </Selo>
        )}
      </div>
      <div className="relative">
        <ul
          ref={rolagem}
          tabIndex={0}
          aria-label={`${titulo}: role para o lado`}
          className={cn(
            "scrollbar-oculta flex snap-x snap-proximity list-none gap-3 overflow-x-auto pt-1.5 pb-3",
            sangrar ? "-mx-5 scroll-px-5 px-5 desk:-mx-10 desk:scroll-px-10 desk:px-10" : "px-1",
          )}
        >
          {itens.map((item, i) => (
            <li key={item.id} className="shrink-0 snap-start">
              <CartaoFileira item={item} variante={variante} posicao={i + 1} />
            </li>
          ))}
        </ul>
        <button type="button" aria-label={`${titulo}: anterior`} onClick={() => rolar(-1)} className={cn(SETA, "left-2")}>
          <ChevronLeft aria-hidden />
        </button>
        <button type="button" aria-label={`${titulo}: próximo`} onClick={() => rolar(1)} className={cn(SETA, "right-2")}>
          <ChevronRight aria-hidden />
        </button>
      </div>
    </section>
  );
}
