import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Canal {
  id: string;
  nome: string;
  href: string;
  /** Canal de um grupo, curso ou só da equipe: cadeado discreto depois do nome. */
  restrito?: boolean;
}

export interface ListaCanaisProps {
  canais: Canal[];
  ativoId?: string;
  /** Nível do título "Comunidade" (a página do aluno usa h1). */
  comoTitulo?: "h1" | "h2";
}

/** Coluna de canais da comunidade (desktop). */
export function ListaCanais({ canais, ativoId, comoTitulo: Titulo = "h2" }: ListaCanaisProps) {
  return (
    <nav aria-label="Canais da comunidade" className="flex flex-col gap-1.5">
      <Titulo className="m-0 mb-2.5 font-sans text-lg font-extrabold tracking-normal">Comunidade</Titulo>
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
            <span className="min-w-0 flex-1 truncate">{canal.nome}</span>
            {canal.restrito && <Lock aria-label="restrito" className="size-3.5 shrink-0 text-muted" />}
          </Link>
        );
      })}
    </nav>
  );
}
