"use client";

import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { BotaoFiltro } from "@/components/ui/botao-filtro";

export interface FiltrosBaseProps {
  /** Opções já com o href (searchParams) montado no servidor. */
  tipos: ItemMenuAdmin[];
  cursos: ItemMenuAdmin[];
}

/** Menus "Tipo ▾" e "Curso ▾" da Base de conhecimento: cada opção é um link com o filtro na URL. */
export function FiltrosBase({ tipos, cursos }: FiltrosBaseProps) {
  return (
    <>
      <MenuAdmin gatilho={<BotaoFiltro />} itens={tipos} alinhar="start">
        Tipo
      </MenuAdmin>
      <MenuAdmin gatilho={<BotaoFiltro />} itens={cursos} alinhar="start">
        Curso
      </MenuAdmin>
    </>
  );
}
