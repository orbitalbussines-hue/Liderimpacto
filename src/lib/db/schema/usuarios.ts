import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { TEMAS } from "../../tema-constantes";
import { colunasAuditoria, instante } from "./_compartilhado";
import { PAPEIS_PLATAFORMA, listaSql } from "./_enums";

/**
 * IDENTIDADE GLOBAL (ADR-0002, "um login para tudo"): uma linha por pessoa, valendo em
 * qualquer criador. O papel em cada criador mora em `criadores_membros`. Tambem e o model
 * `user` do Better Auth (CAMPOS_AUTH). Papel e `ativo` sao lidos DAQUI a cada requisicao,
 * nunca do token. Nao existe auto-cadastro.
 */
export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    /** Sempre minusculo (quem grava normaliza); unico entre os vivos. */
    email: text("email").notNull(),
    email_verificado: boolean("email_verificado").notNull().default(false),
    imagem: text("imagem"),
    // default = MENOR privilegio: linha criada fora da rota nunca nasce SUPER_ADMIN.
    papel_plataforma: text("papel_plataforma", { enum: PAPEIS_PLATAFORMA }).notNull().default("NENHUM"),
    ativo: boolean("ativo").notNull().default(true),
    tema: text("tema", { enum: TEMAS }).notNull().default("dark"),
    // Preferencias da PESSOA (valem em qualquer criador, como o tema): passo 5.
    reproducao_automatica: boolean("reproducao_automatica").notNull().default(true),
    lembretes: boolean("lembretes").notNull().default(true),
    // Gamificação (RN-146): aparecer no ranking das áreas em que é aluno. Sair esconde do ranking, não zera pontos.
    aparecer_no_ranking: boolean("aparecer_no_ranking").notNull().default(true),
    whatsapp: text("whatsapp"),
    empresa_cargo: text("empresa_cargo"),
    ultimo_acesso_em: instante("ultimo_acesso_em"),
    // Bloqueio por CONTA (docs/seguranca-login.md): contador atomico persistido.
    falhas_login: integer("falhas_login").notNull().default(0),
    bloqueado_ate: instante("bloqueado_ate"),
    // Do plugin twoFactor: liga quando o TOTP e confirmado e faz o login por senha pedir o codigo.
    two_factor_enabled: boolean("two_factor_enabled").notNull().default(false),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_usuarios_email_vivo").on(sql`lower(${t.email})`).where(sql`is_deleted = false`),
    check("ck_usuarios_papel_plataforma", sql.raw(`papel_plataforma in (${listaSql(PAPEIS_PLATAFORMA)})`)),
    check("ck_usuarios_tema", sql.raw(`tema in (${listaSql(TEMAS)})`)),
  ],
);

export type Usuario = typeof usuarios.$inferSelect;
