"use client";

import { useEffect, useRef, useState } from "react";
import { INTERVALO_POLLING_MS } from "@/lib/notificacoes/regras";
import { ouvirLeitura } from "./leitura";

/**
 * Contador do sino: valor inicial do servidor + polling de `/api/notificacoes/contagem` SÓ com a
 * aba visível (volta a consultar ao reaparecer). 401 = sessão acabou: para de vez, sem loop.
 */
export function useContagemNaoLidas(inicial: number): number {
  const [n, setN] = useState(inicial);
  const parou = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const visivel = () => document.visibilityState === "visible";
    const parar = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const buscar = async () => {
      if (parou.current) return;
      try {
        const r = await fetch("/api/notificacoes/contagem", { cache: "no-store" });
        if (r.status === 401) {
          parou.current = true;
          parar();
        } else if (r.ok) {
          setN(((await r.json()) as { naoLidas: number }).naoLidas);
        }
      } catch {
        // rede caiu: a próxima volta tenta de novo
      }
    };
    const iniciar = () => {
      if (!timer && !parou.current) timer = setInterval(buscar, INTERVALO_POLLING_MS);
    };
    const aoMudarVisibilidade = () => {
      if (visivel()) {
        void buscar();
        iniciar();
      } else parar();
    };

    if (visivel()) iniciar();
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    const desligar = ouvirLeitura((d) => setN((atual) => ("zerar" in d ? 0 : Math.max(0, atual - d.menos))));
    return () => {
      parar();
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      desligar();
    };
  }, []);

  return n;
}
