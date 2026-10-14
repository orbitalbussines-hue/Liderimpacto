/**
 * Apoio dos testes de integracao (PostgreSQL real). Cada teste cria os PROPRIOS dados com
 * nomes aleatorios (slug, e-mail, IP): nada depende de contagem global do banco.
 * Importar so dentro do teste (depois do _ambiente.ts).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth/auth";
import { garantirContaDeSenha } from "@/lib/auth/recuperacao";
import { hashDeSenha } from "@/lib/auth/senha-kdf";
import { db } from "@/lib/db";
import type { PapelCriador, PapelPlataforma } from "@/lib/db/schema/_enums";
import { auditoria, criadores, criadores_membros, usuarios, usuarios_contas, usuarios_totp } from "@/lib/db/schema";

export const SENHA_BOA = "cadeira azul no mezanino da praia";
const SISTEMA = randomUUID(); // autor dos registros de apoio (modified_by nao tem FK)

const sufixo = () => randomBytes(4).toString("hex");

export async function novoCriador(nome = "Criador de Teste") {
  const [c] = await db.insert(criadores).values({ slug: `t-${sufixo()}`, nome, modified_by: SISTEMA }).returning();
  return c;
}

export async function novoUsuario(opcoes: { papelPlataforma?: PapelPlataforma; senha?: string | null; ativo?: boolean } = {}) {
  const email = `pessoa-${sufixo()}@teste.local`;
  const [u] = await db
    .insert(usuarios)
    .values({ nome: "Pessoa de Teste", email, papel_plataforma: opcoes.papelPlataforma ?? "NENHUM", ativo: opcoes.ativo ?? true, modified_by: SISTEMA })
    .returning();
  await garantirContaDeSenha(u.id, SISTEMA);
  const senha = opcoes.senha === undefined ? SENHA_BOA : opcoes.senha;
  if (senha) {
    await db.update(usuarios_contas).set({ senha_hash: await hashDeSenha(senha) }).where(eq(usuarios_contas.usuario_id, u.id));
  }
  return u;
}

export async function vincular(criadorId: string, usuarioId: string, papel: PapelCriador, status: "ATIVO" | "INATIVO" = "ATIVO") {
  const [m] = await db.insert(criadores_membros).values({ criador_id: criadorId, usuario_id: usuarioId, papel, status, modified_by: SISTEMA }).returning();
  return m;
}

/** IP aleatorio por chamada: o teto por IP (12/10 min) nao vaza entre testes. */
const ipAleatorio = () => `10.${[1, 2, 3].map(() => Math.floor(Math.random() * 250) + 1).join(".")}`;

/** Cabecalhos de uma requisicao no host do criador (slug) ou no apex (null). */
export function cabecalhos(slug: string | null, extra: Record<string, string> = {}): Headers {
  return new Headers({ host: slug ? `${slug}.localhost:3011` : "localhost:3011", "x-real-ip": ipAleatorio(), "user-agent": "vitest", ...extra });
}

/** Entra pela biblioteca e devolve o cabecalho `cookie` da sessao (como o navegador mandaria). */
export async function cookieDeSessao(email: string, senha: string, h: Headers): Promise<string> {
  const r = await auth.api.signInEmail({ body: { email, password: senha }, headers: h, returnHeaders: true });
  const cookies = r.headers.getSetCookie().map((c) => c.split(";")[0]);
  const sessao = cookies.find((c) => c.includes("session_token"));
  if (!sessao) throw new Error("sem cookie de sessao");
  return sessao;
}

export async function trilhaDe(usuarioId: string) {
  return db.select().from(auditoria).where(and(eq(auditoria.user_id, usuarioId)));
}

/** Cabecalhos de uma requisicao LOGADA (host + cookie), para as actions com `next/headers` simulado. */
export async function cabecalhosLogados(email: string, slug: string | null, senha = SENHA_BOA): Promise<Headers> {
  const h = cabecalhos(slug);
  h.set("cookie", await cookieDeSessao(email, senha, cabecalhos(slug)));
  return h;
}

/**
 * SUPER_ADMIN com sessao PLENA no host: entra (sessao provisoria) e marca o TOTP como
 * confirmado direto no banco — o fluxo real do TOTP ja e coberto por login.test.ts.
 */
export async function superAdminPleno(slug: string | null = null) {
  const u = await novoUsuario({ papelPlataforma: "SUPER_ADMIN" });
  const h = await cabecalhosLogados(u.email, slug);
  await db.insert(usuarios_totp).values({ usuario_id: u.id, segredo: "teste", codigos_recuperacao: "teste", verificado: true });
  await db.update(usuarios).set({ two_factor_enabled: true }).where(eq(usuarios.id, u.id));
  return { usuario: u, h };
}
