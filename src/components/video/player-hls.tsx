"use client";

import { useEffect, useRef, useState } from "react";
import type { Resultado } from "@/lib/acao";

export interface AcessoHls {
  /** Master assinada (`...master.m3u8?t=...`). */
  urlMaster: string;
  token: string;
}

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

const RENOVAR_MS = 4 * 60_000;
const MOVER_MARCA_MS = 20_000;
const POSICOES = ["left-[6%] top-[8%]", "right-[6%] top-[8%]", "left-[6%] bottom-[14%]", "right-[6%] bottom-[14%]", "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"];

/** Troca o `t=` da URL pelo token atual (playlist VOD carregada uma vez guarda o token antigo). */
export function comTokenAtual(url: string, token: string, base: string): string {
  const u = new URL(url, base);
  if (u.searchParams.has("t")) u.searchParams.set("t", token);
  return u.toString();
}

/**
 * Player HLS mínimo e reaproveitável (o visual completo do player é o passo 5). hls.js onde há
 * MediaSource (o `xhrSetup` põe o token ATUAL em toda requisição: playlist, chave e segmento);
 * sem MediaSource (iPhone antigo) toca HLS nativo: o servidor aceita o token vencido quando a
 * sessão inteira confere. Renova o token a cada 4 min sem interromper a reprodução.
 */
export function PlayerHls({ acesso, renovar, titulo, poster, marcaDagua, autoPlay = false }: PlayerHlsProps) {
  const video = useRef<HTMLVideoElement>(null);
  const token = useRef(acesso.token);
  const [erro, setErro] = useState<string | null>(null);
  const [posicao, setPosicao] = useState(0);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    let destruir = () => {};
    let ativo = true;
    (async () => {
      const { default: Hls } = await import("hls.js");
      if (!ativo) return;
      if (Hls.isSupported()) {
        const hls = new Hls({
          xhrSetup: (xhr, url) => xhr.open("GET", comTokenAtual(url, token.current, window.location.href), true),
        });
        hls.on(Hls.Events.ERROR, (_e, d) => {
          if (d.fatal) setErro(d.response?.code === 403 ? "Acesso ao vídeo encerrado. Recarregue a página." : "Não foi possível reproduzir o vídeo.");
        });
        hls.loadSource(acesso.urlMaster);
        hls.attachMedia(el);
        destruir = () => hls.destroy();
      } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
        el.src = acesso.urlMaster;
        destruir = () => el.removeAttribute("src");
      } else {
        setErro("Este navegador não reproduz o vídeo.");
      }
    })();
    return () => {
      ativo = false;
      destruir();
    };
  }, [acesso.urlMaster]);

  useEffect(() => {
    const id = setInterval(async () => {
      const r = await renovar();
      if (r.ok) token.current = r.dados.token;
      else setErro(r.erro);
    }, RENOVAR_MS);
    return () => clearInterval(id);
  }, [renovar]);

  useEffect(() => {
    if (!marcaDagua) return;
    const id = setInterval(() => setPosicao((p) => (p + 1 + Math.floor(Math.random() * (POSICOES.length - 1))) % POSICOES.length), MOVER_MARCA_MS);
    return () => clearInterval(id);
  }, [marcaDagua]);

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
        {marcaDagua && (
          <span
            aria-hidden
            className={`pointer-events-none absolute select-none text-xs font-semibold text-fixo-text/35 transition-all duration-1000 motion-reduce:transition-none ${POSICOES[posicao]}`}
          >
            {marcaDagua}
          </span>
        )}
      </div>
      {erro && (
        <p role="alert" className="m-0 text-xs font-semibold text-warn">
          {erro}
        </p>
      )}
    </div>
  );
}
