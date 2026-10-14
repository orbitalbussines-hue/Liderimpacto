import { cn } from "@/lib/utils";

export interface BlocoDataProps {
  dia: string;
  /** "out" (a tela põe em maiúsculas). */
  mes: string;
  tamanho?: "padrao" | "grande";
  /** Cancelado/encerrado: neutro em vez de accent. */
  apagado?: boolean;
}

/** Data em bloco accent-soft (dia + mês) dos encontros ao vivo. Decorativo: a data por extenso vem ao lado. */
export function BlocoData({ dia, mes, tamanho = "padrao", apagado = false }: BlocoDataProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-[10px] leading-none font-extrabold",
        tamanho === "grande" ? "h-[72px] w-[66px] gap-0.5" : "h-14 w-[52px]",
        apagado ? "bg-surface-2 text-muted" : "bg-accent-soft text-accent"
      )}
    >
      <span className={tamanho === "grande" ? "text-[26px]" : "text-xl"}>{dia}</span>
      <span className="text-[11px] uppercase">{mes}</span>
    </div>
  );
}
