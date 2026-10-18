import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { alvoDosCabecalhos } from "@/lib/criador/area";
import { db } from "@/lib/db";
import { criadores_emails_envios as envios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { escaparHtml, urlSegura } from "@/lib/email/modelo";
import { idSchema } from "@/lib/validators/membros";
import { descadastrar } from "./descadastro";
import { aberturaValida, cliqueValido, lerTokenDescadastro } from "./tokens";

/**
 * Rotas PÚBLICAS dos e-mails de marketing (sem sessão), sempre no HOST da área (o criador vem do host
 * e tem de bater com o do envio/token). Sem Next aqui: recebem a `Request` (o teste chama direto).
 *  - `GET /api/email/abertura?e=&s=`: pixel 1×1; assinatura ruim = o mesmo GIF, sem contar.
 *  - `GET /api/email/clique?e=&u=&s=`: 302 para `u` SÓ se a assinatura (envio, URL) confere — o sistema
 *    só assina as URLs que estavam no e-mail: nada de redirect aberto. Senão 404.
 *  - `GET /api/email/descadastro?t=`: 303 para a página `/descadastro?t=` (GET nunca descadastra: robô de antivírus
 *    abre links); `POST` efetiva (o formulário da página ou o "um clique" do cliente, RFC 8058).
 */

const SEM_CACHE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const pixel = () => new Response(GIF, { status: 200, headers: { ...SEM_CACHE, "Content-Type": "image/gif" } });
const naoEncontrado = () => new Response("Link inválido.", { status: 404, headers: { ...SEM_CACHE, "Content-Type": "text/plain; charset=utf-8" } });

async function criadorDoHost(req: Request): Promise<{ id: string; nome: string } | null> {
  const alvo = await alvoDosCabecalhos(req.headers);
  return alvo?.tipo === "criador" ? alvo.criador : null;
}

/** Conta a abertura (e o clique) do envio desta área; o 1º instante fica. Não mexe em `updated_at`. */
async function contar(envioId: string, criadorId: string, clique: boolean) {
  await db
    .update(envios)
    .set({
      aberto_em: sql`coalesce(${envios.aberto_em}, now())`,
      aberturas: clique ? sql`${envios.aberturas} + (case when ${envios.aberto_em} is null then 1 else 0 end)` : sql`${envios.aberturas} + 1`,
      ...(clique ? { clicado_em: sql`coalesce(${envios.clicado_em}, now())`, cliques: sql`${envios.cliques} + 1` } : {}),
    })
    .where(and(eq(envios.id, envioId), eq(envios.criador_id, criadorId), eq(envios.situacao, "ENVIADO"), vivos(envios)));
}

export async function atenderAbertura(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const envio = idSchema.safeParse(q.get("e"));
  const criador = await criadorDoHost(req);
  if (criador && envio.success && aberturaValida(envio.data, q.get("s") ?? "")) await contar(envio.data, criador.id, false).catch(() => undefined);
  return pixel();
}

export async function atenderClique(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const envio = idSchema.safeParse(q.get("e"));
  const url = q.get("u") ?? "";
  const criador = await criadorDoHost(req);
  if (!criador || !envio.success || url.length > 2000 || !cliqueValido(envio.data, url, q.get("s") ?? "")) return naoEncontrado();
  let destino: string;
  try {
    destino = urlSegura(url);
  } catch {
    return naoEncontrado();
  }
  // O envio tem de ser DESTA área (o link nasce no host do criador do envio).
  const [doHost] = await db.select({ id: envios.id }).from(envios).where(and(eq(envios.id, envio.data), eq(envios.criador_id, criador.id), vivos(envios)));
  if (!doHost) return naoEncontrado();
  await contar(envio.data, criador.id, true).catch(() => undefined);
  return new Response(null, { status: 302, headers: { ...SEM_CACHE, Location: destino } });
}

/** Página mínima (sem script; tudo escapado). `acao` = a própria URL (o formulário faz o POST). */
export function paginaDescadastro(area: string, estado: "confirmar" | "feito" | "invalido", acao = ""): string {
  const x = escaparHtml;
  const corpo =
    estado === "confirmar"
      ? `<h1>Parar de receber e-mails de ${x(area)}?</h1><p>Você não vai mais receber campanhas e mensagens automáticas desta área. Avisos de conta (como redefinir a senha) continuam chegando.</p><form method="post" action="${x(acao)}"><button type="submit">Confirmar descadastro</button></form>`
      : estado === "feito"
        ? `<h1>Pronto.</h1><p>Você não vai mais receber campanhas e mensagens automáticas de ${x(area)}.</p>`
        : `<h1>Link inválido</h1><p>Este link de descadastro não é válido para esta área. Use o link do e-mail mais recente.</p>`;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Descadastro</title>
<style>body{margin:0;background:#f5f4ef;color:#14131a;font:16px/1.6 Arial,Helvetica,sans-serif}main{max-width:520px;margin:64px auto;padding:32px 24px;background:#fff;border:1px solid #e3e0d6;border-radius:8px}h1{font:normal 26px/1.3 Georgia,serif;margin:0 0 16px}button{font:bold 16px Arial,sans-serif;padding:12px 24px;border:0;border-radius:6px;background:#14131a;color:#fff;cursor:pointer}</style>
</head><body><main>${corpo}</main></body></html>`;
}

const html = (status: number, conteudo: string) =>
  new Response(conteudo, { status, headers: { ...SEM_CACHE, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" } });

export async function atenderDescadastro(req: Request): Promise<Response> {
  const criador = await criadorDoHost(req);
  if (!criador) return naoEncontrado();
  const u = new URL(req.url);
  const hash = lerTokenDescadastro(criador.id, u.searchParams.get("t"));
  if (!hash) return html(404, paginaDescadastro(criador.nome, "invalido"));
  if (req.method !== "POST") return html(200, paginaDescadastro(criador.nome, "confirmar", `${u.pathname}${u.search}`));
  const corpo = await req.text().catch(() => "");
  await descadastrar(criador.id, hash, /List-Unsubscribe=One-Click/i.test(corpo) ? "UM_CLIQUE" : "LINK");
  return html(200, paginaDescadastro(criador.nome, "feito"));
}
