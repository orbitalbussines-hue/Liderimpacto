import "server-only";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { produtos, produtos_modulos, produtos_modulos_aulas, produtos_modulos_aulas_videos as videos } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

/**
 * Aba "Estatísticas" do Estúdio de vídeo (RN-205), DONO e ADMIN. Só leitura de agregados que já
 * existem: visualizações = soma diária de `produtos_modulos_aulas_visualizacoes` (uma por membro por
 * dia, ADR-0006) no período; minutos assistidos = segundos ÚNICOS assistidos por pessoa (bitmap),
 * somados; retenção média = média do % assistido de quem abriu a aula; conclusões = progresso
 * concluído. Equipe conta junto (é a mesma tabela do aluno); o volume dela é desprezível.
 */

export interface EstatisticaVideo {
  videoId: string;
  aulaId: string;
  aula: string;
  produtoId: string;
  produto: string;
  duracaoSeg: number | null;
  visualizacoes: number;
  espectadores: number;
  minutosAssistidos: number;
  /** 0 a 100 (inteiro). */
  retencaoMedia: number;
  conclusoes: number;
}

export async function estatisticasDosVideos(criadorId: string, f: { produtoId?: string; dias?: number } = {}, agora = new Date()): Promise<EstatisticaVideo[]> {
  const dias = Math.min(Math.max(f.dias ?? 30, 1), 365);
  const desde = new Date(agora.getTime() - dias * 86_400_000).toISOString().slice(0, 10);
  const condicoes: SQL[] = [eq(videos.criador_id, criadorId), eq(videos.situacao, "PRONTO"), vivos(videos), vivos(produtos_modulos_aulas), vivos(produtos_modulos), vivos(produtos)];
  if (f.produtoId) condicoes.push(eq(produtos.id, f.produtoId));
  const linhas = await db
    .select({
      videoId: videos.id,
      aulaId: produtos_modulos_aulas.id,
      aula: produtos_modulos_aulas.titulo,
      produtoId: produtos.id,
      produto: produtos.titulo,
      duracaoSeg: videos.duracao_seg,
      visualizacoes: sql<number>`coalesce((select sum(v.visualizacoes) from produtos_modulos_aulas_visualizacoes v
        where v.aula_id = ${produtos_modulos_aulas.id} and v.is_deleted = false and v.dia >= ${desde}::date), 0)::int`,
      // Um agregado só por aula (índice único membro×aula): espectadores|segundos|retenção|conclusões.
      progresso: sql<{ e: number; s: number; r: number | null; c: number }>`(select json_build_object('e', count(*), 's', coalesce(sum(pr.segundos_assistidos), 0),
        'r', avg(pr.percentual), 'c', count(*) filter (where pr.concluida))
        from produtos_modulos_aulas_progressos pr where pr.aula_id = ${produtos_modulos_aulas.id} and pr.is_deleted = false)`,
    })
    .from(videos)
    .innerJoin(produtos_modulos_aulas, and(eq(produtos_modulos_aulas.id, videos.aula_id), eq(produtos_modulos_aulas.criador_id, videos.criador_id)))
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
    .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id))
    .where(and(...condicoes))
    .orderBy(produtos.titulo, produtos_modulos.ordem, produtos_modulos_aulas.ordem);
  return linhas
    .map(({ progresso: p, ...l }) => ({
      ...l,
      espectadores: Number(p.e),
      minutosAssistidos: Math.round(Number(p.s) / 60),
      retencaoMedia: Math.round(Number(p.r ?? 0)),
      conclusoes: Number(p.c),
    }))
    .sort((a, b) => b.visualizacoes - a.visualizacoes);
}
