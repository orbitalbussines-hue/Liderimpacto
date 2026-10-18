"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispositivo } from "@/app/admin/construtor/_components/previa-vitrine";
import { cn } from "@/lib/utils";

const LARGURA: Record<Dispositivo, number> = { desktop: 1440, mobile: 390 };
const ALTURA: Record<Dispositivo, number> = { desktop: 1100, mobile: 844 };

/**
 * Prévia AO VIVO do rascunho (`/previa-pagina/<id>`, mesma origem) num <iframe> escalado à coluna: 1440
 * ou 390×844 (rola dentro). Depois de cada autosave a `versao` muda e o quadro recarrega; a seleção do
 * editor rola o quadro até o bloco (postMessage com a origem conferida do lado de lá).
 */
export function PreviaPagina({ paginaId, versao, selecionado, dispositivo }: { paginaId: string; versao: string; selecionado: string; dispositivo: Dispositivo }) {
  const caixa = useRef<HTMLDivElement>(null);
  const quadro = useRef<HTMLIFrameElement>(null);
  const [largura, setLargura] = useState(0);
  const [carregando, setCarregando] = useState(true);
  // Recarga = versão nova; o bloco selecionado NAQUELE momento vai na URL (o quadro já abre nele).
  const [carga, setCarga] = useState({ versao, sel: selecionado });
  if (carga.versao !== versao) setCarga({ versao, sel: selecionado });
  const src = `/previa-pagina/${paginaId}?v=${encodeURIComponent(carga.versao)}&sel=${encodeURIComponent(carga.sel)}`;

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (selecionado !== "pagina") quadro.current?.contentWindow?.postMessage({ tipo: "pagina:selecionar", id: selecionado }, window.location.origin);
  }, [selecionado]);

  const base = LARGURA[dispositivo];
  const mobile = dispositivo === "mobile";
  const escala = largura ? Math.min(1, (largura - (mobile ? 24 : 0)) / base) : 0;
  return (
    <div ref={caixa} className="w-full min-w-0">
      <div
        className={cn("relative mx-auto overflow-hidden bg-bg", mobile ? "rounded-[34px] border-[6px] border-surface shadow-card" : "rounded-xl border border-border")}
        style={{ width: base * escala + (mobile ? 12 : 0), height: ALTURA[dispositivo] * escala + (mobile ? 12 : 0) }}
        aria-busy={carregando}
      >
        <iframe
          ref={quadro}
          key={src}
          src={src}
          title="Prévia da página (rascunho)"
          onLoad={() => setCarregando(false)}
          className="absolute top-0 left-0 origin-top-left border-0"
          style={{ width: base, height: ALTURA[dispositivo], transform: `scale(${escala})` }}
        />
      </div>
    </div>
  );
}
