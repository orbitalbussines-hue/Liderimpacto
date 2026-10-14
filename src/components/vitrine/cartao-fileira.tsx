import Link from "next/link";
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

/** Cartão da fileira: sempre um link. Hover em scale 1.04 (desligado em reduced-motion). */
export function CartaoFileira({ item, variante = "padrao", posicao }: CartaoFileiraProps) {
  const top10 = variante === "top10";
  const selo = variante === "novo" ? (item.selo === undefined ? "Novo" : item.selo) : null;
  return (
    <Link
      href={item.href}
      className="flex items-end text-text transition-transform duration-150 motion-safe:hover:scale-[1.04]"
    >
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
