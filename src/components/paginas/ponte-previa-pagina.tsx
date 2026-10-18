"use client";

import { useEffect } from "react";

/** Dentro do iframe da prévia: rola até o bloco que o editor selecionou (mensagem só da mesma origem). */
export function PontePreviaPagina() {
  useEffect(() => {
    const ir = (id: string) => document.querySelector(`[data-bloco="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "start" });
    const aoReceber = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const d = e.data as { tipo?: unknown; id?: unknown } | null;
      if (d && d.tipo === "pagina:selecionar" && typeof d.id === "string") ir(d.id);
    };
    window.addEventListener("message", aoReceber);
    const sel = new URLSearchParams(window.location.search).get("sel");
    if (sel) ir(sel);
    return () => window.removeEventListener("message", aoReceber);
  }, []);
  return null;
}
