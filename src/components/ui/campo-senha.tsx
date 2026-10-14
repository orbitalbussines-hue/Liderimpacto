"use client";

import { useState, type KeyboardEvent } from "react";
import { ArrowBigUp, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Campo, type CampoProps } from "./campo";

export type CampoSenhaProps = Omit<CampoProps, "type" | "sufixo">;

/**
 * Campo de senha: botao mostrar/ocultar (aria-pressed) e aviso de Caps Lock ligado.
 * Aceita tudo do Campo (rotulo, tamanho, icone, erro, autoComplete...).
 */
export function CampoSenha({ ajuda, onKeyDown, onKeyUp, onBlur, className, ...props }: CampoSenhaProps) {
  const [visivel, setVisivel] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const lerCapsLock = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.("CapsLock") ?? false);

  return (
    <Campo
      {...props}
      type={visivel ? "text" : "password"}
      className={cn("pr-14", className)}
      onKeyDown={(e) => {
        lerCapsLock(e);
        onKeyDown?.(e);
      }}
      onKeyUp={(e) => {
        lerCapsLock(e);
        onKeyUp?.(e);
      }}
      onBlur={(e) => {
        setCapsLock(false);
        onBlur?.(e);
      }}
      ajuda={
        capsLock ? (
          <span className="inline-flex items-center gap-1 font-semibold text-text">
            <ArrowBigUp className="size-3.5" aria-hidden />
            Caps Lock está ativado.
          </span>
        ) : (
          ajuda
        )
      }
      sufixo={
        <Button
          type="button"
          variant="fantasma"
          size="icone44"
          aria-label="Mostrar senha"
          aria-pressed={visivel}
          onClick={() => setVisivel((v) => !v)}
          className="-mr-1.5 text-muted hover:bg-transparent hover:text-text [&_svg:not([class*='size-'])]:size-[18px]"
        >
          {visivel ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      }
    />
  );
}
