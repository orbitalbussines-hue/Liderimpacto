import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Intervalo } from "@/lib/painel/periodo";
import { avaliacoesAnalytics } from "./consultas-avaliacoes";
import { conteudo, coortes, cursosDoCriador, horasAssistidas, kpisAnalytics, serieDiaria } from "./consultas";

/**
 * Agregados do Analytics com cache curto do Next 16 (mesmo padrão do painel, ADR-0007): perfil
 * `minutes` e etiqueta `analytics:<criador>`. A chave inclui criador, período (`de`/`ate`) e curso. Só chame
 * DEPOIS de `membroDaPagina(EQUIPE)` — o cache não sabe quem pede. O CSV NÃO passa por aqui
 * (lê direto: é raro e deve sair fresco).
 */
const etiqueta = (criadorId: string) => `analytics:${criadorId}`;

function marcar(criadorId: string) {
  cacheLife("minutes");
  cacheTag(etiqueta(criadorId));
}

export async function cursosCacheados(criadorId: string) {
  "use cache";
  marcar(criadorId);
  return cursosDoCriador(criadorId);
}

export async function visaoGeralCacheada(criadorId: string, periodo: Intervalo, curso: string | null) {
  "use cache";
  marcar(criadorId);
  const [kpis, horas, serie] = await Promise.all([kpisAnalytics(criadorId, periodo, curso), horasAssistidas(criadorId, periodo, curso), serieDiaria(criadorId, periodo, curso)]);
  return { kpis, horas, serie };
}

export async function conteudoCacheado(criadorId: string, curso: string | null) {
  "use cache";
  marcar(criadorId);
  return conteudo(criadorId, curso);
}

export async function coortesCacheadas(criadorId: string, curso: string | null) {
  "use cache";
  marcar(criadorId);
  return coortes(criadorId, curso);
}

export async function avaliacoesCacheadas(criadorId: string, periodo: Intervalo, curso: string | null) {
  "use cache";
  marcar(criadorId);
  return avaliacoesAnalytics(criadorId, periodo, curso);
}
