import Link from "next/link";
import { cn } from "@/lib/utils";

export interface Canal {
  id: string;
  nome: string;
  href: string;
}

/** Coluna de canais da comunidade (desktop). */
export function ListaCanais({ canais, ativoId }: { canais: Canal[]; ativoId?: string }) {
  return (
    <nav aria-label="Canais da comunidade" className="flex flex-col gap-1.5">
      <h2 className="m-0 mb-2.5 font-sans text-lg font-extrabold tracking-normal">Comunidade</h2>
      {canais.map((canal) => {
        const ativo = canal.id === ativoId;
        return (
          <Link
            key={canal.id}
            href={canal.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-semibold",
              ativo ? "bg-accent-soft text-accent" : "text-text hover:bg-surface-2"
            )}
          >
            <span aria-hidden className="text-accent">
              #
            </span>
            {canal.nome}
          </Link>
        );
      })}
    </nav>
  );
}
