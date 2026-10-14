import Link from "next/link";
import { Heart, Star } from "lucide-react";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { buttonVariants } from "@/components/ui/button";
import { Cartao } from "@/components/ui/cartao";
import { EspacoImagem } from "@/components/ui/espaco-imagem";

export interface CartaoCursoProps {
  titulo: string;
  capaUrl?: string;
  capaDica?: string;
  /** 0 a 100. */
  progresso: number;
  aulasConcluidas: number;
  totalAulas: number;
  href: string;
}

function BotaoCircular({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="grid size-[30px] place-items-center rounded-full bg-fixo-bg/60 text-fixo-text">
      {children}
    </span>
  );
}

/** Cartão da tela Continuar: capa 16:10, título em caixa alta, progresso e "Acessar". */
export function CartaoCurso({ titulo, capaUrl, capaDica, progresso, aulasConcluidas, totalAulas, href }: CartaoCursoProps) {
  return (
    <Cartao como="article" padding={0} className="flex flex-col">
      <div className="relative">
        <EspacoImagem src={capaUrl} alt="" dica={capaDica ?? `Capa · ${titulo}`} proporcao="16/10" sizes="(min-width: 900px) 33vw, 100vw" />
        <div className="pointer-events-none absolute top-2.5 right-2.5 flex gap-1.5">
          <BotaoCircular>
            <Heart className="size-3.5" />
          </BotaoCircular>
          <BotaoCircular>
            <Star className="size-3.5" />
          </BotaoCircular>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <h3 className="m-0 font-sans text-[15px] font-bold tracking-[.02em] uppercase">{titulo}</h3>
        <BarraProgresso valor={progresso} mostrarPercentual rotulo={`Progresso em ${titulo}`} />
        <div className="text-xs text-muted">
          {aulasConcluidas}/{totalAulas} aulas
        </div>
        <Link href={href} className={buttonVariants({ size: "42", larguraTotal: true })}>
          Acessar
        </Link>
      </div>
    </Cartao>
  );
}
