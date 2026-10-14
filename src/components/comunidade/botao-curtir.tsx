"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { acaoCurtir } from "@/lib/actions/comunidade";
import { cn } from "@/lib/utils";
import { contagem } from "./formatos";

export interface BotaoCurtirProps {
  alvo: { postId: string } | { comentarioId: string };
  curtiu: boolean;
  curtidas: number;
  /** Sem vínculo (SUPER_ADMIN) só vê o número. */
  desabilitado?: boolean;
  /** Comentário: só o número, mais compacto. */
  compacto?: boolean;
}

/**
 * Curtir OTIMISTA: muda na hora, confirma com o servidor (que devolve o estado e o contador
 * reais) e volta ao estado anterior se a action recusar ou a rede cair.
 */
export function BotaoCurtir({ alvo, curtiu: curtiuInicial, curtidas: curtidasIniciais, desabilitado, compacto }: BotaoCurtirProps) {
  const [estado, setEstado] = useState({ curtiu: curtiuInicial, curtidas: curtidasIniciais });
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");

  const alternar = async () => {
    if (enviando) return;
    const antes = estado;
    setEstado({ curtiu: !antes.curtiu, curtidas: Math.max(0, antes.curtidas + (antes.curtiu ? -1 : 1)) });
    setAviso("");
    setEnviando(true);
    const r = await acaoCurtir(alvo).catch(() => null);
    setEnviando(false);
    if (r?.ok) return setEstado({ curtiu: r.dados.curtiu, curtidas: r.dados.curtidas });
    setEstado(antes);
    setAviso(r ? r.erro : "Sem conexão. A curtida não foi salva.");
  };

  const texto = compacto ? String(estado.curtidas) : contagem(estado.curtidas, "curtida", "curtidas");
  return (
    <>
      <button
        type="button"
        onClick={() => void alternar()}
        disabled={desabilitado}
        aria-pressed={estado.curtiu}
        aria-label={`${estado.curtiu ? "Descurtir" : "Curtir"} (${contagem(estado.curtidas, "curtida", "curtidas")})`}
        className={cn(
          "-mx-1.5 inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-1.5 transition-colors duration-150 hover:text-text disabled:cursor-default disabled:hover:text-inherit",
          estado.curtiu && "text-accent hover:text-accent",
        )}
      >
        <Heart aria-hidden className={cn("size-[15px]", estado.curtiu && "fill-current")} />
        <span aria-hidden>{texto}</span>
      </button>
      <span role="status" className={aviso ? "text-xs text-warn" : "sr-only"}>
        {aviso}
      </span>
    </>
  );
}
