import Link from "next/link";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";

export function CartaoFixados({ links }: { links: { rotulo: string; href: string }[] }) {
  return (
    <Cartao como="section" padding={18} className="flex flex-col gap-2.5">
      <CartaoTitulo>Fixados</CartaoTitulo>
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
    </Cartao>
  );
}
