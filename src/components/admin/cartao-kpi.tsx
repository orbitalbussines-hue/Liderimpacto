import { Cartao } from "@/components/ui/cartao";
import { cn } from "@/lib/utils";

export interface CartaoKpiProps {
  rotulo: string;
  /** "—" enquanto não há dado. */
  valor: string;
  /** "↘ −51,9%", "11 vendas", "Conclusão 39,1%". */
  variacao?: string;
  tom?: "ok" | "warn" | "neutro";
  /** Texto muted depois da variação. Use "" para esconder. */
  legenda?: string;
}

const TOM = { ok: "text-ok", warn: "text-warn", neutro: "text-muted" } as const;

/** Indicador do dashboard: rótulo 11px, valor 30/800 e variação colorida. */
export function CartaoKpi({ rotulo, valor, variacao, tom = "neutro", legenda = "vs. período anterior" }: CartaoKpiProps) {
  return (
    <Cartao className="flex flex-col gap-2">
      <div className="text-[11px] font-bold tracking-[.1em] text-muted uppercase">{rotulo}</div>
      <div className="text-3xl leading-tight font-extrabold tracking-[-.02em]">{valor}</div>
      {variacao && (
        <div className={cn("text-xs font-semibold", TOM[tom])}>
          {variacao}
          {legenda && <span className="ml-1 font-medium text-muted">{legenda}</span>}
        </div>
      )}
    </Cartao>
  );
}
