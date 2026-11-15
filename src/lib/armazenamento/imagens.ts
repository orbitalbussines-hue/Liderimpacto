import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { arquivos } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { urlDeImagemOuNula } from "./cliente";

/**
 * Imagens referenciadas por id dentro de um JSON (blocos das páginas, ADR-0022; conteúdo da aula,
 * RN-275): só as DESTE criador, IMAGEM disponível e viva. Id de outro criador ou que sumiu fica fora.
 */

/** Chave de cada imagem DESTE criador (IMAGEM disponível). */
export async function chavesDasImagens(criadorId: string, ids: readonly string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const linhas = await db
    .select({ id: arquivos.id, chave: arquivos.chave })
    .from(arquivos)
    .where(and(eq(arquivos.criador_id, criadorId), inArray(arquivos.id, [...ids]), eq(arquivos.finalidade, "IMAGEM"), eq(arquivos.status, "DISPONIVEL"), vivos(arquivos)));
  return new Map(linhas.map((l) => [l.id, l.chave]));
}

/** URL assinada (curta) de cada imagem encontrada; a que não está no mapa não aparece. */
export async function urlsDasImagens(criadorId: string, ids: readonly string[]): Promise<Record<string, string | null>> {
  const imagens: Record<string, string | null> = {};
  await Promise.all([...(await chavesDasImagens(criadorId, ids))].map(async ([id, chave]) => void (imagens[id] = await urlDeImagemOuNula(criadorId, chave))));
  return imagens;
}
