import { Esqueleto } from "@/components/ui/esqueleto";
import { cn } from "@/lib/utils";

export interface EsqueletoFileiraProps {
  /** Cartões 3:4 estreitos (Top 10). */
  estreito?: boolean;
  /** Capinhas 3:4 dos módulos (180/230px, com título embaixo): mesma altura do cartão real, sem salto. */
  modulo?: boolean;
  /** Texto para leitor de tela ("Carregando Top 10"). */
  rotulo?: string;
}

/** Fileira em carregamento: título + cartões no formato real, sem rolagem horizontal. */
export function EsqueletoFileira({ estreito = false, modulo = false, rotulo = "Carregando" }: EsqueletoFileiraProps) {
  const largura = modulo ? "w-[180px] desk:w-[230px]" : estreito ? "w-[100px] desk:w-32" : "w-[210px] desk:w-[280px]";
  return (
    <div aria-busy="true" className="flex flex-col gap-2.5">
      <span className="sr-only">{rotulo}</span>
      <Esqueleto className="h-5 w-56 desk:h-6" />
      <div className="flex gap-3 overflow-hidden pt-1.5 pb-3">
        {Array.from({ length: estreito && !modulo ? 8 : 6 }, (_, i) => (
          <div key={i} className={cn("flex shrink-0 flex-col gap-[9px]", largura)}>
            <Esqueleto className={cn("rounded-[10px]", estreito || modulo ? "aspect-3/4" : "aspect-video")} />
            {(!estreito || modulo) && (
              <>
                <Esqueleto className="h-3.5 w-4/5" />
                <Esqueleto className="h-3 w-1/2" />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
