import { cn } from "@/lib/utils";

export interface BarraProgressoProps {
  /** 0 a 100; fora disso e limitado. */
  valor: number;
  /** Nome acessivel (ex.: "Progresso do curso"). */
  rotulo?: string;
  /**
   * `padrao`: trilho surface-2 arredondado. `sobreImagem`: 4px na base da capa
   * (absolute bottom-0, trilho branco 20%, sem raio) — o pai precisa de `relative`.
   */
  variante?: "padrao" | "sobreImagem";
  /** Espessura no modo padrao: 5px (cards, tabelas) ou 6px (pagina do curso). */
  espessura?: 5 | 6;
  /** Mostra "42%" a direita (12px muted). */
  mostrarPercentual?: boolean;
  className?: string;
}

export function limitarPercentual(valor: number): number {
  return Number.isFinite(valor) ? Math.min(100, Math.max(0, Math.round(valor))) : 0;
}

export function BarraProgresso({
  valor,
  rotulo,
  variante = "padrao",
  espessura = 5,
  mostrarPercentual = false,
  className,
}: BarraProgressoProps) {
  const pct = limitarPercentual(valor);
  const sobreImagem = variante === "sobreImagem";
  const barra = (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn(
        sobreImagem
          ? "pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-white/20"
          : "h-[5px] flex-1 overflow-hidden rounded-full bg-surface-2",
        !sobreImagem && espessura === 6 && "h-1.5",
        (!mostrarPercentual || sobreImagem) && className
      )}
    >
      <div
        className={cn("h-full", sobreImagem ? "bg-fixo-accent" : "rounded-full bg-accent")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
  if (!mostrarPercentual || sobreImagem) return barra;
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {barra}
      <span className="text-xs text-muted tabular-nums" aria-hidden>
        {pct}%
      </span>
    </div>
  );
}
