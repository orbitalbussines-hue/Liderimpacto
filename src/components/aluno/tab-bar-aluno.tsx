"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ITENS_TAB_BAR, itemAtivo } from "./navegacao";

/** Bottom tab bar do celular: 76px, 5 abas, ativa em accent, sombra superior. */
export function TabBarAluno() {
  const ativo = itemAtivo(usePathname(), ITENS_TAB_BAR);
  return (
    <nav
      aria-label="Navegação inferior"
      className="sticky bottom-0 z-20 grid h-[76px] grid-cols-5 border-t border-border bg-surface pb-3 shadow-[0_-8px_24px_rgba(0,0,0,.18)] desk:hidden"
    >
      {ITENS_TAB_BAR.map(({ href, rotulo, icone: Icone }) => (
        <Link
          key={href}
          href={href}
          aria-current={ativo === href ? "page" : undefined}
          className={cn(
            "flex min-h-11 flex-col items-center justify-center gap-[5px] text-[11px] font-bold",
            ativo === href ? "text-accent" : "text-muted"
          )}
        >
          <Icone aria-hidden className="size-[22px]" />
          {rotulo}
        </Link>
      ))}
    </nav>
  );
}
