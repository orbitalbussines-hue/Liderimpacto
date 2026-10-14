import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Capitulo {
  titulo: string;
  atual?: boolean;
  /** Rótulo do tempo para o leitor de tela/título ("04:10"). */
  tempo?: string;
}

export interface FaixaCapitulosProps {
  capitulos: Capitulo[];
  /** Com isto cada capítulo vira botão (pula o vídeo). Exige componente client. */
  onSelecionar?: (indice: number) => void;
}

/** Faixa "Capítulos" abaixo do player: o atual em negrito, separados por "·". */
export function FaixaCapitulos({ capitulos, onSelecionar }: FaixaCapitulosProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface px-4 py-3 text-[13px]">
      <Clock aria-hidden className="size-4 text-accent" />
      <span className="text-muted">Capítulos</span>
      {capitulos.map(({ titulo, atual, tempo }, i) => (
        <span key={`${i}-${titulo}`} className="contents">
          {i > 0 && (
            <span aria-hidden className="text-muted">
              ·
            </span>
          )}
          {onSelecionar ? (
            <button
              type="button"
              onClick={() => onSelecionar(i)}
              aria-current={atual ? "true" : undefined}
              aria-label={tempo ? `${titulo}, em ${tempo}` : undefined}
              title={tempo}
              className={cn("cursor-pointer rounded-sm hover:text-text hover:underline underline-offset-4", atual ? "font-bold text-text" : "text-muted")}
            >
              {titulo}
            </button>
          ) : (
            <span aria-current={atual ? "true" : undefined} className={atual ? "font-bold" : "text-muted"}>
              {titulo}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
