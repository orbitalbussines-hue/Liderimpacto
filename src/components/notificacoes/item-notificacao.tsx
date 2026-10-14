import Link from "next/link";
import { cn } from "@/lib/utils";
import { tempoRelativo } from "./tempo";

export interface ItemDaLista {
  id: string;
  texto: string;
  href: string;
  lida: boolean;
  em: Date | string;
}

/** Uma notificação. O texto entra SEMPRE como texto (escape do React), nunca como HTML. */
export function ItemNotificacao({ item, aoClicar }: { item: ItemDaLista; aoClicar: (item: ItemDaLista) => void }) {
  return (
    <li>
      <Link
        href={item.href}
        onClick={() => aoClicar(item)}
        className={cn(
          "flex min-h-11 items-start gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-surface-2",
          !item.lida && "bg-accent-soft hover:bg-accent-soft"
        )}
      >
        <span aria-hidden className={cn("mt-[7px] size-2 shrink-0 rounded-full", item.lida ? "bg-transparent" : "bg-accent")} />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[13px] leading-snug", item.lida ? "text-muted" : "font-semibold text-text")}>
            {!item.lida && <span className="sr-only">Não lida: </span>}
            {item.texto}
          </span>
          <time suppressHydrationWarning dateTime={new Date(item.em).toISOString()} className="mt-0.5 block text-xs text-muted">
            {tempoRelativo(item.em)}
          </time>
        </span>
      </Link>
    </li>
  );
}
