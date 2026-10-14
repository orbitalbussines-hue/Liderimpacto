import { cn } from "@/lib/utils";

/** Passos numerados de 26px ligados por linha 22×2; concluído em accent. */
export function EtapasTrilha({ total, concluidas }: { total: number; concluidas: number }) {
  return (
    <ol aria-label={`${concluidas} de ${total} etapas concluídas`} className="m-0 mt-1.5 flex list-none flex-wrap items-center gap-1.5 p-0">
      {Array.from({ length: total }, (_, i) => {
        const feita = i < concluidas;
        return (
          <li key={i} className="flex items-center gap-1.5">
            <span
              className={cn(
                "grid size-[26px] place-items-center rounded-full border-2 text-[11px] font-extrabold",
                feita ? "border-accent bg-accent text-accent-ink" : "border-border text-muted"
              )}
            >
              {i + 1}
            </span>
            {i < total - 1 && (
              <span aria-hidden className={cn("h-0.5 w-[22px]", i < concluidas - 1 ? "bg-accent" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
