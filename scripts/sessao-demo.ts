/**
 * Sessão de DESENVOLVIMENTO para as contas do `seed:demo` (que não têm senha) — `npm run sessao:demo`.
 * Serve para conferir telas logadas (navegador, prints headless) sem digitar senha.
 *
 * Mesmas travas do seed:demo (NODE_ENV=production ou DATABASE_URL fora do localhost: recusa).
 * A sessão passa pelo MESMO funil das entradas reais (`ajustesSeAutorizada`: conta ativa, área do
 * host, vínculo ativo, teto de 12 h) e fica na trilha como "sessão de desenvolvimento". O cookie
 * é assinado com o BETTER_AUTH_SECRET local, como a biblioteca faria.
 *
 *   npm run sessao:demo                 # aluno e dono do criador demo, host demo.localhost:3011
 *   npm run sessao:demo -- saida.json   # também grava { aluno, dono } (nome=valor do cookie) em JSON
 */
import { createHmac, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { and, sql } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { auth } from "@/lib/auth/auth";
import { ajustesSeAutorizada } from "@/lib/auth/funil-sessao";
import { db } from "@/lib/db";
import { usuarios, usuarios_sessoes } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

const HOST = process.env.DEMO_HOST ?? "demo.localhost:3011";
const CONTAS = { aluno: "aluno@demo.local", dono: "dono@demo.local" } as const;

function exigirAmbienteDeDesenvolvimento(): void {
  if (process.env.NODE_ENV === "production") throw new Error("Recusado: NODE_ENV=production. Sessão de demonstração é só de desenvolvimento.");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente.");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) throw new Error(`Recusado: DATABASE_URL aponta para "${host}", não para o banco local.`);
  if (!/^[a-z0-9-]+\.localhost(:\d+)?$/.test(HOST)) throw new Error(`Recusado: DEMO_HOST "${HOST}" não é um host local (<criador>.localhost).`);
}

/** Abre a sessão de uma conta pelo funil e devolve `nome=valor` do cookie. */
async function abrirSessao(email: string): Promise<string> {
  const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(and(sql`lower(${usuarios.email}) = ${email}`, vivos(usuarios)));
  if (!u) throw new Error(`${email} não existe: rode antes \`npm run seed:demo\`.`);

  const cabecalhos = new Headers({ host: HOST, "x-real-ip": "127.0.0.1", "user-agent": "sessao-demo (desenvolvimento)" });
  const ajustes = await ajustesSeAutorizada({ userId: u.id, expiresAt: new Date(Date.now() + 12 * 3600_000) }, { path: "/dev/sessao-demo", headers: cabecalhos });
  if (!ajustes) throw new Error(`O funil recusou a sessão de ${email} em ${HOST} (conta inativa, sem vínculo ou criador inexistente).`);

  const token = randomBytes(24).toString("base64url");
  const [s] = await db
    .insert(usuarios_sessoes)
    .values({ token, usuario_id: u.id, criador_id: ajustes.criadorId, expira_em: ajustes.expiresAt, ip: ajustes.ipAddress, agente: "sessao-demo (desenvolvimento)" })
    .returning({ id: usuarios_sessoes.id });
  await registrarAuditoria(db, {
    userId: u.id,
    criadorId: ajustes.criadorId,
    acao: "login",
    tabela: "usuarios",
    registroId: u.id,
    detalhes: `Sessão de DESENVOLVIMENTO ${s.id} aberta por scripts/sessao-demo.ts (sem senha, só ambiente local) em ${HOST}`,
  });

  const ctx = await auth.$context;
  const assinatura = createHmac("sha256", ctx.secret).update(token).digest("base64");
  return `${ctx.authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${assinatura}`)}`;
}

async function principal() {
  exigirAmbienteDeDesenvolvimento();
  const aluno = await abrirSessao(CONTAS.aluno);
  const dono = await abrirSessao(CONTAS.dono);
  console.log(`Host: http://${HOST}  (sessão expira por inatividade em 1 h; teto 12 h)`);
  console.log(`ALUNO (${CONTAS.aluno}): ${aluno}`);
  console.log(`DONO  (${CONTAS.dono}): ${dono}`);
  console.log("No navegador: DevTools > Application > Cookies > http://" + HOST + " — crie o cookie com o nome e o valor acima.");
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ host: HOST, aluno, dono }, null, 2));
}

principal()
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error("sessao:demo falhou:", erro instanceof Error ? erro.message : erro);
    process.exit(1);
  });
