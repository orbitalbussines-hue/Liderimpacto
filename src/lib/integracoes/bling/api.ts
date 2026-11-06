import "server-only";
import { and, eq } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import { criadores_integracoes as integ, criadores_integracoes_oauth as oauth } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { cifrarSegredo, decifrarSegredo } from "@/lib/webhooks/segredo";
import { aadDaIntegracao } from "../servico";
import { FOLGA_TOKEN_MS, idsDaListaDePedidos, lerPedidoBling, type PedidoLido, URL_API_BLING, URL_TOKEN_BLING, VALIDADE_TOKEN_PADRAO_S } from "./regras";

/**
 * Cliente PEQUENO da API v3 do Bling (fetch nativo, ADR-0024 item 5): troca do `code`, renovação do
 * token e as duas leituras de pedido. Tokens só em memória e CIFRADOS no banco (AAD própria). A
 * renovação trava a linha da autorização (`for update`): app (resgate) e worker não renovam juntos
 * — o refresh token pode ser rotacionado, e duas renovações em paralelo matariam a conexão.
 * Erro esperado (sem autorização, sem escopo) = `ErroDeNegocio`; rede/5xx/429 = `Error` (a fila tenta de novo).
 */

export const MSG_AUTORIZAR_BLING = "O Bling não está autorizado: em Integrações, clique em Autorizar no Bling.";
const PRAZO_MS = 10_000;
export const aadDosTokens = (integracaoId: string) => `bling-tokens:${integracaoId}`;

export interface Tokens {
  access: string;
  refresh: string;
  expiraEm: Date;
}

/** `{ a, r }` cifrado: os dois tokens numa cifra só, presa à conexão. */
export const cifrarTokens = (integracaoId: string, t: Pick<Tokens, "access" | "refresh">) => cifrarSegredo(JSON.stringify({ a: t.access, r: t.refresh }), aadDosTokens(integracaoId));
function decifrarTokens(integracaoId: string, cifra: string): { a: string; r: string } {
  return JSON.parse(decifrarSegredo(cifra, aadDosTokens(integracaoId))) as { a: string; r: string };
}

type RespostaToken = { ok: true; tokens: Tokens } | { ok: false; motivo: string };

/**
 * `POST /oauth/token` com Basic `client_id:client_secret` (nunca no corpo), `enable-jwt: 1` (o token
 * opaco foi descontinuado) e o corpo form-urlencoded. 400/401/403 = recusado (code vencido, refresh
 * inválido, credencial errada); o resto lança (transitório).
 */
export async function pedirToken(c: { clienteId: string; clientSecret: string }, corpo: Record<string, string>, agora: Date): Promise<RespostaToken> {
  const r = await fetch(URL_TOKEN_BLING, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "1.0",
      Authorization: `Basic ${Buffer.from(`${c.clienteId}:${c.clientSecret}`).toString("base64")}`,
      "enable-jwt": "1",
    },
    body: new URLSearchParams(corpo).toString(),
    signal: AbortSignal.timeout(PRAZO_MS),
  });
  if ([400, 401, 403].includes(r.status)) {
    const tipo = await r.json().then((j: { error?: { type?: unknown } | string }) => (typeof j.error === "string" ? j.error : j.error?.type)).catch(() => null);
    return { ok: false, motivo: `O Bling recusou (${r.status}${typeof tipo === "string" ? ` ${tipo.slice(0, 40)}` : ""}).` };
  }
  if (!r.ok) throw new Error(`Bling /oauth/token respondeu ${r.status}`);
  const j = (await r.json()) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  if (typeof j.access_token !== "string" || !j.access_token) throw new Error("Bling /oauth/token sem access_token");
  const segundos = typeof j.expires_in === "number" && j.expires_in > 0 ? j.expires_in : VALIDADE_TOKEN_PADRAO_S;
  return {
    ok: true,
    tokens: { access: j.access_token, refresh: typeof j.refresh_token === "string" ? j.refresh_token : "", expiraEm: new Date(agora.getTime() + segundos * 1000) },
  };
}

/** client_id + client_secret (decifrado) da conexão viva. */
export async function credenciaisBling(integracaoId: string) {
  const [c] = await db
    .select({ clienteId: oauth.cliente_id, segredo: integ.segredo_cifrado, criadorId: integ.criador_id })
    .from(oauth)
    .innerJoin(integ, eq(integ.id, oauth.integracao_id))
    .where(and(eq(oauth.integracao_id, integracaoId), vivos(oauth), vivos(integ)));
  if (!c) throw new ErroDeNegocio("Conexão com o Bling não encontrada. Recarregue a página.");
  return { clienteId: c.clienteId, clientSecret: decifrarSegredo(c.segredo, aadDaIntegracao(integracaoId)), criadorId: c.criadorId };
}

/**
 * Access token válido da conexão (renova quando faltam < 5 min, ou sempre com `forcar`). Refresh
 * recusado = REAUTORIZAR (a tela pede "Reautorizar") e `ErroDeNegocio`.
 */
export async function tokenDeAcesso(integracaoId: string, forcar = false): Promise<string> {
  const r = await db.transaction(async (tx) => {
    const [o] = await tx
      .select({ id: oauth.id, criadorId: oauth.criador_id, clienteId: oauth.cliente_id, situacao: oauth.situacao, cifra: oauth.tokens_cifrados, expiraEm: oauth.token_expira_em, segredo: integ.segredo_cifrado })
      .from(oauth)
      .innerJoin(integ, eq(integ.id, oauth.integracao_id))
      .where(and(eq(oauth.integracao_id, integracaoId), vivos(oauth), vivos(integ)))
      .for("update", { of: oauth });
    if (!o || o.situacao !== "AUTORIZADA" || !o.cifra) return { erro: MSG_AUTORIZAR_BLING };
    const atual = decifrarTokens(integracaoId, o.cifra);
    const agora = new Date();
    if (!forcar && o.expiraEm && o.expiraEm.getTime() - FOLGA_TOKEN_MS > agora.getTime()) return { access: atual.a };
    const novo = await pedirToken({ clienteId: o.clienteId, clientSecret: decifrarSegredo(o.segredo, aadDaIntegracao(integracaoId)) }, { grant_type: "refresh_token", refresh_token: atual.r }, agora);
    if (!novo.ok) {
      await tx.update(oauth).set({ situacao: "REAUTORIZAR", erro: novo.motivo, updated_at: agora }).where(eq(oauth.id, o.id));
      await registrarAuditoria(tx, { userId: null, criadorId: o.criadorId, acao: "atualizar", tabela: "criadores_integracoes_oauth", registroId: o.id, detalhes: `Renovação do token do Bling recusada: ${novo.motivo} Precisa reautorizar.`, dadosAnteriores: { situacao: "AUTORIZADA" }, dadosNovos: { situacao: "REAUTORIZAR" } });
      return { erro: MSG_AUTORIZAR_BLING };
    }
    // Sem refresh novo na resposta = o antigo continua valendo (a doc não diz se rotaciona).
    const refresh = novo.tokens.refresh || atual.r;
    await tx
      .update(oauth)
      .set({ tokens_cifrados: cifrarTokens(integracaoId, { access: novo.tokens.access, refresh }), token_expira_em: novo.tokens.expiraEm, renovado_em: agora, erro: null, updated_at: agora })
      .where(eq(oauth.id, o.id));
    return { access: novo.tokens.access };
  });
  if ("erro" in r) throw new ErroDeNegocio(r.erro);
  return r.access;
}

/** GET autenticado; 404 = `null`. 401 renova uma vez e tenta de novo. */
async function getBling(integracaoId: string, caminho: string): Promise<unknown> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const token = await tokenDeAcesso(integracaoId, tentativa > 0);
    const r = await fetch(`${URL_API_BLING}${caminho}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "enable-jwt": "1" }, signal: AbortSignal.timeout(PRAZO_MS) });
    if (r.status === 404) return null;
    if (r.ok) return r.json();
    if (r.status === 401 && tentativa === 0) continue;
    if (r.status === 401) throw new ErroDeNegocio(MSG_AUTORIZAR_BLING);
    if (r.status === 403) throw new ErroDeNegocio("O app do Bling não tem o escopo de Pedidos de Venda. Inclua o escopo no app e reautorize.");
    throw new Error(`Bling ${caminho.split("?")[0]} respondeu ${r.status}`);
  }
  return null;
}

/** Pedido completo (estado ATUAL). `null` = não existe mais no Bling. */
export async function buscarPedidoBling(integracaoId: string, pedidoId: string): Promise<PedidoLido | null> {
  const j = await getBling(integracaoId, `/pedidos/vendas/${encodeURIComponent(pedidoId)}`);
  return j === null ? null : lerPedidoBling(j);
}

/** Ids dos pedidos com aquele número do marketplace (`numerosLojas[]`). */
export async function idsPorNumeroLoja(integracaoId: string, numeroLoja: string): Promise<string[]> {
  const q = new URLSearchParams({ "numerosLojas[]": numeroLoja, pagina: "1", limite: "5" });
  return idsDaListaDePedidos(await getBling(integracaoId, `/pedidos/vendas?${q.toString()}`));
}
