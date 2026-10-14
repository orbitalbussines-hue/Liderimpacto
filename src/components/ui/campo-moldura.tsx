import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CampoMolduraProps {
  /** id do controle: liga o <label htmlFor> e gera os ids de ajuda/erro. */
  id: string;
  rotulo: ReactNode;
  /** Esconde o rotulo na tela (continua para leitor de tela). Ex.: busca. */
  rotuloOculto?: boolean;
  /** `padrao` = 13px/600 (perfil, login). `discreto` = 12px/700 muted (paineis do construtor). */
  estiloRotulo?: "padrao" | "discreto";
  ajuda?: ReactNode;
  erro?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** ids que o controle deve pôr em `aria-describedby` (ajuda e erro, quando existem). */
export function idsDescricao(id: string, ajuda?: ReactNode, erro?: ReactNode): string | undefined {
  const ids = [ajuda ? `${id}-ajuda` : null, erro ? `${id}-erro` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

/**
 * Moldura de campo: rotulo acima, controle, ajuda e erro abaixo. Usada por
 * Campo e AreaTexto; use direto para envolver um controle proprio
 * (ex.: GrupoChips com rotulo "Tipo de conteudo"): de ao grupo
 * `aria-labelledby={`${id}-rotulo`}` — o <label> sempre ganha esse id.
 */
export function CampoMoldura({
  id,
  rotulo,
  rotuloOculto = false,
  estiloRotulo = "padrao",
  ajuda,
  erro,
  className,
  children,
}: CampoMolduraProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label
        id={`${id}-rotulo`}
        htmlFor={id}
        className={cn(
          rotuloOculto && "sr-only",
          estiloRotulo === "padrao" ? "text-[13px] font-semibold text-text" : "text-xs font-bold text-muted"
        )}
      >
        {rotulo}
      </label>
      {children}
      {ajuda && (
        <p id={`${id}-ajuda`} className="text-xs text-muted">
          {ajuda}
        </p>
      )}
      {erro && (
        <p id={`${id}-erro`} className="text-xs font-semibold text-warn">
          {erro}
        </p>
      )}
    </div>
  );
}
