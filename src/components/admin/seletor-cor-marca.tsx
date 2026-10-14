"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Campo } from "@/components/ui/campo";
import { gerarPaleta, validarHex } from "@/lib/marca/paleta";
import { PREDEFINICOES_MARCA } from "@/lib/marca/predefinicoes";

export interface SeletorCorMarcaProps {
  /** Hex válido e normalizado (#rrggbb). */
  cor: string;
  /** Só recebe hex válido. */
  onMudar: (hex: string) => void;
  /** Texto do campo Hex válido ou não (para travar o Salvar de quem usa). */
  onValidade?: (valido: boolean) => void;
}

/**
 * Seletor da cor da marca (Aparência do criador e cor própria do curso): seletor nativo, campo
 * Hex, as 4 cores prontas e o aviso quando `gerarPaleta` ajusta a cor para manter o contraste.
 */
export function SeletorCorMarca({ cor, onMudar, onValidade }: SeletorCorMarcaProps) {
  const [texto, setTexto] = useState(cor);
  const [ultimaCor, setUltimaCor] = useState(cor);
  // Cor trocada por fora (Voltar ao padrão): o campo Hex acompanha.
  if (cor !== ultimaCor) {
    setUltimaCor(cor);
    setTexto(cor);
  }
  const escolher = (valor: string) => {
    setTexto(valor);
    const hex = validarHex(valor);
    onValidade?.(hex !== null);
    if (hex) onMudar(hex);
  };
  const paleta = gerarPaleta(cor);
  const ajustada = paleta.dark["--accent"] !== cor || paleta.light["--accent"] !== cor;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          Seletor
          <input
            type="color"
            value={cor}
            onChange={(e) => escolher(e.target.value)}
            className="h-11 w-14 cursor-pointer rounded-lg border border-border bg-surface p-1"
          />
        </label>
        <Campo
          rotulo="Hex"
          value={texto}
          onChange={(e) => escolher(e.target.value.trim())}
          maxLength={7}
          spellCheck={false}
          classNameMoldura="flex-1"
          className="font-mono"
          erro={validarHex(texto) === null ? "Use #RGB ou #RRGGBB." : undefined}
        />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Cores prontas">
        {PREDEFINICOES_MARCA.map((p) => {
          const hex = validarHex(p.cor)!;
          return (
            <button
              key={p.cor}
              type="button"
              onClick={() => escolher(hex)}
              aria-pressed={cor === hex}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors",
                cor === hex ? "border-text" : "border-border hover:bg-surface-2"
              )}
            >
              {/* Cor de exemplo: valor dinamico, unico estilo inline permitido. */}
              <span className="size-3.5 rounded-full" style={{ background: hex }} aria-hidden />
              {p.nome}
            </button>
          );
        })}
      </div>
      {ajustada && (
        <p className="m-0 rounded-lg border border-border bg-surface-2 p-3 text-[13px]" role="status">
          Ajustamos a cor para manter a leitura: tema escuro <b className="font-mono">{paleta.dark["--accent"]}</b>, tema claro{" "}
          <b className="font-mono">{paleta.light["--accent"]}</b>.
        </p>
      )}
    </div>
  );
}
