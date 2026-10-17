import { cn } from "@/lib/utils";

export interface LogoProps {
  /**
   * `cabecalho`: header do aluno (Newsreader 700 20px, "LÍDER" accent + " DE IMPACTO").
   * `bloco`: "LÍDER DE / IMPACTO" em duas linhas, 800 (login no celular, sidebar).
   * `fixo`: o bloco sobre fundo sempre escuro (painel esquerdo do login).
   */
  variante?: "cabecalho" | "bloco" | "fixo";
  /** So para bloco/fixo: 13px (login) ou 10px (sidebar). */
  tamanho?: 13 | 10;
  className?: string;
}

/**
 * Logotipo PROVISORIO em texto (o oficial ainda nao chegou; sem o monograma "LI",
 * a pedido do cliente). Quando chegar a imagem, troque SO este arquivo.
 */
export function Logo({ variante = "cabecalho", tamanho = 13, className }: LogoProps) {
  if (variante === "cabecalho") {
    return (
      <span
        className={cn(
          "font-serif text-xl leading-none font-bold tracking-[.04em] whitespace-nowrap text-accent",
          className
        )}
      >
        <span aria-hidden className="inline-block">
          {/* Em duas linhas até 1280px: com o "DE" o nome não cabe ao lado do menu e dos ícones. */}
          LÍDER<span className="text-text"> DE<br className="xl:hidden" /> IMPACTO</span>
        </span>
        <span className="sr-only">Líder de Impacto</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-block leading-[1.05] font-extrabold tracking-[.06em]",
        tamanho === 13 ? "text-[13px]" : "text-[10px]",
        variante === "fixo" ? "text-fixo-text" : "text-text",
        className
      )}
    >
      LÍDER DE
      <br />
      IMPACTO
    </span>
  );
}
