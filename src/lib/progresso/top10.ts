import "server-only";
import { cacheLife } from "next/cache";
import { top10Agora } from "./consultas";

/**
 * TOP 10 da vitrine com cache do Next 16 (`"use cache"`, perfil `hours`: recalcula no máximo a
 * cada hora por criador, servindo o anterior enquanto isso). Não depende do aluno (catálogo
 * publicado), então uma entrada por criador serve todo mundo. Sem cron (ADR-0006).
 */
export async function top10(criadorId: string, limite = 10) {
  "use cache";
  cacheLife("hours");
  return top10Agora(criadorId, limite);
}
