import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cartaoVariants = cva("min-w-0 border border-border bg-surface", {
  variants: {
    /** 0 (cartao com tabela/capa, o conteudo controla), 16, 18, 20 (padrao), 24. */
    padding: { 0: "overflow-hidden p-0", 16: "p-4", 18: "p-[18px]", 20: "p-5", 24: "p-6" },
    /** 14 (modulos, progresso), 16 (padrao), 18 (perfil, trilhas, certificados). */
    raio: { 14: "rounded-xl", 16: "rounded-2xl", 18: "rounded-[18px]" },
  },
  defaultVariants: { padding: 20, raio: 16 },
});

export interface CartaoProps extends ComponentProps<"div">, VariantProps<typeof cartaoVariants> {
  /** Elemento semantico: post da comunidade = article, lateral = aside. */
  como?: "div" | "article" | "section" | "aside";
}

/** Superficie padrao: borda + bg-surface + rounded-2xl. */
export function Cartao({ como: Tag = "div", padding, raio, className, ...props }: CartaoProps) {
  return <Tag className={cn(cartaoVariants({ padding, raio }), className)} {...props} />;
}

export interface CartaoTituloProps extends ComponentProps<"h2"> {
  /** 14 (laterais, construtor), 15 (dashboard), 16 (perfil). */
  tamanho?: 14 | 15 | 16;
  /** Nivel do heading; o visual nao muda. */
  como?: "h2" | "h3" | "div";
}

const TAMANHO_TITULO = { 14: "text-sm", 15: "text-[15px]", 16: "text-base" };

/** Titulo de cartao: sans 800 (nao serifado, apesar de ser h2/h3). */
export function CartaoTitulo({ tamanho = 14, como: Tag = "h3", className, ...props }: CartaoTituloProps) {
  return (
    <Tag
      className={cn("m-0 font-sans font-extrabold tracking-normal", TAMANHO_TITULO[tamanho], className)}
      {...props}
    />
  );
}
