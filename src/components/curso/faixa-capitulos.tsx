import { Clock } from "lucide-react";

export interface Capitulo {
  titulo: string;
  atual?: boolean;
}

/** Faixa "Capítulos" abaixo do player: o atual em negrito, separados por "·". */
export function FaixaCapitulos({ capitulos }: { capitulos: Capitulo[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface px-4 py-3 text-[13px]">
      <Clock aria-hidden className="size-4 text-accent" />
      <span className="text-muted">Capítulos</span>
      {capitulos.map(({ titulo, atual }, i) => (
        <span key={titulo} className="contents">
          {i > 0 && (
            <span aria-hidden className="text-muted">
              ·
            </span>
          )}
          <span aria-current={atual ? "true" : undefined} className={atual ? "font-bold" : "text-muted"}>
            {titulo}
          </span>
        </span>
      ))}
    </div>
  );
}
