"use client";

import { useEffect, useRef, useState } from "react";

const MOVER_MS = 20_000;
const POSICOES = ["left-[6%] top-[8%]", "right-[6%] top-[8%]", "left-[6%] bottom-[18%]", "right-[6%] bottom-[18%]", "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"];

/**
 * Marca d'água dinâmica (nome + e-mail de quem assiste) sobre o vídeo: muda de posição a cada
 * 20 s e volta sozinha se alguém a remover pelo DevTools (ARQUITETURA_VPS §7). Dissuasão, não DRM.
 */
export function MarcaDagua({ texto }: { texto: string }) {
  const [posicao, setPosicao] = useState(0);
  const [geracao, setGeracao] = useState(0);
  const el = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const id = setInterval(() => setPosicao((p) => (p + 1 + Math.floor(Math.random() * (POSICOES.length - 1))) % POSICOES.length), MOVER_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const pai = el.current?.parentElement;
    if (!pai) return;
    const vigia = new MutationObserver(() => {
      if (!el.current?.isConnected || el.current.style.display === "none" || el.current.style.visibility === "hidden") setGeracao((g) => g + 1);
    });
    vigia.observe(pai, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    return () => vigia.disconnect();
  }, [geracao]);

  return (
    <span
      key={geracao}
      ref={el}
      aria-hidden
      className={`pointer-events-none absolute z-[5] select-none text-xs font-semibold whitespace-nowrap text-fixo-text/35 transition-all duration-1000 motion-reduce:transition-none ${POSICOES[posicao]}`}
    >
      {texto}
    </span>
  );
}
