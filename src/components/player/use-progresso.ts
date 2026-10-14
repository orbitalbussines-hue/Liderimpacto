"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { acaoRegistrarProgresso } from "@/lib/actions/progresso";
import { acumuladorDeIntervalos, corpoDaBatida, LIMITES_BATIDA, type Acumulador, type CorpoBatida } from "./acumulador";

export interface ProgressoDaBatida {
  percentual: number;
  concluida: boolean;
  concluiuAgora: boolean;
}

const HEARTBEAT_MS = 10_000;
export const URL_BEACON = "/api/progresso";

/**
 * Envia por `navigator.sendBeacon` (sobrevive ao fechamento da aba). O corpo vai como texto JSON
 * (`text/plain`, aceito pelo contrato) para não depender de CORS/preflight. Fila cheia: `fetch`
 * com `keepalive`.
 */
export function enviarBeacon(corpo: CorpoBatida): void {
  const json = JSON.stringify(corpo);
  if (json.length > LIMITES_BATIDA.bytesMax) return;
  const ok = typeof navigator.sendBeacon === "function" && navigator.sendBeacon(URL_BEACON, new Blob([json], { type: "text/plain;charset=UTF-8" }));
  if (!ok) void fetch(URL_BEACON, { method: "POST", body: json, keepalive: true, headers: { "Content-Type": "text/plain;charset=UTF-8" } }).catch(() => {});
}

/**
 * Progresso do player (RN-118): acumula os trechos REALMENTE tocados e manda
 * - a cada 10 s tocando: `acaoRegistrarProgresso` (a resposta diz se concluiu);
 * - em pause, seeked, `visibilitychange` (oculta), `pagehide` e ao sair da aula: beacon;
 * - ao passar de 90% da duração e no fim (`ended`): a action, para a UI saber da conclusão na hora
 *   (e antes da reprodução automática).
 * Batida a menos de 3 s da anterior (o servidor ignoraria) fica para a próxima, exceto na saída.
 */
export function useProgresso(
  video: RefObject<HTMLVideoElement | null>,
  { aulaId, duracaoSeg, ativo, aoGravar }: { aulaId: string; duracaoSeg: number | null; ativo: boolean; aoGravar: (p: ProgressoDaBatida) => void },
) {
  const acumulador = useRef<Acumulador | null>(null);
  const ultimoEnvio = useRef(0);
  const gravado = useRef(aoGravar);
  useEffect(() => {
    gravado.current = aoGravar;
  });

  const duracao = useCallback((el: HTMLVideoElement) => duracaoSeg ?? (Number.isFinite(el.duration) ? Math.ceil(el.duration) : 0), [duracaoSeg]);

  /**
   * Monta a batida (ou nada, se não há o que dizer). `forcar` = saída: manda mesmo perto da
   * anterior. Recebe o `<video>` (na desmontagem o ref já foi desligado).
   */
  const montar = useCallback(
    (el: HTMLVideoElement, forcar: boolean): CorpoBatida | null => {
      const a = acumulador.current;
      const d = duracao(el);
      if (!a || d <= 0) return null;
      if (!forcar && Date.now() - ultimoEnvio.current < LIMITES_BATIDA.intervaloMinimoMs) return null;
      if (a.vazio() && !forcar) return null;
      ultimoEnvio.current = Date.now();
      return corpoDaBatida(aulaId, a.retirar(), el.currentTime, d);
    },
    [aulaId, duracao],
  );

  const porAcao = useCallback(
    async (el: HTMLVideoElement, forcar = false) => {
      const corpo = montar(el, forcar);
      if (!corpo) return;
      const r = await acaoRegistrarProgresso(corpo).catch(() => null);
      if (r?.ok && r.dados.situacao === "registrada") gravado.current(r.dados.progresso);
      else if (!r?.ok || r.dados.situacao === "ignorada") acumulador.current?.devolver(corpo.intervalos);
    },
    [montar],
  );

  const porBeacon = useCallback(
    (el: HTMLVideoElement, forcar: boolean) => {
      const corpo = montar(el, forcar);
      if (corpo && (corpo.intervalos.length > 0 || forcar)) enviarBeacon(corpo);
    },
    [montar],
  );

  useEffect(() => {
    const el = video.current;
    if (!el || !ativo) return;
    const d = duracao(el);
    acumulador.current ??= acumuladorDeIntervalos(d > 0 ? d : 12 * 3600);
    const a = acumulador.current;
    const tocando = () => !el.paused && !el.seeking && !el.ended && el.readyState >= 3;

    // Ao passar de 90% da duração, uma batida extra: a conclusão aparece na hora, não 10 s depois.
    let pediuConclusao = false;
    const aoTempo = () => {
      if (!tocando()) return;
      a.tocou(el.currentTime);
      if (!pediuConclusao && d > 0 && el.currentTime >= (d * LIMITES_BATIDA.percentualConclusao) / 100) {
        pediuConclusao = true;
        void porAcao(el);
      }
    };
    const aoParar = () => a.interromper();
    const aoPausar = () => {
      a.interromper();
      if (!el.ended) porBeacon(el, false);
    };
    const aoBuscar = () => porBeacon(el, false);
    const aoTerminar = () => {
      a.tocou(el.currentTime);
      a.interromper();
      // Perto da batida anterior o servidor ignoraria: espera o resto dos 3 s (< contagem de 5 s).
      const espera = Math.max(0, LIMITES_BATIDA.intervaloMinimoMs - (Date.now() - ultimoEnvio.current));
      setTimeout(() => void porAcao(el, true), espera + 50);
    };
    const aoOcultar = () => {
      if (document.visibilityState === "hidden") porBeacon(el, true);
    };
    const aoSair = () => porBeacon(el, true);

    el.addEventListener("timeupdate", aoTempo);
    el.addEventListener("seeking", aoParar);
    el.addEventListener("waiting", aoParar);
    el.addEventListener("pause", aoPausar);
    el.addEventListener("seeked", aoBuscar);
    el.addEventListener("ended", aoTerminar);
    document.addEventListener("visibilitychange", aoOcultar);
    window.addEventListener("pagehide", aoSair);
    const batida = setInterval(() => {
      if (!el.paused) void porAcao(el);
    }, HEARTBEAT_MS);
    return () => {
      clearInterval(batida);
      el.removeEventListener("timeupdate", aoTempo);
      el.removeEventListener("seeking", aoParar);
      el.removeEventListener("waiting", aoParar);
      el.removeEventListener("pause", aoPausar);
      el.removeEventListener("seeked", aoBuscar);
      el.removeEventListener("ended", aoTerminar);
      document.removeEventListener("visibilitychange", aoOcultar);
      window.removeEventListener("pagehide", aoSair);
      // Saída pela navegação do app (próxima aula, playlist): não há pagehide.
      a.interromper();
      if (!a.vazio()) porBeacon(el, true);
    };
  }, [ativo, duracao, porAcao, porBeacon, video]);
}
