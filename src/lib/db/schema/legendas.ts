import { sql } from "drizzle-orm";
import { check, foreignKey, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria } from "./_compartilhado";
import { criadores } from "./criadores";
import { produtos_modulos_aulas } from "./produtos";
import { usuarios } from "./usuarios";

/**
 * Legenda da aula (ADR-0013, RN-180). UMA viva por (aula, idioma): trocar = soft delete da anterior
 * + linha nova (histórico preservado). O `.vtt` NORMALIZADO (sem tags, tempos conferidos) mora no
 * bucket de arquivos em `criadores/<criador>/legendas/<id>.vtt`; `texto` é a transcrição em texto
 * puro, sem tempos (busca e a futura Base de conhecimento). FK composta como o resto do catálogo:
 * legenda de A nunca aponta aula de B.
 */
export const produtos_modulos_aulas_legendas = pgTable(
  "produtos_modulos_aulas_legendas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criador_id: uuid("criador_id")
      .notNull()
      .references(() => criadores.id, { onDelete: "restrict", onUpdate: "restrict" }),
    aula_id: uuid("aula_id").notNull(),
    /** BCP-47 simples: `pt-BR`, `en`, `es-419`. */
    idioma: text("idioma").notNull().default("pt-BR"),
    /** O que o aluno vê no player ("Português"). */
    rotulo: text("rotulo").notNull(),
    /** Nome do arquivo que a equipe enviou (só para a tela). */
    nome_original: text("nome_original").notNull(),
    chave: text("chave").notNull(),
    texto: text("texto").notNull(),
    trechos: integer("trechos").notNull(),
    /** Fim do último trecho, em segundos (arredondado para cima). */
    duracao_seg: integer("duracao_seg").notNull(),
    enviado_por: uuid("enviado_por").notNull(),
    ...colunasAuditoria,
  },
  (t) => [
    foreignKey({
      name: "fk_produtos_modulos_aulas_legendas_aula",
      columns: [t.aula_id, t.criador_id],
      foreignColumns: [produtos_modulos_aulas.id, produtos_modulos_aulas.criador_id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({ name: "fk_produtos_modulos_aulas_legendas_enviado_por", columns: [t.enviado_por], foreignColumns: [usuarios.id] })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("uq_produtos_modulos_aulas_legendas_aula_idioma_vivo").on(t.aula_id, t.idioma).where(sql`is_deleted = false`),
    uniqueIndex("uq_produtos_modulos_aulas_legendas_chave").on(t.chave),
    check("ck_produtos_modulos_aulas_legendas_idioma", sql`idioma ~ '^[a-z]{2,3}(-([A-Z]{2}|[0-9]{3}))?$'`),
    check("ck_produtos_modulos_aulas_legendas_rotulo", sql`length(rotulo) between 1 and 40`),
    check("ck_produtos_modulos_aulas_legendas_chave", sql`chave like 'criadores/' || criador_id::text || '/legendas/%'`),
    check("ck_produtos_modulos_aulas_legendas_trechos", sql`trechos >= 1`),
    check("ck_produtos_modulos_aulas_legendas_duracao", sql`duracao_seg >= 0`),
  ],
);

export type LegendaAula = typeof produtos_modulos_aulas_legendas.$inferSelect;
