import Link from "next/link";
import type { ReactNode } from "react";
import { Heart, MessageCircle, Pin, Share2 } from "lucide-react";
import { TextoComLinks } from "@/components/comunidade/texto-com-links";
import { Avatar } from "@/components/ui/avatar";
import { Cartao } from "@/components/ui/cartao";
import { cn } from "@/lib/utils";

export interface CartaoPostProps {
  autor: string;
  avatarSrc?: string | null;
  /** Autor da equipe: "· Equipe" em texto discreto ao lado do nome (sem chip). */
  equipe?: boolean;
  /** "há 15 dias". */
  quando: ReactNode;
  aula?: { titulo: string; href: string };
  /** Feed de todos os canais: "# Geral" na linha de meta. */
  canal?: { nome: string; href: string };
  editado?: boolean;
  fixado?: boolean;
  /** Texto PURO: links viram `<a>` por `segmentosDeTexto`, o resto é escapado. */
  texto: string;
  curtidas: number;
  comentarios: number;
  /** ⋮ no canto do cabeçalho. */
  menu?: ReactNode;
  /** No lugar do texto (edição). */
  corpo?: ReactNode;
  /** Abaixo do texto: imagens, PDFs, enquete, aviso de oculto. */
  children?: ReactNode;
  /** Barra de ações interativa; sem ela, a barra estática do catálogo. */
  acoes?: ReactNode;
  className?: string;
}

/** Post do feed da comunidade (tela 8). Visual; o comportamento entra por `menu`, `acoes` e `children`. */
export function CartaoPost({ autor, avatarSrc, equipe, quando, aula, canal, editado, fixado, texto, curtidas, comentarios, menu, corpo, children, acoes, className }: CartaoPostProps) {
  return (
    <Cartao como="article" className={cn("flex flex-col gap-3", className)}>
      {fixado && (
        <div className="-mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Pin aria-hidden className="size-3.5" />
          Fixado pela equipe
        </div>
      )}
      <div className="flex items-center gap-3">
        <Avatar nome={autor} src={avatarSrc} tamanho={40} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">
            {autor}
            {equipe && <span className="text-xs font-semibold text-muted"> · Equipe</span>}
          </div>
          <div className="text-xs text-muted">
            {quando}
            {editado && " · editado"}
            {canal && (
              <>
                {" · "}
                <Link href={canal.href} className="hover:text-text hover:underline">
                  # {canal.nome}
                </Link>
              </>
            )}
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
        {menu}
      </div>
      {corpo ?? <TextoComLinks texto={texto} className="text-[15px] leading-relaxed" />}
      {children}
      {acoes ?? (
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
      )}
    </Cartao>
  );
}
