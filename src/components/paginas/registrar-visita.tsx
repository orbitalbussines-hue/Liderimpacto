"use client";

import { useEffect, useRef } from "react";

/** Conta 1 visita ao abrir a página (beacon; sem cookie). Prefetch e robô sem JS não contam. */
export function RegistrarVisita({ paginaId, funilId }: { paginaId: string; funilId: string | null }) {
  const feito = useRef(false);
  useEffect(() => {
    // O efeito roda duas vezes no modo estrito do dev: a ref segura a segunda.
    if (feito.current) return;
    feito.current = true;
    const corpo = JSON.stringify({ p: paginaId, f: funilId });
    if (!navigator.sendBeacon?.("/api/paginas/visita", new Blob([corpo], { type: "application/json" })))
      void fetch("/api/paginas/visita", { method: "POST", body: corpo, keepalive: true }).catch(() => undefined);
  }, [paginaId, funilId]);
  return null;
}
