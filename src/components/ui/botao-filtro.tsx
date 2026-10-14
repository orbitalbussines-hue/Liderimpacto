import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";

export interface BotaoFiltroProps extends Omit<ButtonProps, "variant" | "size"> {
  /** Estado do menu que o botao abre (aria-expanded). */
  aberto?: boolean;
}

/** "Tipo ▾": 36px, borda, 13px/600. Abre um menu/popover de filtro. */
export function BotaoFiltro({ aberto, children, className, ...props }: BotaoFiltroProps) {
  return (
    <Button
      variant="contorno"
      size="36"
      aria-haspopup="true"
      aria-expanded={aberto}
      className={cn("gap-1.5 px-3", className)}
      {...props}
    >
      {children}
      <ChevronDown className="size-3.5 text-muted" aria-hidden />
    </Button>
  );
}
