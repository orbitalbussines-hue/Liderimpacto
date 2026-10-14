import { Cartao } from "@/components/ui/cartao";
import { cn } from "@/lib/utils";

export interface CartaoKpiProps {
  rotulo: string;
  /** "—" enquanto não há dado. */
  valor: string;
  /** "↘ −51,9%", "11 vendas", "Conclusão 39,1%". */
  variacao?: string;
  /** Versão por extenso da variação para leitor de tela ("queda de 51,9%"); a visível fica oculta para ele. */
  variacaoLeitor?: string;
  tom?: "ok" | "warn" | "neutro";
  /** Texto muted depois da variação. Use "" para esconder. */
  legenda?: string;
  /** Linha secundária muted abaixo da variação ("Conclusão 39,1% das matrículas valendo"). */
  complemento?: string;
}

const TOM = { ok: "text-ok", warn: "text-warn", neutro: "text-muted" } as const;

/** Indicador do dashboard: rótulo 11px, valor 30/800 e variação colorida (seta + texto, nunca só cor). */
export function CartaoKpi({ rotulo, valor, variacao, variacaoLeitor, tom = "neutro", legenda = "vs. período anterior", complemento }: CartaoKpiProps) {
  return (
    <Cartao className="flex flex-col gap-2">
      <div className="text-[11px] font-bold tracking-[.1em] text-muted uppercase">{rotulo}</div>
      <div className="text-3xl leading-tight font-extrabold tracking-[-.02em] tabular-nums">{valor}</div>
      {variacao && (
        <div className={cn("text-xs font-semibold", TOM[tom])}>
          <span aria-hidden={variacaoLeitor ? true : undefined}>{variacao}</span>
          {variacaoLeitor && <span className="sr-only">{variacaoLeitor}</span>}
          {legenda && <span className="ml-1 font-medium text-muted">{legenda}</span>}
        </div>
      )}
      {complemento && <div className="text-xs text-muted">{complemento}</div>}
    </Cartao>
  );
}
