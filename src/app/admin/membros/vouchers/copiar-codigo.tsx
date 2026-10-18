"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Código do voucher (grupos de 4) + botão Copiar (o aluno pode digitar com o hífen). */
export function CopiarCodigo({ codigo, grande = false }: { codigo: string; grande?: boolean }) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "falhou">("parado");
  const formatado = codigo;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(formatado);
      setEstado("copiado");
    } catch {
      setEstado("falhou");
    }
    setTimeout(() => setEstado("parado"), 2000);
  };
  return (
    <span className="inline-flex items-center gap-1">
      <span className={grande ? "font-mono text-lg font-bold tracking-[.06em]" : "font-mono text-[13px] font-bold tracking-[.04em]"}>{formatado}</span>
      <Button variant="fantasma" size="icone36" aria-label={`Copiar código ${formatado}`} onClick={copiar} className="text-muted">
        {estado === "copiado" ? <Check className="text-ok" aria-hidden /> : <Copy aria-hidden />}
      </Button>
      <span role="status" className="sr-only">
        {estado === "copiado" ? "Código copiado" : estado === "falhou" ? "Não foi possível copiar" : ""}
      </span>
    </span>
  );
}
