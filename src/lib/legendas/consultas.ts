import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { produtos_modulos_aulas_legendas as legendas } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

/** URL do `.vtt` servido pelo app (nunca a chave do storage). */
export const urlDaLegenda = (legendaId: string) => `/api/legendas/${legendaId}`;

/** Legendas vivas da aula do criador do HOST: `pt-BR` primeiro, depois por idioma. */
export async function legendasDaAula(criadorId: string, aulaId: string) {
  return db
    .select({
      id: legendas.id,
      idioma: legendas.idioma,
      rotulo: legendas.rotulo,
      nomeOriginal: legendas.nome_original,
      trechos: legendas.trechos,
      duracaoSeg: legendas.duracao_seg,
      enviadaEm: legendas.created_at,
      versao: legendas.updated_at,
    })
    .from(legendas)
    .where(and(eq(legendas.aula_id, aulaId), eq(legendas.criador_id, criadorId), vivos(legendas)))
    .orderBy(sql`${legendas.idioma} <> 'pt-BR'`, asc(legendas.idioma));
}

export type LegendaDaAula = Awaited<ReturnType<typeof legendasDaAula>>[number];
