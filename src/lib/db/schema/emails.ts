import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { instante } from "./_compartilhado";
import { SITUACOES_EMAIL, TIPOS_EMAIL, listaSql } from "./_enums";
import { criadores } from "./criadores";

// compliance:append-only — REGISTRO de disparos de e-mail (ADR-0018 item 4, RN-203): cada envio do
// sistema vira uma linha que nunca se altera nem se exclui. Sem updated_at/deleted_at/is_deleted e
// sem modified_by (quem dispara é o sistema). NUNCA guarda o corpo (leva link com token) nem o
// endereço em claro: só a máscara (`pa***@gmail.com`) e o HMAC do endereço (busca exata).
// Em produção, o scripts/db-migrar.ts revoga UPDATE e DELETE desta tabela do papel da aplicação.
export const emails_disparos = pgTable(
  "emails_disparos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Área de onde o e-mail saiu; nulo = plataforma (apex). */
    criador_id: uuid("criador_id").references(() => criadores.id, { onDelete: "restrict", onUpdate: "restrict" }),
    tipo: text("tipo", { enum: TIPOS_EMAIL }).notNull(),
    destinatario_mascarado: text("destinatario_mascarado").notNull(),
    /** HMAC-SHA256 (hex) do endereço em minúsculas, chave derivada do BETTER_AUTH_SECRET. */
    destinatario_hash: text("destinatario_hash").notNull(),
    assunto: text("assunto").notNull(),
    situacao: text("situacao", { enum: SITUACOES_EMAIL }).notNull(),
    /** Só o NOME/código do erro (até 200), nunca a mensagem do SMTP (pode ecoar o corpo). */
    erro: text("erro"),
    created_at: instante("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ix_emails_disparos_criador").on(t.criador_id, t.created_at),
    index("ix_emails_disparos_destinatario").on(t.destinatario_hash),
    check("ck_emails_disparos_tipo", sql.raw(`tipo in (${listaSql(TIPOS_EMAIL)})`)),
    check("ck_emails_disparos_situacao", sql.raw(`situacao in (${listaSql(SITUACOES_EMAIL)})`)),
    check("ck_emails_disparos_hash", sql`destinatario_hash ~ '^[0-9a-f]{64}$'`),
    check("ck_emails_disparos_tamanhos", sql`length(destinatario_mascarado) <= 120 and length(assunto) <= 300 and (erro is null or length(erro) <= 200)`),
  ],
);

export type DisparoEmail = typeof emails_disparos.$inferSelect;
