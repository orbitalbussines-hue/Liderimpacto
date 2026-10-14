import type { ReactNode } from "react";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";

export interface ItemInclui {
  /** Ícone lucide já instanciado (<Video />). */
  icone: ReactNode;
  rotulo: string;
}

/** "Este curso inclui": lista com ícones accent. */
export function CartaoInclui({ itens, titulo = "Este curso inclui" }: { itens: ItemInclui[]; titulo?: string }) {
  return (
    <Cartao como="section" className="flex flex-col gap-3.5">
      <CartaoTitulo>{titulo}</CartaoTitulo>
      <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
        {itens.map(({ icone, rotulo }) => (
          <li key={rotulo} className="flex items-center gap-2.5 text-[13px] text-muted">
            <span aria-hidden className="flex text-accent [&_svg]:size-[15px]">
              {icone}
            </span>
            {rotulo}
          </li>
        ))}
      </ul>
    </Cartao>
  );
}
