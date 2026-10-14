import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { instante } from "./_compartilhado";
import { criadores } from "./criadores";
import { usuarios } from "./usuarios";

// compliance:append-only — trilha de auditoria: nao se altera nem se exclui,
// por isso nao tem updated_at/deleted_at/is_deleted. Em producao, revogue
// UPDATE e DELETE desta tabela do usuario de banco da aplicacao.
export const auditoria = pgTable(
  "auditoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Nulo = evento ANONIMO (e-mail inexistente, teto de IP estourado): nao ha conta. */
    user_id: uuid("user_id").references(() => usuarios.id, { onDelete: "restrict", onUpdate: "restrict" }),
    /** Area onde o evento aconteceu; nulo = plataforma. */
    criador_id: uuid("criador_id").references(() => criadores.id, { onDelete: "restrict", onUpdate: "restrict" }),
    acao: text("acao").notNull(),
    tabela: text("tabela").notNull(),
    registro_id: uuid("registro_id"),
    detalhes: text("detalhes").notNull(),
    dados_anteriores: jsonb("dados_anteriores"),
    dados_novos: jsonb("dados_novos"),
    created_at: instante("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_auditoria_registro").on(t.tabela, t.registro_id),
    index("idx_auditoria_usuario").on(t.user_id),
    index("idx_auditoria_criador").on(t.criador_id, t.created_at),
  ],
);
