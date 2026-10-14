"use client";

import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { BotaoFiltro } from "@/components/ui/botao-filtro";

export interface FiltrosConteudosProps {
  /** Opções já com o href (searchParams) montado no servidor. */
  tipos: ItemMenuAdmin[];
  situacoes: ItemMenuAdmin[];
}

/** Menus "Tipo ▾" e "Situação ▾" da lista de produtos: cada opção é um link com o filtro na URL. */
export function FiltrosConteudos({ tipos, situacoes }: FiltrosConteudosProps) {
  return (
    <>
      <MenuAdmin gatilho={<BotaoFiltro />} itens={tipos} alinhar="start">
        Tipo
      </MenuAdmin>
      <MenuAdmin gatilho={<BotaoFiltro />} itens={situacoes} alinhar="start">
        Situação
      </MenuAdmin>
    </>
  );
}
