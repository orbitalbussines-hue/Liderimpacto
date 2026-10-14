import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const seloVariants = cva("inline-flex shrink-0 items-center gap-1 whitespace-nowrap", {
  variants: {
    tom: {
      accent: "bg-accent-soft text-accent",
      ok: "bg-ok-soft text-ok",
      warn: "bg-warn-soft text-warn",
      neutro: "bg-surface-2 text-muted",
      /** Preenchido accent (28 AULAS, TOP 1, Novo). */
      solido: "bg-accent font-extrabold text-accent-ink",
      /** Igual ao solido, mas sempre o dourado da marca sobre fundo escuro (hero, capa de card). */
      fixo: "bg-fixo-accent font-extrabold text-fixo-accent-ink",
      /** Sem fundo ("Em breve" da sidebar). */
      transparente: "bg-transparent text-muted",
    },
    forma: {
      /** Status de tabela e avaliacoes: 12px/700, py4 px9. */
      pilula: "rounded-full px-[9px] py-1 text-xs font-bold",
      /** Micro-rotulo em maiusculas (TOP 10, ADMIN, Novo, 28 AULAS): 10px, r5. */
      etiqueta: "rounded-[5px] px-[7px] py-0.5 text-[10px] font-bold tracking-[.08em] uppercase",
      /** Tag de grupo em tabela (Autores · Signature): 11px/600, r6. */
      rotulo: "rounded-md px-2 py-[3px] text-[11px] font-semibold",
      /** Canto inferior esquerdo da capa ("Novo"): posicione com absolute left-0 bottom-0. */
      canto: "rounded-none rounded-tr-lg px-2 py-[3px] text-[10px] font-extrabold tracking-[.06em] uppercase",
    },
  },
  compoundVariants: [{ tom: "neutro", forma: "rotulo", class: "text-text" }],
  defaultVariants: { tom: "accent", forma: "pilula" },
});

export interface SeloProps extends ComponentProps<"span">, VariantProps<typeof seloVariants> {}

/** Badge. Ex.: <Selo tom="ok">Publicado</Selo> · <Selo tom="solido" forma="etiqueta">28 aulas</Selo> */
export function Selo({ tom, forma, className, ...props }: SeloProps) {
  return <span className={cn(seloVariants({ tom, forma }), className)} {...props} />;
}
