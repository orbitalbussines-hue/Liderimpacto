/**
 * Paleta da cor da marca (area do aluno). Funcao pura, sem React: recebe UMA cor
 * hex e devolve os tokens --accent, --accent-soft e --accent-ink de cada tema,
 * ja com a legibilidade garantida (accent como texto com contraste >= 3:1, nivel
 * AA para texto grande e componentes de UI).
 *
 * Com o dourado padrao (#D9A441): o escuro fica igual ao README; o claro sai
 * #b48224 (README: #B5842A) e a tinta do claro sai escura (#1a1205), porque ela
 * contrasta mais que o branco do README sobre esse dourado. Por isso a cor
 * padrao NAO gera CSS: valem os tokens do globals.css, como desenhado.
 */

export const PALETA_PADRAO = "#D9A441";

export type Tema = "dark" | "light";
export type TokensMarca = Record<"--accent" | "--accent-soft" | "--accent-ink", string>;
export type Paleta = Record<Tema, TokensMarca>;

const RE_HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const CONTRASTE_MINIMO = 3;
const TINTA_ESCURA = "#1a1205";
const TINTA_CLARA = "#ffffff";
/** Fundos sobre os quais o accent aparece como texto, por tema (README). */
const FUNDOS: Record<Tema, string[]> = {
  dark: ["#0b0b0d", "#15151a"],
  light: ["#f5f4ef", "#ffffff"],
};
const ALFA_SUAVE: Record<Tema, number> = { dark: 0.14, light: 0.12 };

type Rgb = [number, number, number];

/** "#abc", "abc", "#AABBCC" -> "#aabbcc"; qualquer outra coisa -> null. */
export function validarHex(cor: string): string | null {
  const m = RE_HEX.exec(cor.trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `#${h.length === 3 ? [...h].map((c) => c + c).join("") : h}`;
}

function paraRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function paraHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function luminancia(hex: string): number {
  const [r, g, b] = paraRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razao de contraste WCAG 2 entre duas cores hex (1 a 21). */
export function contraste(a: string, b: string): number {
  const ha = validarHex(a);
  const hb = validarHex(b);
  if (!ha || !hb) throw new Error("Cor invalida: use #RGB ou #RRGGBB.");
  const [claro, escuro] = [luminancia(ha), luminancia(hb)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

function paraHsl([r, g, b]: Rgb): Rgb {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return [h / 6, s, l];
}

function deHsl([h, s, l]: Rgb): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t: number) => {
    const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255];
}

/** Escurece (claro) ou clareia (escuro) em HSL, 1% por passo, ate o accent ser legivel como texto. */
function legivel(hex: string, tema: Tema): string {
  const [h, s, l0] = paraHsl(paraRgb(hex));
  const passo = tema === "light" ? -0.01 : 0.01;
  let cor = hex;
  for (let l = l0; l >= 0 && l <= 1; l += passo) {
    cor = paraHex(deHsl([h, s, l]));
    if (FUNDOS[tema].every((f) => contraste(cor, f) >= CONTRASTE_MINIMO)) return cor;
  }
  return tema === "light" ? "#000000" : "#ffffff";
}

function tokens(hex: string, tema: Tema): TokensMarca {
  const accent = legivel(hex, tema);
  const [r, g, b] = paraRgb(accent);
  const tinta =
    contraste(accent, TINTA_ESCURA) >= contraste(accent, TINTA_CLARA) ? TINTA_ESCURA : TINTA_CLARA;
  return {
    "--accent": accent,
    "--accent-soft": `rgba(${r}, ${g}, ${b}, ${ALFA_SUAVE[tema]})`,
    "--accent-ink": tinta,
  };
}

/** Gera a paleta dos dois temas. Lanca erro se a cor nao for hex valido. */
export function gerarPaleta(corHex: string): Paleta {
  const hex = validarHex(corHex);
  if (!hex) throw new Error("Cor invalida: use #RGB ou #RRGGBB.");
  return { dark: tokens(hex, "dark"), light: tokens(hex, "light") };
}

/** Seletor da area do aluno: o atributo pode estar no proprio <html> ou num ancestral abaixo dele. */
export const ESCOPO_ALUNO = '[data-area="aluno"]';

/**
 * CSS que aplica a paleta dentro de `escopo` nos dois temas. Tambem define
 * --marca-fixo / --marca-fixo-ink (hero e login, sempre escuros) com a versao
 * do tema escuro. So entram no CSS valores produzidos aqui (hex normalizado e
 * rgba numerico): nada do texto original do usuario chega ao <style>.
 */
export function cssDaMarca(corHex: string, escopo: string = ESCOPO_ALUNO): string {
  const p = gerarPaleta(corHex);
  const bloco = (t: TokensMarca) =>
    Object.entries(t)
      .map(([k, v]) => `${k}:${v};`)
      .join("");
  const seletor = (tema: Tema) =>
    `${escopo}[data-theme="${tema}"],[data-theme="${tema}"] ${escopo}`;
  return [
    `${seletor("dark")}{${bloco(p.dark)}}`,
    `${seletor("light")}{${bloco(p.light)}}`,
    `${escopo}{--marca-fixo:${p.dark["--accent"]};--marca-fixo-ink:${p.dark["--accent-ink"]};}`,
  ].join("\n");
}
