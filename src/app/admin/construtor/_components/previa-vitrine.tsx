"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type Dispositivo = "desktop" | "mobile";

const LARGURA: Record<Dispositivo, number> = { desktop: 1440, mobile: 390 };
const ALTURA_MOBILE = 844;

interface Quadro {
  src: string;
  pronto: boolean;
}

/**
 * Prévia AO VIVO (ADR-0010): a vitrine real (`/previa-vitrine`, rascunho) num <iframe> da MESMA
 * origem, em 1440 px escalada à coluna (altura inteira) ou 390×844 (moldura de celular, rola
 * dentro). Depois de cada autosave a `versao` muda: um quadro novo carrega escondido e só então
 * substitui o anterior (sem piscar). Seleção vai e volta por `postMessage` com a origem conferida.
 */
export function PreviaVitrine({ versao, selecionado, dispositivo, onSelecionar }: { versao: string | null; selecionado: string; dispositivo: Dispositivo; onSelecionar: (id: string) => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const quadros = useRef(new Map<string, HTMLIFrameElement>());
  const selRef = useRef(selecionado);
  const [largura, setLargura] = useState(0);
  const [altura, setAltura] = useState(900);
  const [lista, setLista] = useState<Quadro[]>(() => [{ src: endereco(versao, selecionado), pronto: false }]);

  function endereco(v: string | null, sel: string) {
    return `/previa-vitrine?v=${encodeURIComponent(v ?? "padrao")}&sel=${encodeURIComponent(sel)}`;
  }

  // Versão nova = quadro novo carregando por trás do atual.
  useEffect(() => {
    const src = endereco(versao, selRef.current);
    setLista((l) => (l.some((q) => q.src === src) ? l : [...l.filter((q) => q.pronto).slice(-1), { src, pronto: false }]));
  }, [versao]);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Mensagens SÓ dos nossos quadros e da nossa origem.
  useEffect(() => {
    const aoReceber = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const deQuadro = [...quadros.current.values()].some((f) => f.contentWindow === e.source);
      if (!deQuadro || !e.data || typeof e.data !== "object") return;
      const d = e.data as { tipo?: unknown; id?: unknown; valor?: unknown };
      if (d.tipo === "vitrine:clique" && typeof d.id === "string") onSelecionar(d.id);
      if (d.tipo === "vitrine:altura" && typeof d.valor === "number" && d.valor > 0) setAltura(Math.min(d.valor, 20000));
    };
    window.addEventListener("message", aoReceber);
    return () => window.removeEventListener("message", aoReceber);
  }, [onSelecionar]);

  // Seleção do construtor → contorno e rolagem no quadro visível.
  useEffect(() => {
    selRef.current = selecionado;
    for (const f of quadros.current.values()) f.contentWindow?.postMessage({ tipo: "vitrine:selecionar", id: selecionado }, window.location.origin);
  }, [selecionado]);

  const aoCarregar = (src: string) => {
    setLista((l) => {
      const i = l.findIndex((q) => q.src === src);
      return i < 0 ? l : [{ ...l[i], pronto: true }, ...l.slice(i + 1)];
    });
    quadros.current.get(src)?.contentWindow?.postMessage({ tipo: "vitrine:selecionar", id: selRef.current }, window.location.origin);
  };

  const base = LARGURA[dispositivo];
  const mobile = dispositivo === "mobile";
  const escala = largura ? Math.min(1, (largura - (mobile ? 24 : 0)) / base) : 0;
  const alturaQuadro = mobile ? ALTURA_MOBILE : altura;
  const visivel = [...lista].reverse().find((q) => q.pronto) ?? lista[0];

  return (
    <div ref={caixa} className="w-full min-w-0">
      <div
        className={cn("relative mx-auto overflow-hidden bg-bg", mobile ? "rounded-[34px] border-[6px] border-surface shadow-card" : "rounded-xl border border-border")}
        style={{ width: base * escala + (mobile ? 12 : 0), height: alturaQuadro * escala + (mobile ? 12 : 0) }}
        aria-busy={!visivel.pronto}
      >
        {lista.map((q) => (
          <iframe
            key={q.src}
            ref={(f) => {
              if (f) quadros.current.set(q.src, f);
              else quadros.current.delete(q.src);
            }}
            src={q.src}
            title="Prévia da vitrine (rascunho)"
            tabIndex={q === visivel ? 0 : -1}
            aria-hidden={q !== visivel}
            onLoad={() => aoCarregar(q.src)}
            className={cn("absolute top-0 left-0 origin-top-left border-0", q !== visivel && "pointer-events-none invisible")}
            style={{ width: base, height: alturaQuadro, transform: `scale(${escala})` }}
          />
        ))}
      </div>
    </div>
  );
}
