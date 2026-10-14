"use client";

import { useEffect, useRef } from "react";
import { RotateCcw, SkipForward } from "lucide-react";
import { useContagem } from "./use-contagem";

export interface FimDaAulaProps {
  proxima: { numero: string; titulo: string };
  /** Segundos da reprodução automática; nulo = sem contagem (preferência desligada ou cancelada). */
  contagem: number | null;
  onIr: () => void;
  onRever: () => void;
}

/**
 * Cartão do fim da aula sobre o vídeo. Com reprodução automática: "Próxima aula em 5s" com
 * Cancelar (o foco vai para ele; a contagem é anunciada uma vez, não a cada segundo).
 */
export function FimDaAula({ proxima, contagem, onIr, onRever }: FimDaAulaProps) {
  const { restante, iniciar, cancelar } = useContagem(contagem ?? 0, onIr);
  const botaoCancelar = useRef<HTMLButtonElement>(null);
  const contando = restante !== null;

  useEffect(() => {
    if (contagem === null) return;
    iniciar();
    return cancelar;
  }, [contagem, iniciar, cancelar]);

  // O Cancelar só existe depois que a contagem começa: foca nele aí (Enter/Espaço cancela).
  useEffect(() => {
    if (contando) botaoCancelar.current?.focus({ preventScroll: true });
  }, [contando]);

  return (
    <div className="absolute inset-0 z-[15] grid place-items-center bg-black/65 p-4 backdrop-blur-[2px]">
      <div className="flex w-full max-w-[380px] flex-col gap-3 rounded-2xl border border-white/10 bg-fixo-bg/90 p-4 text-left shadow-card desk:p-5">
        <div className="text-[11px] font-bold tracking-[.12em] text-fixo-accent uppercase">
          {contando ? (
            <>
              Próxima aula em <span className="tabular-nums">{restante}s</span>
            </>
          ) : (
            "Próxima aula"
          )}
        </div>
        <p className="sr-only" role="status">
          {contando ? `Próxima aula em ${contagem} segundos. Use Cancelar para ficar nesta aula.` : ""}
        </p>
        <p className="m-0 text-[15px] leading-snug font-bold text-fixo-text">
          <span className="text-fixo-muted">Aula {proxima.numero} · </span>
          {proxima.titulo}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onIr}
            className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] bg-fixo-accent px-4 text-[13px] font-bold text-fixo-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <SkipForward aria-hidden className="size-4" />
            Assistir agora
          </button>
          {contando ? (
            <button
              ref={botaoCancelar}
              type="button"
              onClick={cancelar}
              className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-[9px] border border-white/25 px-4 text-[13px] font-semibold text-fixo-text hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Cancelar
            </button>
          ) : (
            <button
              type="button"
              onClick={onRever}
              className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-white/25 px-4 text-[13px] font-semibold text-fixo-text hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <RotateCcw aria-hidden className="size-4" />
              Rever a aula
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
