import "server-only";
import { createHmac, hkdfSync } from "node:crypto";
import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import type { SituacaoEmail, TipoEmail } from "@/lib/db/schema/_enums";
import { emails_disparos as ed } from "@/lib/db/schema";

/**
 * Registro de disparos de e-mail (RN-203, ADR-0018 item 4). Append-only: uma linha por envio, sem
 * corpo (leva link com token) e sem o endereço em claro. A tabela não pode ser apagada pela app, então
 * guarda o MÍNIMO (LGPD): a máscara para a tela e um HMAC do endereço (chave derivada do
 * BETTER_AUTH_SECRET) para a busca exata "chegou e-mail para fulano?" — sem a chave, o HMAC não
 * vira dicionário de e-mails.
 */

/** `paulo@gmail.com` → `pa***@gm***.com`; `x@empresa.com.br` → `x***@em***.com.br`. */
export function mascararEmail(email: string): string {
  const [local = "", dominio = ""] = email.trim().toLowerCase().split("@");
  const [primeiro = "", ...resto] = dominio.split(".");
  const corta = (s: string) => `${s.slice(0, Math.min(2, Math.max(1, s.length - 1)))}***`;
  return `${corta(local)}@${corta(primeiro)}${resto.length ? `.${resto.join(".")}` : ""}`.slice(0, 120);
}

function chave(): Buffer {
  const base = process.env.BETTER_AUTH_SECRET;
  if (!base || base.length < 32) throw new Error("BETTER_AUTH_SECRET ausente ou curto.");
  return Buffer.from(hkdfSync("sha256", base, "lider-impacto", "emails:v1", 32));
}

/** HMAC-SHA256 (hex) do endereço normalizado. Mesma conta na gravação e na busca. */
export const hashDoDestinatario = (email: string) => createHmac("sha256", chave()).update(email.trim().toLowerCase()).digest("hex");

export interface Disparo {
  criadorId: string | null;
  tipo: TipoEmail;
  para: string;
  assunto: string;
  situacao: SituacaoEmail;
  /** Nome/código do erro (ex.: `EAUTH`, `ETIMEDOUT`), nunca a mensagem do SMTP. */
  erro?: string | null;
}

const TETO_MS = 3000;

/** BEST-EFFORT: nunca lança nem segura o envio mais que o teto (o e-mail é o que importa). */
export async function registrarDisparo(d: Disparo): Promise<void> {
  try {
    await Promise.race([
      db.insert(ed).values({
        criador_id: d.criadorId,
        tipo: d.tipo,
        destinatario_mascarado: mascararEmail(d.para),
        destinatario_hash: hashDoDestinatario(d.para),
        assunto: d.assunto.slice(0, 300),
        situacao: d.situacao,
        erro: d.erro?.slice(0, 200) ?? null,
      }),
      new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error(`registro demorou mais de ${TETO_MS} ms`)), TETO_MS)),
    ]);
  } catch (e) {
    console.error("CRITICAL [email] disparo não registrado:", d.tipo, d.situacao, e instanceof Error ? e.message : e);
  }
}

export interface FiltrosDisparos {
  tipo?: TipoEmail;
  situacao?: SituacaoEmail;
  /** Endereço completo (busca EXATA pelo HMAC; parte do e-mail não encontra nada, de propósito). */
  email?: string;
  pagina: number;
  porPagina: number;
}

/** Card "Disparos de e-mails" (só DONO): os do criador do HOST, mais recentes primeiro. */
export async function listarDisparos(criadorId: string, f: FiltrosDisparos) {
  const condicoes: SQL[] = [eq(ed.criador_id, criadorId)];
  if (f.tipo) condicoes.push(eq(ed.tipo, f.tipo));
  if (f.situacao) condicoes.push(eq(ed.situacao, f.situacao));
  if (f.email?.trim()) condicoes.push(eq(ed.destinatario_hash, hashDoDestinatario(f.email)));
  // Append-only: sem is_deleted (nada se exclui), por isso sem vivos().
  const linhas = await db
    .select({
      id: ed.id,
      tipo: ed.tipo,
      destinatario: ed.destinatario_mascarado,
      assunto: ed.assunto,
      situacao: ed.situacao,
      erro: ed.erro,
      quando: ed.created_at,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(ed)
    .where(and(...condicoes))
    .orderBy(desc(ed.created_at), desc(ed.id))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  // `total` (janela) vai também em cada linha: inofensivo e evita uma segunda consulta.
  return { total: linhas[0]?.total ?? 0, linhas };
}

/** Contagem por situação nos últimos `dias` (cabeçalho do card). */
export async function resumoDisparos(criadorId: string, dias = 30, agora = new Date()) {
  const desde = new Date(agora.getTime() - dias * 86_400_000);
  const linhas = await db
    .select({ situacao: ed.situacao, n: sql<number>`count(*)::int` })
    .from(ed)
    .where(and(eq(ed.criador_id, criadorId), gte(ed.created_at, desde)))
    .groupBy(ed.situacao);
  const r: Record<SituacaoEmail, number> = { ENVIADO: 0, FALHOU: 0, NAO_CONFIGURADO: 0 };
  for (const l of linhas) r[l.situacao] = l.n;
  return r;
}
