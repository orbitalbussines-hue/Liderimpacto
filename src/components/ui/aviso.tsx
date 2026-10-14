import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const TOM = {
  erro: { classe: "border-warn/25 bg-warn/[.06]", icone: <CircleAlert className="text-warn" aria-hidden /> },
  ok: { classe: "border-ok/25 bg-ok/[.06]", icone: <CircleCheck className="text-ok" aria-hidden /> },
  info: { classe: "border-border bg-surface", icone: <Info className="text-muted" aria-hidden /> },
} as const;

export interface AvisoProps {
  /** `erro` anuncia na hora (role="alert"); `ok`/`info` sao educados (role="status"). */
  tom?: keyof typeof TOM;
  children: ReactNode;
  id?: string;
  className?: string;
}

/**
 * Mensagem curta dentro de formulario (erro de login, link enviado, senha definida).
 * Borda 1px translucida + fundo levissimo do tom; texto sempre na cor de leitura.
 */
export function Aviso({ tom = "info", children, id, className }: AvisoProps) {
  const t = TOM[tom];
  return (
    <div
      id={id}
      role={tom === "erro" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed text-text [&_svg]:mt-px [&_svg]:size-4 [&_svg]:shrink-0",
        t.classe,
        className
      )}
    >
      {t.icone}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
