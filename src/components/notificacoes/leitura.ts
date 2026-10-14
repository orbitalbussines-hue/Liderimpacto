"use client";

import { acaoMarcarNotificacoesLidas } from "@/lib/actions/notificacoes";

/**
 * Marcar como lida + avisar o sino. A tela (painel ou página) e o contador do header não se
 * conhecem: conversam por um evento do `window`.
 */
const EVENTO = "li:notificacoes-lidas";
export type MudancaDeLeitura = { menos: number } | { zerar: true };

export function avisarLeitura(d: MudancaDeLeitura) {
  window.dispatchEvent(new CustomEvent<MudancaDeLeitura>(EVENTO, { detail: d }));
}

export function ouvirLeitura(aoMudar: (d: MudancaDeLeitura) => void): () => void {
  const f = (e: Event) => aoMudar((e as CustomEvent<MudancaDeLeitura>).detail);
  window.addEventListener(EVENTO, f);
  return () => window.removeEventListener(EVENTO, f);
}

/** Otimista: o servidor confirma por trás; o polling do sino corrige qualquer divergência. */
export function marcarUma(id: string) {
  avisarLeitura({ menos: 1 });
  void acaoMarcarNotificacoesLidas({ ids: [id] });
}

export async function marcarTodas(): Promise<boolean> {
  const r = await acaoMarcarNotificacoesLidas({ todas: true });
  if (r.ok) avisarLeitura({ zerar: true });
  return r.ok;
}
