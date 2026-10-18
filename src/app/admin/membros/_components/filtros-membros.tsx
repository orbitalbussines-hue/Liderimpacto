"use client";

import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { BotaoFiltro } from "@/components/ui/botao-filtro";

export interface FiltrosMembrosProps {
  /** Um menu por filtro ("Situação", "Grupos", "Tags"); opções já com o href montado no servidor. Menu sem opções some. */
  menus: readonly { rotulo: string; itens: ItemMenuAdmin[] }[];
}

/** Menus de filtro das listas de Membros (membros, vouchers): cada opção é um link com o filtro na URL. */
export function FiltrosMembros({ menus }: FiltrosMembrosProps) {
  return menus
    .filter((m) => m.itens.length > 0)
    .map((m) => (
      <MenuAdmin key={m.rotulo} gatilho={<BotaoFiltro />} itens={m.itens} alinhar="start">
        {m.rotulo}
      </MenuAdmin>
    ));
}
