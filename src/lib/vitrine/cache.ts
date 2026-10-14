import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { publicadaAgora } from "./dados";

/**
 * Config PUBLICADA com cache do Next 16 (ADR-0010): uma entrada por criador, etiqueta
 * `vitrine:<criador>`, perfil `max` (só muda quando alguém publica). "Publicar" chama
 * `updateTag(etiquetaVitrine(criadorId))` (src/lib/actions/vitrine.ts): a próxima requisição já lê a
 * nova versão. Não depende de quem pede; a parte pessoal (continuar, lista) é resolvida fora.
 */
export const etiquetaVitrine = (criadorId: string) => `vitrine:${criadorId}`;

export async function configPublicada(criadorId: string) {
  "use cache";
  cacheLife("max");
  cacheTag(etiquetaVitrine(criadorId));
  return (await publicadaAgora(criadorId))?.config ?? null;
}
