import Link from "next/link";
import { Lock } from "lucide-react";
import { Cartao } from "@/components/ui/cartao";
import { cn } from "@/lib/utils";
import { MarcaAula } from "./marca-aula";
import type { AulaResumo } from "./tipos";

/** Aula da playlist: `AulaResumo` + a marca da aula aberta no player. */
export interface AulaPlaylist extends AulaResumo {
  /** É a aula aberta no player (sem isto, vale `estado === "atual"`). Concluída e aberta mostra o check. */
  atual?: boolean;
}

export interface GrupoPlaylist {
  id: string;
  titulo: string;
  aulas: AulaPlaylist[];
}

export interface ListaAulasProps {
  tituloCurso: string;
  aulasConcluidas: number;
  totalAulas: number;
  grupos: GrupoPlaylist[];
}

/**
 * Playlist lateral do player: módulos agrupados, aula aberta com `aria-current="page"` (fundo
 * accent-soft + borda esquerda), concluídas com check, travadas (`bloqueio`) com cadeado, sem
 * link e o motivo no lugar da duração. Sticky e rolável no desktop; no celular vai abaixo.
 */
export function ListaAulas({ tituloCurso, aulasConcluidas, totalAulas, grupos }: ListaAulasProps) {
  return (
    <Cartao
      como="aside"
      padding={0}
      aria-label="Lista de aulas"
      className="flex flex-col overflow-hidden desk:sticky desk:top-[84px] desk:max-h-[calc(100dvh-110px)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-[18px] py-4">
        <div className="min-w-0 truncate text-sm font-extrabold">{tituloCurso}</div>
        <div className="shrink-0 text-xs text-muted">
          {aulasConcluidas}/{totalAulas}
          <span className="sr-only"> aulas concluídas</span>
        </div>
      </div>
      <div className="flex flex-col overflow-y-auto pb-2">
        {grupos.map((grupo) => (
          <section key={grupo.id} aria-label={grupo.titulo}>
            <div className="px-[18px] pt-3 pb-1.5 text-[11px] font-bold tracking-[.1em] text-muted uppercase">{grupo.titulo}</div>
            {grupo.aulas.map((aula) => {
              const atual = aula.atual ?? aula.estado === "atual";
              const travada = !!aula.bloqueio && !atual;
              const classe = cn("flex min-h-11 items-center gap-3 border-l-[3px] border-transparent px-[18px] py-2.5", atual && "border-accent bg-accent-soft");
              const conteudo = (
                <>
                  {travada ? (
                    <span aria-hidden className="grid size-[18px] shrink-0 place-items-center text-muted">
                      <Lock className="size-3.5" />
                    </span>
                  ) : (
                    <MarcaAula estado={aula.estado === "concluida" ? "concluida" : atual ? "atual" : aula.estado} tamanho={18} />
                  )}
                  <span className={cn("min-w-0 flex-1 truncate text-[13px]", atual ? "font-bold" : "font-medium", travada && "text-muted")}>
                    {aula.titulo}
                    {aula.estado === "concluida" && <span className="sr-only"> (concluída)</span>}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{travada ? aula.bloqueio : aula.duracao}</span>
                </>
              );
              return travada ? (
                <div key={aula.id} className={classe}>
                  {conteudo}
                </div>
              ) : (
                <Link key={aula.id} href={aula.href} aria-current={atual ? "page" : undefined} className={cn(classe, "hover:bg-surface-2")}>
                  {conteudo}
                </Link>
              );
            })}
          </section>
        ))}
      </div>
    </Cartao>
  );
}
