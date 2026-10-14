import Link from "next/link";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";

export interface CartaoFixadosProps {
  links: { rotulo: string; href: string; /** "Geral" (lista). */ detalhe?: string }[];
  /** `linha`: rótulos curtos separados por "·" (protótipo). `lista`: um por linha, até 2 linhas cada (resumo de post). */
  variante?: "linha" | "lista";
}

export function CartaoFixados({ links, variante = "linha" }: CartaoFixadosProps) {
  return (
    <Cartao como="section" padding={18} className="flex flex-col gap-2.5">
      <CartaoTitulo>Fixados</CartaoTitulo>
      {variante === "lista" ? (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[13px] leading-snug">
          {links.map(({ rotulo, href, detalhe }) => (
            <li key={href} className="flex flex-col gap-0.5">
              <Link href={href} className="line-clamp-2 font-semibold text-accent hover:underline">
                {rotulo}
              </Link>
              {detalhe && <span className="text-xs text-muted">{detalhe}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-x-1 p-0 text-[13px] leading-normal text-muted">
          {links.map(({ rotulo, href }, i) => (
            <li key={href}>
              {i > 0 && <span aria-hidden> · </span>}
              <Link href={href} className="text-accent hover:underline">
                {rotulo}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}
