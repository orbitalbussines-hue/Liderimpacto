import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria } from "./_compartilhado";
import { usuarios } from "./usuarios";

/**
 * Historico curto de senhas: guarda o HASH das ultimas senhas de cada conta para impedir
 * reuso na troca e na redefinicao. A senha em claro nunca chega aqui; o hash usa o MESMO
 * KDF do login (senha-kdf.ts). Linha antiga nao e apagada: vira historico pela ordem.
 */
export const usuarios_senhas_anteriores = pgTable(
  "usuarios_senhas_anteriores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuario_id: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict", onUpdate: "restrict" }),
    senha_hash: text("senha_hash").notNull(),
    ...colunasAuditoria,
  },
  (t) => [index("ix_usuarios_senhas_anteriores_usuario").on(t.usuario_id, t.created_at)],
);
