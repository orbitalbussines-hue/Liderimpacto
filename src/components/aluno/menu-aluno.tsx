"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ITENS_MENU, itemAtivo } from "./navegacao";

/** Menu em pílulas do header (desktop): ocupa só a largura dos itens; estreito, rola na horizontal (o fade cobre o respiro final). */
export function MenuAluno() {
  const ativo = itemAtivo(usePathname(), ITENS_MENU);
  return (
    <nav
      aria-label="Principal"
      className="scrollbar-oculta hidden min-w-0 flex-initial overflow-x-auto pr-7 [mask-image:linear-gradient(90deg,black_calc(100%-28px),transparent)] desk:flex"
    >
      {ITENS_MENU.map(({ href, rotulo }) => (
        <Link
          key={href}
          href={href}
          aria-current={ativo === href ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-full px-3 py-[9px] text-sm font-semibold whitespace-nowrap",
            ativo === href ? "bg-surface-2 text-text" : "text-muted hover:text-text"
          )}
        >
          {rotulo}
        </Link>
      ))}
    </nav>
  );
}
