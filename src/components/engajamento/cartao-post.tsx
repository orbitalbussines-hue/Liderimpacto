import Link from "next/link";
import { Heart, MessageCircle, Share2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Cartao } from "@/components/ui/cartao";

export interface CartaoPostProps {
  autor: string;
  quando: string;
  aula?: { titulo: string; href: string };
  texto: string;
  curtidas: number;
  comentarios: number;
}

/** Post do feed da comunidade. Visual apenas. */
export function CartaoPost({ autor, quando, aula, texto, curtidas, comentarios }: CartaoPostProps) {
  return (
    <Cartao como="article" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar nome={autor} tamanho={40} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">{autor}</div>
          <div className="text-xs text-muted">
            {quando}
            {aula && (
              <>
                {" · em "}
                <Link href={aula.href} className="text-accent hover:underline">
                  {aula.titulo}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="m-0 text-[15px] leading-relaxed">{texto}</p>
      <div className="flex gap-[18px] border-t border-border pt-3 text-[13px] text-muted">
        <span className="flex items-center gap-1.5">
          <Heart aria-hidden className="size-[15px]" />
          {curtidas} curtidas
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle aria-hidden className="size-[15px]" />
          {comentarios} comentários
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-semibold text-accent">
          <Share2 aria-hidden className="size-[15px]" />
          Compartilhar
        </span>
      </div>
    </Cartao>
  );
}
