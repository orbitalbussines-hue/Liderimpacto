"use client";

import { Moon, Sun } from "lucide-react";
import { alterarTema } from "@/lib/actions/tema";
import { cn } from "@/lib/utils";
import type { Tema } from "@/lib/tema-constantes";
import { Button } from "./button";

export interface AlternarTemaProps {
  /** `icone`: botao quadrado 36px (headers). `texto`: "Escuro"/"Claro" 34px (Meu perfil > Preferencias). */
  variante?: "icone" | "texto";
  className?: string;
}

/**
 * Alterna escuro/claro: aplica `data-theme` no <html> na hora e grava o cookie
 * pela action em segundo plano. O icone/rotulo visivel sai do CSS (`dark:`),
 * nao do estado — o servidor nao sabe o tema e assim nao ha erro de hidratacao.
 */
export function AlternarTema({ variante = "icone", className }: AlternarTemaProps) {
  function alternar() {
    const raiz = document.documentElement;
    const novo: Tema = raiz.dataset.theme === "light" ? "dark" : "light";
    raiz.dataset.theme = novo;
    // ponytail: falha ao gravar o cookie so perde a preferencia no proximo acesso; a tela ja trocou.
    void alterarTema(novo);
  }

  if (variante === "texto") {
    return (
      <Button
        variant="secundario"
        size="36"
        onClick={alternar}
        className={cn("h-[34px] rounded-lg bg-surface-2 hover:bg-border", className)}
      >
        <span className="sr-only">Tema: </span>
        <span className="hidden dark:inline">Escuro</span>
        <span className="dark:hidden">Claro</span>
      </Button>
    );
  }

  return (
    <Button
      variant="fantasma"
      size="icone36"
      onClick={alternar}
      aria-label="Alternar tema escuro/claro"
      title="Alternar tema"
      className={className}
    >
      <Sun className="hidden dark:block" aria-hidden />
      <Moon className="dark:hidden" aria-hidden />
    </Button>
  );
}
