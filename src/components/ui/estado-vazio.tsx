import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconeQuadrado } from "./icone-quadrado";

export interface EstadoVazioProps {
  titulo: ReactNode;
  descricao?: ReactNode;
  /** Icone lucide; padrao <Inbox />. */
  icone?: ReactNode;
  /** Botao ou link opcional ("Explorar cursos"). */
  acao?: ReactNode;
  /** Envolve em Cartao (borda tracejada) quando a lista vive solta na pagina. */
  comMoldura?: boolean;
  className?: string;
}

/** Lista sem itens (nao desenhado no prototipo; derivado dos tokens). */
export function EstadoVazio({ titulo, descricao, icone, acao, comMoldura = false, className }: EstadoVazioProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 px-5 py-10 text-center",
        comMoldura && "rounded-2xl border border-dashed border-border bg-surface",
        className
      )}
    >
      <IconeQuadrado tamanho={44}>{icone ?? <Inbox />}</IconeQuadrado>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="m-0 text-[15px] font-bold">{titulo}</p>
        {descricao && <p className="m-0 text-[13px] leading-relaxed text-muted">{descricao}</p>}
      </div>
      {acao && <div className="mt-1">{acao}</div>}
    </div>
  );
}
