import Link from "next/link";
import { Play } from "lucide-react";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { EspacoImagem } from "@/components/ui/espaco-imagem";
import { Selo } from "@/components/ui/selo";
import { cn } from "@/lib/utils";
import type { ItemFileira, VarianteCartao } from "./tipos";

export interface CartaoFileiraProps {
  item: ItemFileira;
  variante?: VarianteCartao;
  /** Posição 1..N (só variante top10). */
  posicao?: number;
}

const HOVER = "text-text transition-transform duration-150 motion-safe:hover:scale-[1.04]";

/**
 * Capinha vertical 3:4 do módulo (RN-270): selo "MÓDULO N" no alto, play no canto, progresso sobre
 * a imagem e o título embaixo. Sem imagem: fundo escuro com o título grande (nunca um buraco).
 */
function CartaoModulo({ item }: { item: ItemFileira }) {
  // Nome único do link ("Módulo 2: Título, 4 aulas, 50% concluído"): selo, alt e título não se repetem no leitor.
  const selo = item.selo ? `${item.selo.charAt(0)}${item.selo.slice(1).toLowerCase()}: ` : "";
  const nome = [`${selo}${item.titulo}`, item.subtitulo, item.progresso !== undefined && `${item.progresso}% concluído`].filter(Boolean).join(", ");
  return (
    <Link href={item.href} aria-label={nome} className={cn("flex w-[180px] flex-col gap-[9px] desk:w-[230px]", HOVER)}>
      <div className="relative overflow-hidden rounded-[10px] bg-fixo-bg">
        {item.imagemUrl ? (
          <EspacoImagem src={item.imagemUrl} alt="" proporcao="3/4" sizes="(min-width: 900px) 230px, 180px" />
        ) : (
          <div className="relative flex aspect-3/4 w-full items-end bg-linear-to-b from-fixo-vidro to-fixo-bg p-3.5 pb-5" aria-hidden>
            <span className="line-clamp-4 font-serif text-[22px] leading-[1.1] font-semibold text-fixo-titulo desk:text-[26px]">{item.titulo}</span>
          </div>
        )}
        {item.selo && (
          <Selo className="absolute top-2.5 left-1/2 -translate-x-1/2 border border-fixo-accent bg-fixo-bg/80 px-2.5 text-[10px] font-extrabold tracking-[.14em] text-fixo-accent uppercase backdrop-blur-sm">
            {item.selo}
          </Selo>
        )}
        <span aria-hidden className="absolute right-2.5 bottom-3 grid size-8 place-items-center rounded-full bg-fixo-vidro-forte text-fixo-text">
          <Play className="size-3.5 translate-x-px fill-current" />
        </span>
        {item.progresso !== undefined && <BarraProgresso variante="sobreImagem" valor={item.progresso} rotulo={`Progresso em ${item.titulo}`} />}
      </div>
      <div>
        <div className="text-[13px] leading-[1.3] font-bold">{item.titulo}</div>
        {item.subtitulo && <div className="mt-0.5 text-xs text-muted">{item.subtitulo}</div>}
      </div>
    </Link>
  );
}

/** Cartão da fileira: sempre um link. Hover em scale 1.04 (desligado em reduced-motion). */
export function CartaoFileira({ item, variante = "padrao", posicao }: CartaoFileiraProps) {
  if (variante === "modulo") return <CartaoModulo item={item} />;
  const top10 = variante === "top10";
  const selo = variante === "novo" ? (item.selo === undefined ? "Novo" : item.selo) : null;
  return (
    <Link href={item.href} className={cn("flex items-end", HOVER)}>
      {top10 && (
        <span
          aria-hidden
          className="pointer-events-none relative z-0 -mr-[26px] -mb-0.5 min-w-[72px] pt-[18px] text-right text-[124px] leading-[.74] font-extrabold tracking-[-.06em] text-bg tabular-nums [-webkit-text-stroke:4px_var(--accent)] [paint-order:stroke_fill] desk:min-w-24 desk:text-[168px]"
        >
          {posicao}
        </span>
      )}
      <div
        className={cn(
          "relative z-10 flex flex-col gap-[9px]",
          top10 ? "w-[100px] desk:w-32" : "w-[210px] desk:w-[280px]"
        )}
      >
        <div className="relative overflow-hidden rounded-[10px] bg-surface">
          <EspacoImagem
            src={item.imagemUrl}
            alt={top10 ? `${posicao}º · ${item.titulo}` : ""}
            dica={item.titulo}
            proporcao={top10 ? "3/4" : "16/9"}
            sizes={top10 ? "128px" : "(min-width: 900px) 280px, 210px"}
          />
          {selo && <Selo tom="fixo" forma="canto" className="absolute bottom-0 left-0">{selo}</Selo>}
          {variante === "progresso" && item.progresso !== undefined && (
            <BarraProgresso
              variante="sobreImagem"
              valor={item.progresso}
              rotulo={`Progresso em ${item.titulo}`}
            />
          )}
        </div>
        {!top10 && (
          <div>
            <div className="text-[13px] leading-[1.3] font-bold">{item.titulo}</div>
            {item.subtitulo && <div className="mt-0.5 text-xs text-muted">{item.subtitulo}</div>}
          </div>
        )}
      </div>
    </Link>
  );
}
