import type { ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { IconeQuadrado } from "./icone-quadrado";

export interface EstadoErroProps {
  titulo?: ReactNode;
  /** Mensagem segura (r.erro da action). Nunca erro cru do banco. */
  mensagem?: ReactNode;
  /** Mostra "Tentar novamente" (ex.: `reset` do error.tsx). Exige componente client. */
  onTentarNovamente?: () => void;
  className?: string;
}

/** Falha ao carregar (nao desenhado no prototipo; derivado do tom warn). `role="alert"`. */
export function EstadoErro({
  titulo = "Não foi possível carregar",
  mensagem = "Verifique sua conexão e tente de novo.",
  onTentarNovamente,
  className,
}: EstadoErroProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-warn/40 bg-warn-soft px-5 py-8 text-center",
        className
      )}
    >
      <IconeQuadrado tamanho={44} tom="warn">
        <AlertTriangle />
      </IconeQuadrado>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="m-0 text-[15px] font-bold">{titulo}</p>
        <p className="m-0 text-[13px] leading-relaxed text-muted">{mensagem}</p>
      </div>
      {onTentarNovamente && (
        <Button variant="contorno" size="40" onClick={onTentarNovamente}>
          <RotateCcw aria-hidden />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
