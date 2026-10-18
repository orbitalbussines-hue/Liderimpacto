/**
 * Aplica as migrações Drizzle (`src/lib/db/migrations`) — passo do DEPLOY, nunca no entrypoint do app.
 *   - Compose (ADR-0015): `docker compose run --rm migrar` ANTES de subir a versão nova.
 *   - Easypanel (ADR-0016): comando de início do serviço `ferramentas`; app e workers novos esperam
 *     o schema em dia (`src/lib/db/migracoes.ts`).
 *
 *   DATABASE_URL=<papel DONO do banco> [DB_APP_USUARIO=lider_app] [SAUDE_ARQUIVO=/tmp/x] tsx scripts/db-migrar.ts
 *
 * Usa o migrator do drizzle-orm (o drizzle-kit é devDependency e não vai para a imagem). Mesma
 * tabela de controle do `drizzle-kit migrate` (`drizzle.__drizzle_migrations`): idempotente, só
 * aplica o que falta. NUNCA `drizzle-kit push`.
 *
 * TRAVA: `pg_advisory_lock` numa conexão dedicada. Dois contêineres ao mesmo tempo (deploy sem
 * downtime sobrepõe o antigo e o novo; réplica; restart) = o segundo espera o primeiro e, ao
 * entrar, não acha nada a aplicar. A trava cai sozinha se o processo morrer (é da sessão).
 *
 * Com DB_APP_USUARIO (papel da aplicação, sem DDL): concede SELECT/INSERT/UPDATE/DELETE nas tabelas e
 * uso das sequências, SELECT na tabela de controle (o `/api/saude` confere a versão do schema), e
 * REVOGA UPDATE/DELETE/TRUNCATE das tabelas append-only (trilha e razão de pontos: docs/back.md
 * "Trilha de auditoria"). Reaplicado a cada deploy (tabela nova, restore).
 *
 * Com VERSAO_IMAGEM (SHA do commit, gravado na imagem pelo CI): grava `implantacao:<sha>` no COMMENT do
 * banco, que libera o app e os workers dessa versão (`src/lib/db/migracoes.ts`, ADR-0017). No
 * li-ferramentas este script só roda depois do backup pré-deploy (deploy/easypanel/ferramentas.sh).
 *
 * Com SAUDE_ARQUIVO: grava o arquivo no fim (o healthcheck do serviço `ferramentas` olha ele,
 * scripts/worker-saude.mjs).
 */
import { writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

/** Tabelas `compliance:append-only`: a aplicação só insere e lê. */
const APPEND_ONLY = ["auditoria", "criadores_membros_pontos", "emails_disparos", "stripe_eventos"] as const;
const NOME_DE_PAPEL = /^[a-z_][a-z0-9_]{0,62}$/;
/** Chave da trava (texto fixo -> int4). Só este script a usa. */
const TRAVA = sql`hashtext('lider-impacto:migracoes')`;

async function principal() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente (papel dono do banco).");
  const papelApp = process.env.DB_APP_USUARIO?.trim();
  if (papelApp && !NOME_DE_PAPEL.test(papelApp)) throw new Error("DB_APP_USUARIO inválido.");

  // Um Client (não Pool): a trava de sessão e as migrações precisam da MESMA conexão.
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  const db = drizzle({ client: cliente });
  try {
    const [livre] = (await db.execute<{ ok: boolean }>(sql`select pg_try_advisory_lock(${TRAVA}) as ok`)).rows;
    if (!livre?.ok) {
      console.log("[migrar] outro contêiner está migrando; aguardando a trava...");
      await db.execute(sql`select pg_advisory_lock(${TRAVA})`);
    }
    await migrate(db, { migrationsFolder: "src/lib/db/migrations" });
    console.log("[migrar] migrações em dia.");
    if (papelApp) {
      // Identificador validado pela regex acima: seguro em sql.raw (GRANT não aceita parâmetro).
      await db.execute(sql.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${papelApp}`));
      await db.execute(sql.raw(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${papelApp}`));
      await db.execute(sql.raw(`REVOKE UPDATE, DELETE, TRUNCATE ON ${APPEND_ONLY.join(", ")} FROM ${papelApp}`));
      await db.execute(sql.raw(`GRANT USAGE ON SCHEMA drizzle TO ${papelApp}`));
      await db.execute(sql.raw(`GRANT SELECT ON drizzle.__drizzle_migrations TO ${papelApp}`));
      console.log(`[migrar] permissões de ${papelApp} reaplicadas (append-only: ${APPEND_ONLY.join(", ")}).`);
    }
    const versao = process.env.VERSAO_IMAGEM?.trim();
    if (versao) {
      // Mesmo texto de MARCA_IMPLANTACAO (src/lib/db/migracoes.ts). COMMENT não aceita parâmetro: escape do pg.
      const { rows } = await cliente.query<{ banco: string }>("select current_database() as banco");
      await cliente.query(`COMMENT ON DATABASE ${cliente.escapeIdentifier(rows[0].banco)} IS ${cliente.escapeLiteral(`implantacao:${versao}`)}`);
      console.log(`[migrar] versão ${versao} liberada.`);
    }
    await db.execute(sql`select pg_advisory_unlock(${TRAVA})`);
  } finally {
    await cliente.end();
  }
  const marca = process.env.SAUDE_ARQUIVO?.trim();
  if (marca) writeFileSync(marca, new Date().toISOString());
}

principal().catch((e: unknown) => {
  console.error("[migrar] falhou:", e instanceof Error ? e.message : e);
  process.exit(1);
});
