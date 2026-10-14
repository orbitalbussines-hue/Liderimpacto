"use client";

import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { BotaoFiltro } from "@/components/ui/botao-filtro";

/**
 * "Recentes ▾" / "Abertas ▾": opções como links (filtro na URL). Client de propósito: o gatilho
 * precisa ser montado no cliente para o Menu injetar o rótulo e o aria no botão.
 */
export function MenuFiltro({ rotulo, itens, className }: { rotulo: string; itens: ItemMenuAdmin[]; className?: string }) {
  return (
    <MenuAdmin gatilho={<BotaoFiltro className={className} />} itens={itens} alinhar="start">
      {rotulo}
    </MenuAdmin>
  );
}
