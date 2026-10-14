export const TEMAS = ["dark", "light"] as const;
export type Tema = (typeof TEMAS)[number];

/** Cookie lido pelo script do <head> (layout raiz) e gravado pela action de tema. */
export const COOKIE_TEMA = "tema";
