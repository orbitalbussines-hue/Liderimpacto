"use client";

import { Menu } from "@base-ui/react/menu";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ItemMenuAdmin {
  rotulo: string;
  icone?: ReactNode;
  /** Ação (abre um diálogo, por ex.). */
  onSelecionar?: () => void;
  /** Navegação (filtro na URL). */
  href?: string;
  /** Item destrutivo (Remover): texto warn. */
  perigo?: boolean;
  /** Opção escolhida no filtro (✓). */
  marcado?: boolean;
}

export interface MenuAdminProps {
  /** O botão que abre (Button/BotaoFiltro) — recebe aria-expanded/teclado do menu. */
  gatilho: ReactElement;
  /** Conteúdo do gatilho (ícone ou texto). */
  children: ReactNode;
  itens: readonly ItemMenuAdmin[];
  /** Lado do alinhamento do popup. */
  alinhar?: "start" | "end";
}

const classeItem = (perigo?: boolean) =>
  cn(
    "flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[13px] font-semibold outline-none select-none data-highlighted:bg-surface-2 [&_svg]:size-4 [&_svg]:shrink-0",
    perigo ? "text-warn" : "text-text"
  );

/**
 * Menu suspenso do admin (ações da linha, filtros da tabela) sobre o Menu da Base UI:
 * teclado (setas, Home/End, ESC), foco e aria vêm da biblioteca; aqui só os tokens.
 */
export function MenuAdmin({ gatilho, children, itens, alinhar = "end" }: MenuAdminProps) {
  return (
    <Menu.Root>
      <Menu.Trigger render={gatilho}>{children}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align={alinhar} className="z-50 outline-none">
          <Menu.Popup className="min-w-[200px] rounded-xl border border-border bg-surface p-1 text-text shadow-card outline-none data-ending-style:opacity-0 data-starting-style:opacity-0">
            {itens.map((i) =>
              i.href ? (
                <Menu.LinkItem key={i.rotulo} closeOnClick render={<Link href={i.href} />} className={classeItem(i.perigo)}>
                  {i.icone}
                  <span className="flex-1">{i.rotulo}</span>
                  {i.marcado && <Check aria-label="selecionado" />}
                </Menu.LinkItem>
              ) : (
                <Menu.Item key={i.rotulo} onClick={i.onSelecionar} className={classeItem(i.perigo)}>
                  {i.icone}
                  <span className="flex-1">{i.rotulo}</span>
                </Menu.Item>
              )
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
