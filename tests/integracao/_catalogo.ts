/**
 * Apoio dos testes do catalogo (PostgreSQL real). Importar so dentro do teste (depois do
 * _ambiente.ts). `arquivoPronto` grava um arquivo DISPONIVEL direto no banco (sem objeto no
 * storage): o caminho real (PUT + HEAD) e provado em armazenamento.test.ts.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { chaveDeArquivo } from "@/lib/armazenamento/regras";
import { db } from "@/lib/db";
import type { FinalidadeArquivo } from "@/lib/db/schema/_enums";
import { arquivos } from "@/lib/db/schema";

export async function arquivoPronto(criadorId: string, finalidade: FinalidadeArquivo = "IMAGEM") {
  const id = randomUUID();
  const [mime, ext] = finalidade === "IMAGEM" ? ["image/png", "png"] : ["application/pdf", "pdf"];
  const [a] = await db
    .insert(arquivos)
    .values({
      id,
      criador_id: criadorId,
      chave: chaveDeArquivo(criadorId, finalidade, id, ext),
      finalidade,
      nome_original: `teste.${ext}`,
      mime,
      tamanho_bytes: 1234,
      status: "DISPONIVEL",
      modified_by: criadorId,
    })
    .returning();
  return a;
}

/** `updated_at` ISO atual de uma linha (versao para a trava). */
export async function versaoDe<T extends PgTable & { id: AnyPgColumn; updated_at: AnyPgColumn }>(tabela: T, id: string): Promise<string> {
  const [l] = (await db.select().from(tabela as PgTable).where(eq(tabela.id, id))) as { updated_at: Date }[];
  return l.updated_at.toISOString();
}

/** Desembrulha um Resultado ok (falha vira erro do teste com a mensagem). */
export function ok<T>(r: { ok: true; dados: T } | { ok: false; erro: string }): T {
  if (!r.ok) throw new Error(`esperava ok, veio: ${r.erro}`);
  return r.dados;
}
