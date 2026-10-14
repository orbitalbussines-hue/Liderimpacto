import { Esqueleto } from "@/components/ui/esqueleto";
import { cn } from "@/lib/utils";

export interface EsqueletoFileiraProps {
  /** Cartões 3:4 estreitos (Top 10). */
  estreito?: boolean;
  /** Texto para leitor de tela ("Carregando Top 10"). */
  rotulo?: string;
}

/** Fileira em carregamento: título + cartões no formato real, sem rolagem horizontal. */
export function EsqueletoFileira({ estreito = false, rotulo = "Carregando" }: EsqueletoFileiraProps) {
  return (
    <div aria-busy="true" className="flex flex-col gap-2.5">
      <span className="sr-only">{rotulo}</span>
      <Esqueleto className="h-5 w-56 desk:h-6" />
      <div className="flex gap-3 overflow-hidden pt-1.5 pb-3">
        {Array.from({ length: estreito ? 8 : 6 }, (_, i) => (
          <div key={i} className={cn("flex shrink-0 flex-col gap-[9px]", estreito ? "w-[100px] desk:w-32" : "w-[210px] desk:w-[280px]")}>
            <Esqueleto className={cn("rounded-[10px]", estreito ? "aspect-3/4" : "aspect-video")} />
            {!estreito && (
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
