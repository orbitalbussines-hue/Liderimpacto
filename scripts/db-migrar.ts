/**
 * Aplica as migrações Drizzle (`src/lib/db/migrations`) — passo do DEPLOY, rodado ANTES de subir a
 * versão nova (deploy/hml/implantar.sh: `docker compose run --rm migrar`). Nunca no entrypoint do app.
 *
 *   DATABASE_URL=<papel DONO do banco> [DB_APP_USUARIO=lider_app] tsx scripts/db-migrar.ts
 *
 * Usa o migrator do drizzle-orm (o drizzle-kit é devDependency e não vai para a imagem). Mesma
 * tabela de controle do `drizzle-kit migrate` (`drizzle.__drizzle_migrations`): idempotente, só
 * aplica o que falta, cada migração na sua transação. NUNCA `drizzle-kit push`.
 *
 * Com DB_APP_USUARIO (papel da aplicação, sem DDL): concede SELECT/INSERT/UPDATE/DELETE nas tabelas e
 * uso das sequências, e REVOGA UPDATE/DELETE/TRUNCATE das tabelas append-only (trilha e razão de
 * pontos: docs/back.md "Trilha de auditoria"). Reaplicado a cada deploy (tabela nova, restore).
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/** Tabelas `compliance:append-only`: a aplicação só insere e lê. */
const APPEND_ONLY = ["auditoria", "criadores_membros_pontos"] as const;
const NOME_DE_PAPEL = /^[a-z_][a-z0-9_]{0,62}$/;

async function principal() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente (papel dono do banco).");
  const papelApp = process.env.DB_APP_USUARIO?.trim();
  if (papelApp && !NOME_DE_PAPEL.test(papelApp)) throw new Error("DB_APP_USUARIO inválido.");

  const db = drizzle({ connection: { connectionString: url, max: 1 } });
  try {
    await migrate(db, { migrationsFolder: "src/lib/db/migrations" });
    console.log("[migrar] migrações em dia.");
    if (papelApp) {
      // Identificador validado pela regex acima: seguro em sql.raw (GRANT não aceita parâmetro).
      await db.execute(sql.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${papelApp}`));
      await db.execute(sql.raw(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${papelApp}`));
      await db.execute(sql.raw(`REVOKE UPDATE, DELETE, TRUNCATE ON ${APPEND_ONLY.join(", ")} FROM ${papelApp}`));
      console.log(`[migrar] permissões de ${papelApp} reaplicadas (append-only: ${APPEND_ONLY.join(", ")}).`);
    }
  } finally {
    await db.$client.end();
  }
}

principal().catch((e: unknown) => {
  console.error("[migrar] falhou:", e instanceof Error ? e.message : e);
  process.exit(1);
});
