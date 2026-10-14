"use client";

import { useEffect } from "react";

/**
 * Ponte da prévia (dentro do <iframe> do construtor, MESMA origem). Mensagens só de/para
 * `window.parent` com a origem conferida (ADR-0010):
 * - recebe `{ tipo: "vitrine:selecionar", id }` → contorno no bloco `[data-bloco=id]` e rola até ele;
 * - envia `{ tipo: "vitrine:clique", id }` ao clicar num bloco e `{ tipo: "vitrine:altura", valor }`;
 * - links não navegam (a prévia é só para ver).
 */
export function PontePrevia({ selecionado }: { selecionado: string | null }) {
  useEffect(() => {
    const pai = window.parent;
    if (pai === window) return;
    const origem = window.location.origin;
    const enviar = (m: object) => pai.postMessage(m, origem);
    const marcar = (id: string | null, rolar: boolean) => {
      for (const el of document.querySelectorAll<HTMLElement>("[data-bloco]")) {
        const sel = el.dataset.bloco === id;
        el.toggleAttribute("data-selecionado", sel);
        if (sel && rolar) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    };
    marcar(selecionado, false);

    const aoReceber = (e: MessageEvent) => {
      if (e.origin !== origem || e.source !== pai) return;
      const d: unknown = e.data;
      if (d && typeof d === "object" && "tipo" in d && d.tipo === "vitrine:selecionar" && "id" in d && typeof d.id === "string") marcar(d.id, true);
    };
    const aoClicar = (e: MouseEvent) => {
      const alvo = e.target instanceof Element ? e.target : null;
      if (alvo?.closest("a[href]")) e.preventDefault();
      const bloco = alvo?.closest<HTMLElement>("[data-bloco]");
      if (bloco?.dataset.bloco) {
        marcar(bloco.dataset.bloco, false);
        enviar({ tipo: "vitrine:clique", id: bloco.dataset.bloco });
      }
    };
    // Altura do CONTEÚDO (não do documento: o shell tem min-height da janela e nunca encolheria).
    const raiz = document.querySelector("[data-vitrine]");
    const medir = () => raiz && enviar({ tipo: "vitrine:altura", valor: Math.ceil(raiz.getBoundingClientRect().bottom + window.scrollY) + 48 });
    const obs = new ResizeObserver(medir);
    if (raiz) obs.observe(raiz);
    medir();
    window.addEventListener("message", aoReceber);
    document.addEventListener("click", aoClicar, true);
    return () => {
      obs.disconnect();
      window.removeEventListener("message", aoReceber);
      document.removeEventListener("click", aoClicar, true);
    };
  }, [selecionado]);
  return null;
}
