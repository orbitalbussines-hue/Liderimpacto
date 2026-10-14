"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OpcaoMenu<T> {
  valor: T;
  rotulo: string;
}

export interface MenuPlayerProps<T> {
  /** Rótulo acessível do botão ("Velocidade: 1.0x"). */
  rotulo: string;
  /** Conteúdo visível do botão. */
  gatilho: ReactNode;
  titulo: string;
  opcoes: readonly OpcaoMenu<T>[];
  valor: T;
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  onEscolher: (valor: T) => void;
  className?: string;
}

/**
 * Menu do player (velocidade, qualidade): popover DENTRO do container do vídeo (continua visível
 * em tela cheia, onde um portal sumiria). `menuitemradio`, setas/Home/End, Esc fecha e devolve o
 * foco ao botão, clique fora fecha.
 */
export function MenuPlayer<T extends string | number>({ rotulo, gatilho, titulo, opcoes, valor, aberto, onAbrir, onEscolher, className }: MenuPlayerProps<T>) {
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    raiz.current?.querySelector<HTMLElement>("[aria-checked=true]")?.focus();
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) onAbrir(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto, onAbrir]);

  const fechar = () => {
    onAbrir(false);
    botao.current?.focus();
  };

  const aoTeclar = (e: KeyboardEvent) => {
    const itens = [...(raiz.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
    const i = itens.indexOf(document.activeElement as HTMLElement);
    const ir = (n: number) => itens[(n + itens.length) % itens.length]?.focus();
    const mapa: Record<string, () => void> = { ArrowDown: () => ir(i + 1), ArrowUp: () => ir(i - 1), Home: () => ir(0), End: () => ir(itens.length - 1), Escape: fechar, Tab: () => onAbrir(false) };
    if (!mapa[e.key]) return;
    if (e.key !== "Tab") e.preventDefault();
    e.stopPropagation();
    mapa[e.key]();
  };

  return (
    <div ref={raiz} className={cn("relative", className)}>
      <button
        ref={botao}
        type="button"
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        onClick={() => onAbrir(!aberto)}
        className="grid h-11 min-w-11 cursor-pointer place-items-center rounded-lg px-1 text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-fixo-accent"
      >
        {gatilho}
      </button>
      {aberto && (
        <div
          id={id}
          role="menu"
          aria-label={titulo}
          onKeyDown={aoTeclar}
          className="absolute right-0 bottom-full z-20 mb-2 flex min-w-[148px] flex-col rounded-xl border border-white/10 bg-fixo-bg/95 p-1.5 text-[13px] text-white shadow-card backdrop-blur-md"
        >
          <div className="px-2.5 pt-1 pb-1.5 text-[11px] font-bold tracking-[.1em] text-white/55 uppercase">{titulo}</div>
          {opcoes.map((o) => (
            <button
              key={String(o.valor)}
              type="button"
              role="menuitemradio"
              aria-checked={o.valor === valor}
              tabIndex={o.valor === valor ? 0 : -1}
              onClick={() => {
                onEscolher(o.valor);
                fechar();
              }}
              className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 text-left font-semibold hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
            >
              <Check aria-hidden className={cn("size-3.5 text-fixo-accent", o.valor !== valor && "invisible")} />
              {o.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
