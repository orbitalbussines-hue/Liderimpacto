"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Resultado } from "@/lib/acao";

export interface AcessoHls {
  /** Master assinada (`...master.m3u8?t=...`). */
  urlMaster: string;
  token: string;
}

/**
 * `acesso`: o servidor recusou a chave/playlist (sessão de reprodução encerrada, token, matrícula)
 * ou a renovação falhou; `rede`: falha de carga; `navegador`: sem MediaSource nem HLS nativo.
 */
export interface ErroHls {
  tipo: "acesso" | "rede" | "navegador";
  mensagem: string;
}

export interface NivelHls {
  indice: number;
  altura: number;
}

const RENOVAR_MS = 4 * 60_000;

/** Troca o `t=` da URL pelo token atual (playlist VOD carregada uma vez guarda o token antigo). */
export function comTokenAtual(url: string, token: string, base: string): string {
  const u = new URL(url, base);
  if (u.searchParams.has("t")) u.searchParams.set("t", token);
  return u.toString();
}

/** O hls.js e o HLS nativo mexem no elemento (src, MediaSource): é do DOM, não estado do React. */
const elementoDe = (ref: { readonly current: HTMLVideoElement | null }): HTMLVideoElement | null => ref.current;

interface HlsMinimo {
  currentLevel: number;
}

/**
 * Liga o HLS protegido a um `<video>` (ADR-0005). hls.js onde há MediaSource (o `xhrSetup` põe o
 * token ATUAL em toda requisição: playlist, chave e segmento); sem MediaSource (Safari/iOS) toca
 * HLS nativo: o servidor aceita o token vencido quando a sessão inteira confere. Renova o token a
 * cada 4 min (mantém a sessão de reprodução viva) sem interromper. `acesso` nulo = nada ligado.
 * `video` é o ref do `<video>` de quem chama.
 */
export function useHls(
  video: { readonly current: HTMLVideoElement | null },
  acesso: AcessoHls | null,
  renovar: () => Promise<Resultado<{ token: string }>>,
  aoErro: (e: ErroHls) => void,
) {
  const token = useRef(acesso?.token ?? "");
  const hlsRef = useRef<HlsMinimo | null>(null);
  const erro = useRef(aoErro);
  const [niveis, setNiveis] = useState<NivelHls[]>([]);
  const [nivel, setNivel] = useState(-1);
  const [nativo, setNativo] = useState(false);

  useEffect(() => {
    erro.current = aoErro;
  });

  const urlMaster = acesso?.urlMaster;
  useEffect(() => {
    const el = elementoDe(video);
    if (!el || !urlMaster) return;
    const limpeza = { destruir: () => {}, ativo: true };
    (async () => {
      const { default: Hls } = await import("hls.js");
      if (!limpeza.ativo) return;
      if (Hls.isSupported()) {
        const hls = new Hls({
          xhrSetup: (xhr, url) => xhr.open("GET", comTokenAtual(url, token.current, window.location.href), true),
        });
        let recuperouMidia = false;
        hls.on(Hls.Events.MANIFEST_PARSED, (_e, d) => {
          setNiveis(d.levels.map((l, indice) => ({ indice, altura: l.height })).filter((l) => l.altura > 0).sort((a, b) => b.altura - a.altura));
        });
        hls.on(Hls.Events.ERROR, (_e, d) => {
          if (!d.fatal) return;
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR && !recuperouMidia) {
            recuperouMidia = true;
            hls.recoverMediaError();
            return;
          }
          const status = d.response?.code;
          erro.current(
            status === 403 || status === 401
              ? { tipo: "acesso", mensagem: "Acesso ao vídeo encerrado. Recarregue a página." }
              : { tipo: "rede", mensagem: "Não foi possível reproduzir o vídeo." },
          );
        });
        hls.loadSource(urlMaster);
        hls.attachMedia(el);
        hlsRef.current = hls;
        limpeza.destruir = () => {
          hlsRef.current = null;
          hls.destroy();
        };
      } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
        setNativo(true);
        el.src = urlMaster;
        const aoFalhar = () => erro.current({ tipo: "rede", mensagem: "Não foi possível reproduzir o vídeo." });
        el.addEventListener("error", aoFalhar);
        limpeza.destruir = () => {
          el.removeEventListener("error", aoFalhar);
          el.removeAttribute("src");
          el.load();
        };
      } else {
        erro.current({ tipo: "navegador", mensagem: "Este navegador não reproduz o vídeo." });
      }
    })();
    return () => {
      limpeza.ativo = false;
      limpeza.destruir();
    };
  }, [urlMaster, video]);

  useEffect(() => {
    if (acesso) token.current = acesso.token;
  }, [acesso]);

  useEffect(() => {
    if (!urlMaster) return;
    const id = setInterval(async () => {
      const r = await renovar();
      if (r.ok) token.current = r.dados.token;
      else erro.current({ tipo: "acesso", mensagem: r.erro });
    }, RENOVAR_MS);
    return () => clearInterval(id);
  }, [renovar, urlMaster]);

  /** -1 = automático. */
  const escolherNivel = useCallback((n: number) => {
    if (hlsRef.current) hlsRef.current.currentLevel = n;
    setNivel(n);
  }, []);

  return { niveis, nivel, escolherNivel, nativo };
}
