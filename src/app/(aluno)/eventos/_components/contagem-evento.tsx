"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { aberturaDoLink, textoDaContagem } from "@/lib/eventos/tela";

export interface ContagemEventoProps {
  /** ISO. */
  inicioEm: string;
  fimEm: string;
  className?: string;
}

/**
 * Contagem regressiva do encontro. Ao abrir a janela do link (15 min antes) e ao terminar, pede a
 * página de novo ao servidor: o link só chega por lá (RN-142), nunca vem escondido no HTML.
 */
export function ContagemEvento({ inicioEm, fimEm, className }: ContagemEventoProps) {
  const router = useRouter();
  const e = { inicioEm: new Date(inicioEm), fimEm: new Date(fimEm) };
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const marcos = [aberturaDoLink(new Date(inicioEm)).getTime(), Date.parse(fimEm)];
    let antes = Date.now();
    const id = setInterval(() => {
      const ja = Date.now();
      setAgora(new Date(ja));
      if (marcos.some((m) => antes < m && ja >= m)) router.refresh();
      antes = ja;
    }, 15_000);
    return () => clearInterval(id);
  }, [inicioEm, fimEm, router]);

  return (
    <span className={className} suppressHydrationWarning>
      {textoDaContagem(e, agora)}
    </span>
  );
}
