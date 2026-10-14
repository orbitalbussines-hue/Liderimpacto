import type { EstadoItemTrilha } from "@/lib/trilhas/regras";
import { cn } from "@/lib/utils";

const TEXTO_ESTADO: Record<EstadoItemTrilha, string> = {
  concluido: "concluída",
  andamento: "em andamento",
  disponivel: "disponível",
  bloqueado: "bloqueada",
};

export interface EtapasTrilhaProps {
  total: number;
  concluidas: number;
  /** Estado real de cada etapa (na ordem). Sem isto, as `concluidas` primeiras ficam douradas. */
  estados?: readonly EstadoItemTrilha[];
}

/** Passos numerados de 26px ligados por linha 22×2; concluído em accent, em andamento com anel accent. */
export function EtapasTrilha({ total, concluidas, estados }: EtapasTrilhaProps) {
  const lista: EstadoItemTrilha[] = estados ? [...estados] : Array.from({ length: total }, (_, i) => (i < concluidas ? "concluido" : "disponivel"));
  const feitas = lista.filter((e) => e === "concluido").length;
  return (
    <ol aria-label={`${feitas} de ${lista.length} etapas concluídas`} className="m-0 mt-1.5 flex list-none flex-wrap items-center gap-1.5 p-0">
      {lista.map((estado, i) => {
        const feita = estado === "concluido";
        return (
          <li key={i} className="flex items-center gap-1.5">
            <span
              aria-label={`Etapa ${i + 1}: ${TEXTO_ESTADO[estado]}`}
              className={cn(
                "grid size-[26px] place-items-center rounded-full border-2 text-[11px] font-extrabold",
                feita ? "border-accent bg-accent text-accent-ink" : estado === "andamento" ? "border-accent text-accent" : "border-border text-muted",
              )}
            >
              {i + 1}
            </span>
            {i < lista.length - 1 && <span aria-hidden className={cn("h-0.5 w-[22px]", feita && lista[i + 1] === "concluido" ? "bg-accent" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}
