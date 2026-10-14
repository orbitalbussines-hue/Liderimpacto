"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatarTempo } from "@/lib/validators/catalogo";
import { cn } from "@/lib/utils";

export interface CapituloPlayer {
  inicioSeg: number;
  titulo: string;
}

export interface BarraTempoProps {
  tempo: number;
  duracao: number;
  /** Fim do trecho já carregado (s). */
  carregado: number;
  /** Marcadores de capítulo (vazio = sem marcadores). */
  capitulos: readonly CapituloPlayer[];
  onBuscar: (seg: number) => void;
}

/** Capítulo em que `seg` cai (o último cujo início já passou). */
export function capituloEm(capitulos: readonly CapituloPlayer[], seg: number): number {
  let atual = -1;
  capitulos.forEach((c, i) => {
    if (c.inicioSeg <= seg) atual = i;
  });
  return atual;
}

const fracao = (v: number, total: number) => (total > 0 ? Math.min(1, Math.max(0, v / total)) : 0);

/**
 * Barra de progresso do design (5 px, bolinha accent, marcadores de capítulo). `role="slider"`
 * com setas (±5 s), PageUp/PageDown (±10 s), Home/End; arrastar com ponteiro (mouse e toque),
 * com prévia do tempo e do capítulo sob o cursor. A área de toque tem 20 px de altura.
 */
export function BarraTempo({ tempo, duracao, carregado, capitulos, onBuscar }: BarraTempoProps) {
  const trilho = useRef<HTMLDivElement>(null);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);

  const segDoPonteiro = (e: PointerEvent) => {
    const r = trilho.current?.getBoundingClientRect();
    return r && r.width > 0 ? fracao(e.clientX - r.left, r.width) * duracao : 0;
  };

  const aoTeclar = (e: KeyboardEvent) => {
    const passos: Record<string, number> = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5, PageDown: -10, PageUp: 10 };
    let alvo: number | null = null;
    if (e.key in passos) alvo = tempo + passos[e.key];
    else if (e.key === "Home") alvo = 0;
    else if (e.key === "End") alvo = duracao;
    if (alvo === null) return;
    e.preventDefault();
    e.stopPropagation();
    onBuscar(Math.min(duracao, Math.max(0, alvo)));
  };

  const mostrado = arrastando ?? tempo;
  const previa = arrastando ?? sobre;
  const capituloPrevia = previa === null ? -1 : capituloEm(capitulos, previa);
  const capituloAtual = capituloEm(capitulos, tempo);
  const valorTexto = `${formatarTempo(tempo)} de ${formatarTempo(duracao)}${capituloAtual >= 0 ? `, ${capitulos[capituloAtual].titulo}` : ""}`;

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Posição do vídeo"
      aria-valuemin={0}
      aria-valuemax={Math.round(duracao)}
      aria-valuenow={Math.round(tempo)}
      aria-valuetext={valorTexto}
      onKeyDown={aoTeclar}
      onPointerDown={(e) => {
        if (duracao <= 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setArrastando(segDoPonteiro(e));
      }}
      onPointerMove={(e) => {
        if (duracao <= 0) return;
        if (arrastando !== null) setArrastando(segDoPonteiro(e));
        else if (e.pointerType === "mouse") setSobre(segDoPonteiro(e));
      }}
      onPointerUp={(e) => {
        if (arrastando === null) return;
        onBuscar(segDoPonteiro(e));
        setArrastando(null);
      }}
      onPointerCancel={() => setArrastando(null)}
      onPointerLeave={() => setSobre(null)}
      className="group/barra relative flex h-5 cursor-pointer touch-none items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-fixo-accent focus-visible:ring-offset-2 focus-visible:ring-offset-black/60"
    >
      <div ref={trilho} className="relative h-[5px] w-full rounded-full bg-white/25">
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${fracao(carregado, duracao) * 100}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-fixo-accent" style={{ width: `${fracao(mostrado, duracao) * 100}%` }} />
        {duracao > 0 &&
          capitulos
            .filter((c) => c.inicioSeg > 0 && c.inicioSeg < duracao)
            .map((c) => (
              <span
                key={`${c.inicioSeg}-${c.titulo}`}
                aria-hidden
                className="absolute -top-0.5 h-[9px] w-0.5 -translate-x-1/2 rounded-full bg-white/70"
                style={{ left: `${fracao(c.inicioSeg, duracao) * 100}%` }}
              />
            ))}
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 size-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fixo-accent shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-fixo-accent)_30%,transparent)] transition-transform duration-150 motion-reduce:transition-none",
            arrastando !== null && "scale-125",
          )}
          style={{ left: `${fracao(mostrado, duracao) * 100}%` }}
        />
      </div>
      {previa !== null && duracao > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full mb-2 max-w-[220px] -translate-x-1/2 truncate rounded-md bg-black/85 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-white"
          style={{ left: `clamp(40px, ${fracao(previa, duracao) * 100}%, calc(100% - 40px))` }}
        >
          {formatarTempo(previa)}
          {capituloPrevia >= 0 && <span className="font-medium text-white/75"> · {capitulos[capituloPrevia].titulo}</span>}
        </span>
      )}
    </div>
  );
}
