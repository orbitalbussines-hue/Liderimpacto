import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria } from "./_compartilhado";
import { FINALIDADES_ARQUIVO_GRAVADAS, STATUS_ARQUIVO, listaSql } from "./_enums";
import { criadores } from "./criadores";

/**
 * Arquivo no object storage (bucket S3_BUCKET_ARQUIVOS). O binario NUNCA passa pelo Next: o
 * navegador sobe direto por URL pre-assinada e a action confirma com HEAD (tamanho e tipo).
 * `chave` sempre `criadores/<criador_id>/...` (src/lib/armazenamento/regras.ts). Substituir ou
 * remover = soft delete aqui + apagar SO o objeto no storage.
 */
export const arquivos = pgTable(
  "arquivos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id")
      .notNull()
      .references(() => criadores.id, { onDelete: "restrict", onUpdate: "restrict" }),
    chave: text("chave").notNull(),
    finalidade: text("finalidade", { enum: FINALIDADES_ARQUIVO_GRAVADAS }).notNull(),
    nome_original: text("nome_original").notNull(),
    mime: text("mime").notNull(),
    tamanho_bytes: bigint("tamanho_bytes", { mode: "number" }).notNull(),
    status: text("status", { enum: STATUS_ARQUIVO }).notNull().default("ENVIADO_PENDENTE"),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_arquivos_chave").on(t.chave),
    // Alvo das FKs compostas do catalogo: o arquivo e do MESMO criador de quem o usa.
    unique("uq_arquivos_id_criador").on(t.id, t.criador_id),
    index("ix_arquivos_criador_status").on(t.criador_id, t.status).where(sql`is_deleted = false`),
    check("ck_arquivos_chave", sql`chave like 'criadores/' || criador_id::text || '/%'`),
    check("ck_arquivos_tamanho", sql`tamanho_bytes > 0`),
    check("ck_arquivos_finalidade", sql.raw(`finalidade in (${listaSql(FINALIDADES_ARQUIVO_GRAVADAS)})`)),
    check("ck_arquivos_status", sql.raw(`status in (${listaSql(STATUS_ARQUIVO)})`)),
  ],
);

export type Arquivo = typeof arquivos.$inferSelect;
export type NovoArquivo = typeof arquivos.$inferInsert;
