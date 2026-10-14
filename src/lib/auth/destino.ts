/**
 * Destino pos-login: so caminho interno (evita open redirect via `?de=`).
 * Modulo puro: usado pela action de entrar e pelas paginas de login (e travado por teste).
 */
export const destinoSeguro = (de: unknown): string =>
  typeof de === "string" && /^\/(?!\/)[\w\-/?=&.%]*$/.test(de) ? de : "/";
