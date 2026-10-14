import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EstatisticaProps {
  valor: ReactNode;
  rotulo: ReactNode;
  /** `accent` pinta o numero de dourado (pontos do perfil). */
  tom?: "padrao" | "accent";
  /** `compacta`: perfil (20px, centralizada). `padrao`: saude dos produtos (22px, a esquerda). */
  variante?: "padrao" | "compacta";
  className?: string;
}

/** Tile surface-2 r12 com numero grande e rotulo 11px muted. */
export function Estatistica({ valor, rotulo, tom = "padrao", variante = "padrao", className }: EstatisticaProps) {
  const compacta = variante === "compacta";
  return (
    <div className={cn("rounded-xl bg-surface-2", compacta ? "px-2 py-3 text-center" : "p-3.5", className)}>
      <div
        className={cn(
          "leading-tight font-extrabold tabular-nums",
          compacta ? "text-xl" : "text-[22px]",
          tom === "accent" && "text-accent"
        )}
      >
        {valor}
      </div>
      <div className="text-[11px] text-muted">{rotulo}</div>
    </div>
  );
}
