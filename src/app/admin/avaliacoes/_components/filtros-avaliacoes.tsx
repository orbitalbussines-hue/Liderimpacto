"use client";

import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { BotaoFiltro } from "@/components/ui/botao-filtro";

export interface FiltrosAvaliacoesProps {
  /** Opções já com o href (searchParams) montado no servidor. */
  cursos: ItemMenuAdmin[];
  situacoes: ItemMenuAdmin[];
}

/** Menus "Curso ▾" e "Situação ▾": cada opção é um link com o filtro na URL. */
export function FiltrosAvaliacoes({ cursos, situacoes }: FiltrosAvaliacoesProps) {
  return (
    <>
      <MenuAdmin gatilho={<BotaoFiltro />} itens={cursos} alinhar="start">
        Curso
      </MenuAdmin>
      <MenuAdmin gatilho={<BotaoFiltro />} itens={situacoes} alinhar="start">
        Situação
      </MenuAdmin>
    </>
  );
}
