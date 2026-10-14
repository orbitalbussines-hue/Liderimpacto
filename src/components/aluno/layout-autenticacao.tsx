import type { ReactNode } from "react";
import { AlternarTema } from "@/components/ui/alternar-tema";
import { cn } from "@/lib/utils";
import { CenaAutenticacao } from "./cena-autenticacao";

export interface LayoutAutenticacaoProps {
  /** `criador` (padrao): luz na cor da marca. `plataforma` (apex): identidade neutra. */
  variante?: "criador" | "plataforma";
  /** Selo discreto acima do titulo (sentence case, so no desktop). */
  eyebrow?: string;
  titulo?: string;
  subtitulo?: string;
  rodape?: string;
  /**
   * Foto de login do criador. O banco ainda nao tem a coluna: quando ela existir, passe a URL
   * aqui (URL remota exige `images.remotePatterns` no next.config). Sem foto: cena em CSS.
   */
  imagemUrl?: string | null;
  /** Formulario: vai na coluna de 380px (segue o tema). */
  children: ReactNode;
  className?: string;
}

/**
 * Casca das telas de entrada. Desktop: cena escura (painel arredondado) a esquerda e coluna
 * do formulario a direita. Celular: cena vira faixa no topo e o formulario sobe como folha.
 */
export function LayoutAutenticacao({
  variante = "criador",
  eyebrow = "Área de membros",
  titulo = "Sua jornada continua aqui.",
  subtitulo = "Aulas, trilhas e certificados em um só lugar, do ponto em que você parou.",
  rodape = "Área de membros",
  imagemUrl,
  children,
  className,
}: LayoutAutenticacaoProps) {
  return (
    <div
      data-area="aluno"
      className={cn(
        "flex min-h-dvh flex-col bg-bg text-text desk:grid desk:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]",
        className
      )}
    >
      <CenaAutenticacao
        variante={variante}
        eyebrow={eyebrow}
        titulo={titulo}
        subtitulo={subtitulo}
        rodape={rodape}
        imagemUrl={imagemUrl}
      />
      <main className="relative z-10 -mt-6 flex flex-1 flex-col rounded-t-[22px] border-t border-border bg-bg desk:mt-0 desk:rounded-none desk:border-t-0">
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 hidden h-96 bg-radial-[60%_100%_at_50%_0%] to-transparent desk:block",
            variante === "plataforma" ? "from-muted/10" : "from-accent-soft"
          )}
        />
        <div className="relative hidden justify-end px-6 pt-5 desk:flex">
          <AlternarTema />
        </div>
        <div className="relative flex flex-1 justify-center px-5 pt-8 pb-10 desk:items-center desk:px-10 desk:pt-0 desk:pb-[72px]">
          <div className="w-full max-w-[380px] animate-in duration-500 fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
