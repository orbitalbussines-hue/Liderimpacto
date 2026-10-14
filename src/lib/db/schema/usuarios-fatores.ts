import { bigint, boolean, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { instante } from "./_compartilhado";
import { usuarios } from "./usuarios";

// compliance:framework — o plugin `twoFactor` do Better Auth sobrescreve a linha a cada
// novo cadastro. A prova do ciclo de vida fica na `auditoria`. `segredo` e
// `codigos_recuperacao` sao cifrados pela biblioteca com BETTER_AUTH_SECRET e nunca saem daqui.
// O ciclo de vida (cadastrar, trocar, novos codigos) mora em src/lib/auth/fatores.ts.
export const usuarios_totp = pgTable(
  "usuarios_totp",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuario_id: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict", onUpdate: "restrict" }),
    segredo: text("segredo").notNull(),
    codigos_recuperacao: text("codigos_recuperacao").notNull(),
    // false = cadastro iniciado e ainda nao confirmado com um codigo: nao conta como fator.
    verificado: boolean("verificado").notNull().default(false),
    falhas_verificacao: integer("falhas_verificacao").notNull().default(0),
    bloqueado_ate: instante("bloqueado_ate"),
    // Anti-replay: passo (janela de 30 s) do ultimo codigo aceito.
    ultimo_passo_totp: bigint("ultimo_passo_totp", { mode: "number" }),
    created_at: instante("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_usuarios_totp_usuario").on(t.usuario_id)],
);
