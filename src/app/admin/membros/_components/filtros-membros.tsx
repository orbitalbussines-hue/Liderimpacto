"use client";

import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { BotaoFiltro } from "@/components/ui/botao-filtro";

export interface FiltrosMembrosProps {
  /** Opções já com o href (searchParams) montado no servidor. */
  situacao: ItemMenuAdmin[];
  grupos: ItemMenuAdmin[];
}

/** Menus "Situação ▾" e "Grupos ▾" da lista de membros: cada opção é um link com o filtro na URL. */
export function FiltrosMembros({ situacao, grupos }: FiltrosMembrosProps) {
  return (
    <>
      <MenuAdmin gatilho={<BotaoFiltro />} itens={situacao} alinhar="start">
        Situação
      </MenuAdmin>
      {grupos.length > 0 && (
        <MenuAdmin gatilho={<BotaoFiltro />} itens={grupos} alinhar="start">
          Grupos
        </MenuAdmin>
      )}
    </>
  );
}
