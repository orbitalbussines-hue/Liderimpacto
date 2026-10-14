/**
 * Atalhos de teclado do player (puro, testado): espaço/K, J/L (±10 s), ←/→ (±5 s), ↑/↓ volume,
 * F tela cheia, M mudo, C legendas, 0–9 = 0%–90% do vídeo. Com Ctrl/Alt/Meta não faz nada (atalho do navegador).
 */

export type AcaoAtalho =
  | { tipo: "alternar" }
  | { tipo: "legendas" }
  | { tipo: "pular"; seg: number }
  | { tipo: "volume"; delta: number }
  | { tipo: "telaCheia" }
  | { tipo: "mudo" }
  | { tipo: "porcentagem"; valor: number };

export interface TeclaPressionada {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

const FIXOS: Record<string, AcaoAtalho> = {
  " ": { tipo: "alternar" },
  k: { tipo: "alternar" },
  j: { tipo: "pular", seg: -10 },
  l: { tipo: "pular", seg: 10 },
  arrowleft: { tipo: "pular", seg: -5 },
  arrowright: { tipo: "pular", seg: 5 },
  arrowup: { tipo: "volume", delta: 0.1 },
  arrowdown: { tipo: "volume", delta: -0.1 },
  f: { tipo: "telaCheia" },
  m: { tipo: "mudo" },
  c: { tipo: "legendas" },
};

export function acaoDoAtalho(e: TeclaPressionada): AcaoAtalho | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (/^[0-9]$/.test(e.key)) return { tipo: "porcentagem", valor: Number(e.key) * 10 };
  return FIXOS[e.key.toLowerCase()] ?? null;
}

/**
 * O atalho vale para este alvo? Campo de texto fica com a tecla; botão fica com espaço/Enter
 * (o clique nativo) e o resto vai para o player.
 */
export function atalhoValeNoAlvo(alvo: EventTarget | null, key: string): boolean {
  if (!(alvo instanceof HTMLElement)) return true;
  if (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName)) return false;
  if (alvo.closest("[role=menu]")) return false;
  if (alvo.tagName === "BUTTON" || alvo.tagName === "A") return key !== " " && key !== "Enter";
  return true;
}
