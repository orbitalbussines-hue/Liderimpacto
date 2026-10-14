"use client";

import { useRef, useState } from "react";
import type { Resultado } from "@/lib/acao";
import { MarcaDagua } from "./marca-dagua";
import { useHls, type AcessoHls } from "./use-hls";

export { comTokenAtual, type AcessoHls } from "./use-hls";

export interface PlayerHlsProps {
  acesso: AcessoHls;
  /** Novo token para a MESMA sessão de reprodução (chamado a cada ~4 min). */
  renovar: () => Promise<Resultado<{ token: string }>>;
  /** Nome acessível do vídeo. */
  titulo: string;
  poster?: string | null;
  /** Marca d'água (nome + e-mail de quem assiste), em posição que muda sozinha. */
  marcaDagua?: string;
  autoPlay?: boolean;
}

/**
 * Player HLS mínimo com os controles nativos (prévia do editor da aula). O player do aluno, com o
 * visual do design, é `src/components/player/player-aula.tsx`; os dois usam o mesmo `useHls`.
 */
export function PlayerHls({ acesso, renovar, titulo, poster, marcaDagua, autoPlay = false }: PlayerHlsProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  useHls(video, acesso, renovar, (e) => setErro(e.mensagem));

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-xl bg-fixo-bg">
        <video
          ref={video}
          className="aspect-video w-full"
          controls
          playsInline
          autoPlay={autoPlay}
          preload="metadata"
          poster={poster ?? undefined}
          aria-label={titulo}
          controlsList="nodownload"
          onContextMenu={(e) => e.preventDefault()}
        />
        {marcaDagua && <MarcaDagua texto={marcaDagua} />}
      </div>
      {erro && (
        <p role="alert" className="m-0 text-xs font-semibold text-warn">
          {erro}
        </p>
      )}
    </div>
  );
}
