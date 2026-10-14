import { sql } from "drizzle-orm";
import { check, foreignKey, integer, jsonb, pgTable, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ConfigVitrine } from "@/lib/vitrine/config";
import { colunasAuditoria, instante } from "./_compartilhado";
import { criadores } from "./criadores";
import { usuarios } from "./usuarios";

/**
 * Construtor da vitrine (passo 9, SISTEMA.md §4/§6; RN-135 a RN-138; ADR-0010).
 * - `criadores_vitrines`: UM por criador, com o RASCUNHO editável (jsonb validado por
 *   `configVitrineSchema` antes de gravar). `updated_at` é a trava do autosave.
 * - `criadores_vitrines_versoes`: cada "Publicar" grava uma versão IMUTÁVEL (número 1..n, quem e
 *   quando). A vitrine do aluno lê a de maior número. Reverter copia uma versão para o rascunho
 *   (não publica); nenhuma versão é alterada depois de gravada.
 * Referências dentro do JSON (cursos, aulas, grupos, imagem) não têm FK: a action confere que são
 * deste criador a cada gravação e a resolução esconde o que deixou de existir.
 */

const restrito = { onDelete: "restrict", onUpdate: "restrict" } as const;

export const criadores_vitrines = pgTable(
  "criadores_vitrines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    rascunho: jsonb("rascunho").$type<ConfigVitrine>().notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_criadores_vitrines_criador_vivo").on(t.criador_id).where(sql`is_deleted = false`),
    unique("uq_criadores_vitrines_id_criador").on(t.id, t.criador_id),
  ],
);

export const criadores_vitrines_versoes = pgTable(
  "criadores_vitrines_versoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id").notNull().references(() => criadores.id, restrito),
    vitrine_id: uuid("vitrine_id").notNull(),
    numero: integer("numero").notNull(),
    config: jsonb("config").$type<ConfigVitrine>().notNull(),
    publicada_em: instante("publicada_em").notNull().defaultNow(),
    publicada_por: uuid("publicada_por").notNull().references(() => usuarios.id, restrito),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({ name: "fk_criadores_vitrines_versoes_vitrine", columns: [t.vitrine_id, t.criador_id], foreignColumns: [criadores_vitrines.id, criadores_vitrines.criador_id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_criadores_vitrines_versoes_numero").on(t.vitrine_id, t.numero),
    check("ck_criadores_vitrines_versoes_numero", sql`numero >= 1`),
  ],
);

export type VitrineRascunho = typeof criadores_vitrines.$inferSelect;
export type VitrineVersao = typeof criadores_vitrines_versoes.$inferSelect;
