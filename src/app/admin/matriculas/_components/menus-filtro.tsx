"use client";

import { SlidersHorizontal } from "lucide-react";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { BotaoFiltro } from "@/components/ui/botao-filtro";
import { buttonVariants } from "@/components/ui/button";

export interface MenuFiltro {
  rotulo: string;
  itens: ItemMenuAdmin[];
}

/**
 * Menus "Curso ▾", "Resultado ▾"...: cada opção é um link com o filtro na URL (menu sem opção some).
 * No celular ficam atrás de um botão "Filtros" (`<details>` nativo, sem estado).
 */
export function MenusFiltro({ menus }: { menus: MenuFiltro[] }) {
  const lista = menus
    .filter((m) => m.itens.length > 0)
    .map((m) => (
      <MenuAdmin key={m.rotulo} gatilho={<BotaoFiltro />} itens={m.itens} alinhar="start">
        {m.rotulo}
      </MenuAdmin>
    ));
  return (
    <>
      <span className="contents max-desk:hidden">{lista}</span>
      <details className="desk:hidden open:basis-full">
        <summary className={buttonVariants({ variant: "contorno", size: "36", className: "w-fit list-none gap-1.5 px-3 [&::-webkit-details-marker]:hidden" })}>
          <SlidersHorizontal className="size-3.5 text-muted" aria-hidden />
          Filtros
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">{lista}</div>
      </details>
    </>
  );
}
