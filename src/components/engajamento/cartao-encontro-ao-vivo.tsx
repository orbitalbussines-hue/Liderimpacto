import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { cn } from "@/lib/utils";
import { BlocoData } from "./bloco-data";

export interface CartaoEncontroAoVivoProps {
  dia: string;
  /** "set" (a tela põe em maiúsculas). */
  mes: string;
  titulo: string;
  /** "Terça-feira, 21 de outubro · 19:30" ou "Ao vivo agora". */
  quando: string;
  /** Página do encontro. */
  href: string;
  /** `.ics` do "Adicionar à agenda" (sem = sem botão). */
  hrefAgenda?: string;
  /** Lista de todos os encontros (no celular é o caminho até ela). */
  hrefTodos?: string;
  /** id do título (troque quando houver dois cartões na mesma página). */
  idTitulo?: string;
  className?: string;
}

/** Próximo encontro ao vivo: data em bloco accent-soft, título com link para o encontro. */
export function CartaoEncontroAoVivo({ dia, mes, titulo, quando, href, hrefAgenda, hrefTodos, idTitulo = "titulo-encontro-ao-vivo", className }: CartaoEncontroAoVivoProps) {
  return (
    <Cartao como="section" padding={18} className={cn("flex flex-col gap-3", className)} aria-labelledby={idTitulo}>
      <div className="flex items-center justify-between gap-2">
        <CartaoTitulo como="h2" id={idTitulo}>
          Próximo encontro ao vivo
        </CartaoTitulo>
        {hrefTodos && (
          <Link href={hrefTodos} className="-my-2 shrink-0 py-3 text-xs font-semibold text-muted hover:text-text">
            Ver todos
          </Link>
        )}
      </div>
      <Link href={href} className="group flex min-h-11 items-center gap-3 rounded-[10px]">
        <BlocoData dia={dia} mes={mes} />
        <div className="min-w-0">
          <div className="text-sm font-bold group-hover:underline">{titulo}</div>
          <div className="text-xs text-muted">{quando}</div>
        </div>
      </Link>
      {hrefAgenda && (
        <a href={hrefAgenda} download className={buttonVariants({ variant: "contorno", size: "40" })}>
          <CalendarPlus aria-hidden />
          Adicionar à agenda
        </a>
      )}
    </Cartao>
  );
}
