/**
 * De qual area e esta requisicao? Funcao PURA (sem banco, sem Next), travada por teste.
 *
 *   <slug>.<dominio>      -> { tipo: "criador", slug }
 *   <dominio> / www.<dominio> -> { tipo: "plataforma" }
 *   qualquer outro host   -> { tipo: "dominioProprio", host }  (ligado depois)
 *   slug invalido / host ilegivel -> null (a pagina responde 404)
 *
 * Dev: PLATAFORMA_DOMINIO=localhost -> `lider-de-impacto.localhost:3011`.
 */

/** Subdominio aceito: [a-z0-9-], 1 a 63, sem hifen nas pontas. A mesma regra do CHECK em criadores.slug. */
export const SLUG_CRIADOR = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
/**
 * Slugs que nunca viram criador (www e o apex; os demais ficam livres para a plataforma).
 * `s3` = host publico do storage na VPS (`s3.<dominio>`, envio direto do navegador; ADR-0015).
 */
export const SLUGS_RESERVADOS = ["www", "api", "app", "admin", "plataforma", "mail", "smtp", "s3", "vos"] as const;

export type AreaDoHost =
  | { tipo: "plataforma" }
  | { tipo: "criador"; slug: string }
  | { tipo: "dominioProprio"; host: string };

export const slugValido = (slug: string) => SLUG_CRIADOR.test(slug) && !(SLUGS_RESERVADOS as readonly string[]).includes(slug);

/** Tira porta e ponto final e passa para minusculo. `null` = host vazio ou ilegivel. */
function nomeDoHost(host: string | null | undefined): string | null {
  const bruto = (host ?? "").trim().toLowerCase();
  if (!bruto || bruto.length > 253) return null;
  // IPv6 literal ([::1]:3000) cai no regex abaixo: nao e host de criador nem da plataforma.
  const semPorta = bruto.replace(/:\d{1,5}$/, "").replace(/\.$/, "");
  return /^[a-z0-9.-]+$/.test(semPorta) ? semPorta : null;
}

export function criadorDoHost(host: string | null | undefined, dominioPlataforma: string): AreaDoHost | null {
  const nome = nomeDoHost(host);
  const dominio = nomeDoHost(dominioPlataforma);
  if (!nome || !dominio) return null;
  if (nome === dominio || nome === `www.${dominio}`) return { tipo: "plataforma" };
  if (nome.endsWith(`.${dominio}`)) {
    const slug = nome.slice(0, -(dominio.length + 1));
    // Um nivel so: `a.b.dominio` nao e criador (nem cai em dominio proprio).
    return slugValido(slug) ? { tipo: "criador", slug } : null;
  }
  return { tipo: "dominioProprio", host: nome };
}

/** Origem (protocolo + host + porta) da area: apex da plataforma ou `<slug>.<apex>`. Pura. */
export function urlDaArea(urlPlataforma: string, slug: string | null): string {
  const u = new URL(urlPlataforma);
  if (slug) u.hostname = `${slug}.${u.hostname}`;
  return u.origin;
}
