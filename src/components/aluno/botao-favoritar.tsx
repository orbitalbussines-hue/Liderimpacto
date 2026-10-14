"use client";

import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acaoDesfavoritar, acaoFavoritar } from "@/lib/actions/favoritos";

export interface BotaoFavoritarProps {
  /** Curso OU aula. */
  alvo: { produtoId: string } | { aulaId: string };
  favoritoInicial: boolean;
  className?: string;
}

/**
 * "Minha lista": troca o estado NA HORA (otimista) e grava pela action; se a action recusar,
 * volta ao estado anterior e mostra o motivo. `aria-pressed` diz se está na lista.
 */
export function BotaoFavoritar({ alvo, favoritoInicial, className }: BotaoFavoritarProps) {
  const [favorito, setFavorito] = useState(favoritoInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function alternar() {
    const anterior = favorito;
    setFavorito(!anterior);
    setErro(null);
    iniciar(async () => {
      const r = anterior ? await acaoDesfavoritar(alvo) : await acaoFavoritar(alvo);
      if (!r.ok) {
        setFavorito(anterior);
        setErro(r.erro);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button variant="contorno" size="42" aria-pressed={favorito} aria-busy={pendente || undefined} onClick={alternar} className={className}>
        {favorito ? <Check aria-hidden /> : <Plus aria-hidden />}
        {favorito ? "Na minha lista" : "Minha lista"}
      </Button>
      {erro && (
        <p role="alert" className="m-0 text-xs text-warn">
          {erro}
        </p>
      )}
    </div>
  );
}
