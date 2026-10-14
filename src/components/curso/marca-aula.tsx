import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstadoAula } from "./tipos";

/** Círculo de estado da aula: concluída = preenchido com check; atual = anel accent; pendente = anel neutro. */
export function MarcaAula({ estado, tamanho = 20 }: { estado: EstadoAula; tamanho?: 18 | 20 }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-2",
        tamanho === 20 ? "size-5" : "size-[18px]",
        estado === "pendente" ? "border-border" : "border-accent",
        estado === "concluida" && "bg-accent text-accent-ink"
      )}
    >
      {estado === "concluida" && <Check className={cn("stroke-[3.5]", tamanho === 20 ? "size-[11px]" : "size-2.5")} />}
    </span>
  );
}
