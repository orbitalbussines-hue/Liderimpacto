"use client";

import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { BotaoFiltro } from "@/components/ui/botao-filtro";

/** Menus "Produto ▾" e "Situação ▾": cada opção é um link com o filtro na URL. */
export function FiltrosMatriculas({ produtos, situacoes }: { produtos: ItemMenuAdmin[]; situacoes: ItemMenuAdmin[] }) {
  return (
    <>
      {produtos.length > 0 && (
        <MenuAdmin gatilho={<BotaoFiltro />} itens={produtos} alinhar="start">
          Produto
        </MenuAdmin>
      )}
      <MenuAdmin gatilho={<BotaoFiltro />} itens={situacoes} alinhar="start">
        Situação
      </MenuAdmin>
    </>
  );
}
