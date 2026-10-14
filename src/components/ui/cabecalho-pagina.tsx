import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TITULO = {
  /** Paginas do aluno (Avaliacoes, Trilhas, Certificados, Continuar): 36px. */
  aluno: "text-4xl",
  /** Pagina do curso: 56px desktop / 38px celular. */
  curso: "text-[38px] desk:text-[56px]",
  /** Titulo da aula no player: 38px desktop / 28px celular. */
  aula: "text-[28px] desk:text-[38px]",
  /** Construtor da vitrine: 32px. */
  adminDestaque: "text-[32px]",
  /** Dashboard e paginas de cards do admin: 24px. */
  admin: "text-2xl",
  /** Cabecalho dentro do cartao de tabela do admin: 20px. */
  adminTabela: "text-xl",
} as const;

const DESCRICAO = {
  aluno: "text-sm",
  curso: "max-w-[640px] text-[15px] leading-relaxed",
  aula: "text-sm",
  adminDestaque: "text-sm",
  admin: "text-sm",
  adminTabela: "text-sm",
} as const;

export interface CabecalhoPaginaProps {
  titulo: ReactNode;
  variante?: keyof typeof TITULO;
  /** Linha acima do titulo: 12px/700, maiusculas, accent. */
  eyebrow?: ReactNode;
  /** Pilula surface-2 ao lado do titulo ("Continuar aprendendo 2"). */
  contador?: ReactNode;
  /** Texto 12px muted na linha do titulo ("139 total · 137 ativos"). */
  meta?: ReactNode;
  descricao?: ReactNode;
  /** Botoes a direita; quebram para baixo do titulo no celular. */
  acoes?: ReactNode;
  /** Nivel do heading (h1 por padrao; h2 quando a pagina ja tem h1). */
  como?: "h1" | "h2";
  className?: string;
}

/**
 * Cabecalho de pagina. O titulo herda o estilo global de h1/h2 (Newsreader 600,
 * tracking -.015em) — no prototipo os titulos do admin tambem saem serifados.
 */
export function CabecalhoPagina({
  titulo,
  variante = "aluno",
  eyebrow,
  contador,
  meta,
  descricao,
  acoes,
  como: Tag = "h1",
  className,
}: CabecalhoPaginaProps) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 text-xs font-bold tracking-[.12em] text-accent uppercase">{eyebrow}</div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Tag className={cn("m-0 leading-[1.08]", TITULO[variante])}>{titulo}</Tag>
          {contador !== undefined && (
            <span className="rounded-full bg-surface-2 px-[9px] py-[3px] text-xs font-bold text-muted">
              {contador}
            </span>
          )}
          {meta && <span className="text-xs text-muted">{meta}</span>}
        </div>
        {descricao && (
          <p className={cn("m-0 mt-2 text-muted", variante === "curso" && "mt-3", DESCRICAO[variante])}>
            {descricao}
          </p>
        )}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2.5">{acoes}</div>}
    </header>
  );
}
