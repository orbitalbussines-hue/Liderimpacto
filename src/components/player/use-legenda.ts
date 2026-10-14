"use client";

import { useEffect, useState, type RefObject } from "react";
import { sanitizarTexto } from "@/lib/legendas/regras";

/** Legenda que o player pode mostrar (`url` = rota do app, nunca a chave do storage). */
export interface LegendaPlayer {
  id: string;
  idioma: string;
  rotulo: string;
  url: string;
}

/** `id` do `<track>` (é o `id` do TextTrack). */
export const idDaFaixa = (legendaId: string) => `legenda-${legendaId}`;

/** Escolha do aluno NESTE navegador: idioma ligado, "" = desligada, `null` = nunca escolheu. */
export function lerPreferenciaLegenda(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null; // modo privado/armazenamento bloqueado: legenda começa desligada
  }
}

export function gravarPreferenciaLegenda(chave: string, idioma: string): void {
  try {
    localStorage.setItem(chave, idioma);
  } catch {
    // sem armazenamento: vale só nesta página
  }
}

/**
 * Liga a faixa escolhida em modo `hidden`: o navegador carrega o `.vtt` e dispara `cuechange`, mas
 * quem desenha é o player (acima dos controles, legível em tela cheia e no celular). No iPhone,
 * em tela cheia nativa (só o `<video>`), a faixa vira `showing` e o sistema desenha. Devolve o
 * texto do trecho atual (texto puro: o `.vtt` já vem sanitizado e passa de novo por aqui).
 */
export function useLegenda(video: RefObject<HTMLVideoElement | null>, ativa: string | null): string {
  const [atual, setAtual] = useState<{ id: string | null; texto: string }>({ id: null, texto: "" });

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const faixas = Array.from(el.textTracks ?? []); // jsdom não tem textTracks
    const alvo = ativa ? (faixas.find((t) => t.id === idDaFaixa(ativa)) ?? null) : null;
    for (const t of faixas) if (t !== alvo) t.mode = "disabled";
    if (!alvo) return;
    alvo.mode = "hidden";
    const aoMudar = () => {
      const cues = Array.from(alvo.activeCues ?? []) as VTTCue[];
      setAtual({ id: ativa, texto: cues.map((c) => sanitizarTexto(c.text)).filter(Boolean).join("\n") });
    };
    const entrar = () => (alvo.mode = "showing");
    const sair = () => (alvo.mode = "hidden");
    alvo.addEventListener("cuechange", aoMudar);
    el.addEventListener("webkitbeginfullscreen", entrar);
    el.addEventListener("webkitendfullscreen", sair);
    return () => {
      alvo.removeEventListener("cuechange", aoMudar);
      el.removeEventListener("webkitbeginfullscreen", entrar);
      el.removeEventListener("webkitendfullscreen", sair);
      alvo.mode = "disabled";
    };
  }, [video, ativa]);

  return ativa && atual.id === ativa ? atual.texto : "";
}
