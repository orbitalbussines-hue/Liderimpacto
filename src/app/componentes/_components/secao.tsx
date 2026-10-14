import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SecaoProps {
  id: string;
  titulo: string;
  /** Arquivo(s) do componente, para achar rapido. */
  arquivo: string;
  children: ReactNode;
}

/** Bloco do catalogo: titulo, caminho do arquivo e as amostras. */
export function Secao({ id, titulo, arquivo, children }: SecaoProps) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="flex scroll-mt-6 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
        <h2 id={`${id}-titulo`} className="m-0 text-[28px]">
          {titulo}
        </h2>
        <code className="text-xs text-muted">{arquivo}</code>
      </div>
      {children}
    </section>
  );
}

interface AmostraProps {
  rotulo: string;
  children: ReactNode;
  /** Fundo sempre escuro (hero, login, capa). */
  escura?: boolean;
  className?: string;
}

/** Uma linha de exemplos com legenda. */
export function Amostra({ rotulo, children, escura = false, className }: AmostraProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-bold tracking-[.1em] text-muted uppercase">{rotulo}</div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-3",
          escura && "rounded-2xl bg-fixo-bg p-5",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
