import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { acessosPorDia, kpisDoPainel, maisAssistidas, saudeDosProdutos } from "./consultas";
import type { Intervalo } from "./periodo";

/**
 * Agregados do painel com cache do Next 16: perfil `minutes` (revalida a cada 1 min servindo o
 * anterior, expira em 1 h) e etiqueta `painel:<criador>` para quem quiser `revalidateTag` depois.
 * A chave inclui os argumentos: uma entrada por criador (e período `de`/`ate`). O "Acontecendo agora" NÃO
 * passa por aqui (é o "agora"; consulta direta, limitada a 8 linhas).
 * Só chame DEPOIS de conferir sessão e papel (a página faz) — o cache não sabe quem pede.
 */
const etiqueta = (criadorId: string) => `painel:${criadorId}`;

export async function kpisCacheados(criadorId: string, periodo: Intervalo) {
  "use cache";
  cacheLife("minutes");
  cacheTag(etiqueta(criadorId));
  return kpisDoPainel(criadorId, periodo);
}

export async function acessosCacheados(criadorId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(etiqueta(criadorId));
  return acessosPorDia(criadorId);
}

export async function maisAssistidasCacheadas(criadorId: string, periodo: Intervalo) {
  "use cache";
  cacheLife("minutes");
  cacheTag(etiqueta(criadorId));
  return maisAssistidas(criadorId, periodo);
}

export async function saudeCacheada(criadorId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(etiqueta(criadorId));
  return saudeDosProdutos(criadorId);
}
