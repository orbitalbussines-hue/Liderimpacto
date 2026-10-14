"use client";

import { useState, type ReactNode } from "react";
import { PALETA_PADRAO, cssDaMarca, gerarPaleta } from "@/lib/marca/paleta";
import { PREDEFINICOES_MARCA } from "@/lib/marca/predefinicoes";
import { cn } from "@/lib/utils";

const PREDEFINICOES = PREDEFINICOES_MARCA;

/**
 * Previa ao vivo da cor da marca: gera a paleta no cliente e aplica num wrapper
 * `data-marca-previa` (o mesmo CSS que a EstiloMarca injeta na area do aluno).
 */
export function CorDaMarca({ children }: { children: ReactNode }) {
  const [cor, setCor] = useState(PALETA_PADRAO.toLowerCase());
  const paleta = gerarPaleta(cor);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-11 items-center gap-2.5 text-[13px] font-semibold">
          Cor da marca
          <input
            type="color"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded-md border border-border bg-surface p-1"
          />
        </label>
        {PREDEFINICOES.map((p) => (
          <button
            key={p.cor}
            type="button"
            onClick={() => setCor(p.cor.toLowerCase())}
            aria-pressed={cor === p.cor.toLowerCase()}
            className={cn(
              "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors",
              cor === p.cor.toLowerCase() ? "border-text" : "border-border hover:bg-surface-2"
            )}
          >
            {/* Cor de exemplo: valor dinamico, unico estilo inline permitido. */}
            <span className="size-3.5 rounded-full" style={{ background: p.cor }} aria-hidden />
            {p.nome}
          </button>
        ))}
      </div>
      <p className="m-0 font-mono text-xs text-muted">
        escuro {paleta.dark["--accent"]} / tinta {paleta.dark["--accent-ink"]} · claro {paleta.light["--accent"]} /
        tinta {paleta.light["--accent-ink"]}
      </p>
      <style>{cssDaMarca(cor, "[data-marca-previa]")}</style>
      <div data-marca-previa className="rounded-2xl border border-dashed border-border p-5">
        {children}
      </div>
    </div>
  );
}
