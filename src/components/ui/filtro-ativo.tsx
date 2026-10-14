import Link from "next/link";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export interface FiltroAtivoProps {
  /** Ex.: "Status · Ativo". */
  rotulo: ReactNode;
  /** Texto do nome acessivel do remover. Padrao: "Remover filtro". */
  rotuloRemover?: string;
  /** Remove via link (filtro na URL; funciona em Server Component). */
  hrefRemover?: string;
  /** Remove via callback (componente client). */
  onRemover?: () => void;
}

const classeX =
  "-mr-1.5 grid size-7 cursor-pointer place-items-center rounded-md transition-colors hover:bg-accent-soft";

/** Filtro aplicado: borda accent + accent-soft + texto accent, com botao × para remover. */
export function FiltroAtivo({
  rotulo,
  rotuloRemover = "Remover filtro",
  hrefRemover,
  onRemover,
}: FiltroAtivoProps) {
  return (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-accent bg-accent-soft pr-1.5 pl-3 text-[13px] font-semibold text-accent">
      {rotulo}
      {hrefRemover ? (
        <Link href={hrefRemover} aria-label={rotuloRemover} className={classeX}>
          <X className="size-3.5" aria-hidden />
        </Link>
      ) : onRemover ? (
        <button type="button" onClick={onRemover} aria-label={rotuloRemover} className={classeX}>
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}
