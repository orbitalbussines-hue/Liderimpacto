import Link from "next/link";
import { Cartao } from "@/components/ui/cartao";
import { cn } from "@/lib/utils";
import { MarcaAula } from "./marca-aula";
import type { GrupoAulas } from "./tipos";

export interface ListaAulasProps {
  tituloCurso: string;
  aulasConcluidas: number;
  totalAulas: number;
  grupos: GrupoAulas[];
}

/** Playlist lateral do player: aula atual com `aria-current="page"`; rolável com altura máxima. */
export function ListaAulas({ tituloCurso, aulasConcluidas, totalAulas, grupos }: ListaAulasProps) {
  return (
    <Cartao
      como="aside"
      padding={0}
      aria-label="Lista de aulas"
      className="flex flex-col desk:sticky desk:top-[84px] desk:max-h-[calc(100dvh-110px)]"
    >
      <div className="flex items-center justify-between border-b border-border px-[18px] py-4">
        <div className="text-sm font-extrabold">{tituloCurso}</div>
        <div className="text-xs text-muted">
          {aulasConcluidas}/{totalAulas}
        </div>
      </div>
      <div className="flex flex-col overflow-y-auto">
        {grupos.map((grupo) => (
          <div key={grupo.id}>
            <div className="px-[18px] pt-3 pb-1.5 text-[11px] font-bold tracking-[.1em] text-muted uppercase">
              {grupo.titulo}
            </div>
            {grupo.aulas.map((aula) => {
              const atual = aula.estado === "atual";
              return (
                <Link
                  key={aula.id}
                  href={aula.href}
                  aria-current={atual ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 border-l-[3px] border-transparent px-[18px] py-2.5 hover:bg-surface-2",
                    atual && "border-accent bg-accent-soft"
                  )}
                >
                  <MarcaAula estado={aula.estado} tamanho={18} />
                  <span className={cn("min-w-0 flex-1 truncate text-[13px]", atual ? "font-bold" : "font-medium")}>
                    {aula.titulo}
                  </span>
                  <span className="text-[11px] text-muted">{aula.duracao}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </Cartao>
  );
}
