import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { IconeQuadrado } from "@/components/ui/icone-quadrado";
import { Selo } from "@/components/ui/selo";
import type { AcaoPagina, CartaoMolde } from "./navegacao";

export interface PaginaCardsProps {
  titulo: string;
  subtitulo: string;
  acao?: AcaoPagina;
  cards: readonly CartaoMolde[];
}

function ConteudoCartao({ card }: { card: CartaoMolde }) {
  const Icone = card.icone;
  return (
    <>
      <IconeQuadrado tamanho={42}>
        <Icone />
      </IconeQuadrado>
      <div className="min-w-0 flex-1">
        <CartaoTitulo tamanho={15} className="font-bold">
          {card.href ? (
            <Link
              href={card.href}
              className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent"
            >
              {card.titulo}
            </Link>
          ) : (
            card.titulo
          )}
        </CartaoTitulo>
        <p className="m-0 mt-[3px] text-xs leading-normal text-muted">{card.descricao}</p>
      </div>
      {card.href ? (
        <ChevronRight className="size-[15px] shrink-0 text-muted" aria-hidden />
      ) : (
        <Selo tom="neutro" forma="etiqueta" className="shrink-0">
          Em breve
        </Selo>
      )}
    </>
  );
}

/** Só a grade de cards (para telas próprias que montam o cabeçalho, como o hub da Área de membros). */
export function GradeCards({ cards }: { cards: readonly CartaoMolde[] }) {
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5 p-0">
      {cards.map((card) => (
        <li key={card.titulo} className="flex">
          <Cartao
            className={
              card.href
                ? "relative flex flex-1 items-start gap-3.5 transition-colors duration-150 hover:bg-surface-2"
                : "flex flex-1 items-start gap-3.5"
            }
          >
            <ConteudoCartao card={card} />
          </Cartao>
        </li>
      ))}
    </ul>
  );
}

/**
 * MOLDE de página de cards do admin (Área de membros, Configurações, Vendas e financeiro...).
 * Card sem `href` ainda não tem tela: aparece com o selo "Em breve" (nunca seta para lugar nenhum).
 */
export function PaginaCards({ titulo, subtitulo, acao, cards }: PaginaCardsProps) {
  const Icone = acao?.icone;
  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        variante="admin"
        titulo={titulo}
        descricao={subtitulo}
        acoes={
          acao &&
          Icone && (
            <Button size="36" className="h-[38px]">
              <Icone className="size-3.5" aria-hidden />
              {acao.rotulo}
            </Button>
          )
        }
      />
      <GradeCards cards={cards} />
    </div>
  );
}
