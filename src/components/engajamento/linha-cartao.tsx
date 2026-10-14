import type { ReactNode } from "react";
import { Cartao } from "@/components/ui/cartao";

export interface LinhaCartaoProps {
  /** Tile de ícone (IconeQuadrado). */
  icone?: ReactNode;
  titulo: ReactNode;
  /** Linha 12px muted sob o título. */
  meta?: ReactNode;
  /** Selo de status. */
  status?: ReactNode;
  /** Botão ou link de ação. */
  acao?: ReactNode;
}

/** Linha de lista em cartão: ícone, título + meta, status e ação. Base de avaliações e listas futuras. */
export function LinhaCartao({ icone, titulo, meta, status, acao }: LinhaCartaoProps) {
  return (
    <Cartao className="flex flex-wrap items-center gap-4 py-[18px]">
      {icone}
      <div className="min-w-[200px] flex-1">
        <div className="text-[15px] font-bold">{titulo}</div>
        {meta && <div className="mt-0.5 text-xs text-muted">{meta}</div>}
      </div>
      {status}
      {acao}
    </Cartao>
  );
}
