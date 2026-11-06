import "server-only";
import { createHmac, hkdfSync, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db, type Transacao } from "@/lib/db";
import { criadores_integracoes as integ, criadores_integracoes_oauth as oauth } from "@/lib/db/schema";
import { MSG_COLISAO, vivos } from "@/lib/db/soft-delete";
import { iguaisEmTempoConstante } from "../autenticidade";
import { conectarIntegracao, trocarSegredoIntegracao } from "../servico";
import { cifrarTokens, credenciaisBling, pedirToken, tokenDeAcesso } from "./api";
import { CLIENTE_ID_BLING, URL_AUTORIZAR_BLING } from "./regras";

/**
 * Conexão e autorização OAuth do Bling (ADR-0024 item 5, RN-260). O dono cria o app no Bling e cola
 * client_id + client_secret (o secret entra cifrado na conexão, como o hottok, e assina o webhook).
 * "Autorizar no Bling" leva ao `authorize` com um `state` ASSINADO e preso à sessão, à pessoa e à
 * conexão (anti-CSRF: um `code` de outra conta Bling não entra na área de ninguém). O retorno troca o
 * `code` (vale 30 s) pelos tokens e guarda os dois CIFRADOS. Nada disso volta à tela nem à trilha.
 */

const TABELA = "criadores_integracoes_oauth";
const VALIDADE_ESTADO_MS = 10 * 60_000;

function conferirClienteId(clienteId: string) {
  if (!CLIENTE_ID_BLING.test(clienteId)) throw new ErroDeNegocio("Client ID inválido: cole o valor exato do app no Bling.");
}

export async function conectarBling(tx: Transacao, p: { criadorId: string; autor: string; clienteId: string; clientSecret: string }): Promise<{ id: string; versao: Date }> {
  conferirClienteId(p.clienteId);
  const i = await conectarIntegracao(tx, { criadorId: p.criadorId, autor: p.autor, plataforma: "BLING", segredo: p.clientSecret });
  const [o] = await tx.insert(oauth).values({ criador_id: p.criadorId, integracao_id: i.id, cliente_id: p.clienteId, modified_by: p.autor }).returning({ id: oauth.id });
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "criar", tabela: TABELA, registroId: o.id, detalhes: "Cadastrou o app do Bling (falta autorizar)", dadosNovos: { cliente_id_final: p.clienteId.slice(-4) } });
  return i;
}

/** Troca client_id/secret: os tokens antigos são apagados e a conexão volta a "Falta autorizar". */
export async function trocarCredenciaisBling(tx: Transacao, p: { criadorId: string; autor: string; integracaoId: string; versao: Date; clienteId: string; clientSecret: string }): Promise<{ versao: Date }> {
  conferirClienteId(p.clienteId);
  const r = await trocarSegredoIntegracao(tx, { criadorId: p.criadorId, autor: p.autor, integracaoId: p.integracaoId, versao: p.versao, segredo: p.clientSecret });
  const [o] = await tx
    .update(oauth)
    .set({ cliente_id: p.clienteId, tokens_cifrados: null, token_expira_em: null, situacao: "AGUARDANDO", erro: null, updated_at: new Date(), modified_by: p.autor })
    .where(and(eq(oauth.integracao_id, p.integracaoId), eq(oauth.criador_id, p.criadorId), vivos(oauth)))
    .returning({ id: oauth.id });
  if (!o) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "atualizar", tabela: TABELA, registroId: o.id, detalhes: "Trocou as credenciais do app do Bling (precisa autorizar de novo)", dadosNovos: { cliente_id_final: p.clienteId.slice(-4), situacao: "AGUARDANDO" } });
  return r;
}

// ---------- state assinado ----------

function chaveDoEstado(): Buffer {
  const base = process.env.BETTER_AUTH_SECRET;
  if (!base || base.length < 32) throw new Error("BETTER_AUTH_SECRET ausente ou curto.");
  return Buffer.from(hkdfSync("sha256", base, "lider-impacto", "bling-estado:v1", 32));
}
const macDoEstado = (corpo: string, sessaoId: string, usuarioId: string) => createHmac("sha256", chaveDoEstado()).update(`${corpo}|${sessaoId}|${usuarioId}`).digest("base64url");

/** `<integração>.<expira ms>.<nonce>.<mac>`; o mac cobre também a sessão e a pessoa (que não viajam). */
export function assinarEstado(p: { integracaoId: string; sessaoId: string; usuarioId: string; agora: Date }): string {
  const corpo = `${p.integracaoId}.${p.agora.getTime() + VALIDADE_ESTADO_MS}.${randomBytes(12).toString("base64url")}`;
  return `${corpo}.${macDoEstado(corpo, p.sessaoId, p.usuarioId)}`;
}

/** Id da conexão se o state é desta sessão/pessoa e não venceu; senão `null`. */
export function conferirEstado(estado: string, p: { sessaoId: string; usuarioId: string; agora: Date }): string | null {
  const partes = estado.split(".");
  if (partes.length !== 4) return null;
  const [id, expira, nonce, mac] = partes;
  if (!iguaisEmTempoConstante(mac, macDoEstado(`${id}.${expira}.${nonce}`, p.sessaoId, p.usuarioId))) return null;
  return Number(expira) > p.agora.getTime() ? id : null;
}

/** URL do `authorize` do Bling (só para a conexão viva DESTE criador). */
export async function urlDeAutorizacao(p: { criadorId: string; integracaoId: string; sessaoId: string; usuarioId: string; agora: Date }): Promise<string> {
  const [o] = await db
    .select({ clienteId: oauth.cliente_id })
    .from(oauth)
    .innerJoin(integ, eq(integ.id, oauth.integracao_id))
    .where(and(eq(oauth.integracao_id, p.integracaoId), eq(oauth.criador_id, p.criadorId), vivos(oauth), vivos(integ)));
  if (!o) throw new ErroDeNegocio("Conexão com o Bling não encontrada. Recarregue a página.");
  const q = new URLSearchParams({ response_type: "code", client_id: o.clienteId, state: assinarEstado(p) });
  return `${URL_AUTORIZAR_BLING}?${q.toString()}`;
}

/**
 * Retorno do Bling (`?code=&state=`), na sessão do DONO: confere o state, troca o code pelos tokens
 * (Basic client_id:secret) e grava cifrado. Recusado = mensagem; nada é gravado.
 */
export async function concluirAutorizacaoBling(p: { criadorId: string; usuarioId: string; sessaoId: string; code: string; estado: string; agora: Date }): Promise<void> {
  const integracaoId = conferirEstado(p.estado, p);
  if (!integracaoId) throw new ErroDeNegocio("Autorização vencida ou de outra sessão. Clique de novo em Autorizar no Bling.");
  const c = await credenciaisBling(integracaoId);
  if (c.criadorId !== p.criadorId) throw new ErroDeNegocio("Autorização vencida ou de outra sessão. Clique de novo em Autorizar no Bling.");
  const r = await pedirToken(c, { grant_type: "authorization_code", code: p.code }, p.agora);
  if (!r.ok) throw new ErroDeNegocio(`${r.motivo} Confira o client secret e autorize de novo.`);
  if (!r.tokens.refresh) throw new ErroDeNegocio("O Bling não devolveu o refresh token. Autorize de novo.");
  await db.transaction(async (tx) => {
    const [o] = await tx
      .update(oauth)
      .set({ tokens_cifrados: cifrarTokens(integracaoId, r.tokens), token_expira_em: r.tokens.expiraEm, renovado_em: p.agora, situacao: "AUTORIZADA", erro: null, updated_at: p.agora, modified_by: p.usuarioId })
      .where(and(eq(oauth.integracao_id, integracaoId), eq(oauth.criador_id, p.criadorId), vivos(oauth)))
      .returning({ id: oauth.id });
    if (!o) throw new ErroDeNegocio("Conexão com o Bling não encontrada. Recarregue a página.");
    await registrarAuditoria(tx, { userId: p.usuarioId, criadorId: p.criadorId, acao: "atualizar", tabela: TABELA, registroId: o.id, detalhes: "Autorizou o acesso ao Bling", dadosNovos: { situacao: "AUTORIZADA" } });
  });
}

/**
 * Job diário do worker: renova o token de toda conexão AUTORIZADA (o refresh token vence em 30 dias
 * sem uso; renovar todo dia mantém a conexão viva). Falha de uma não para as outras.
 */
export async function renovarTokensBling(): Promise<{ renovadas: number; falhas: number }> {
  const linhas = await db
    .select({ integracaoId: oauth.integracao_id })
    .from(oauth)
    .innerJoin(integ, eq(integ.id, oauth.integracao_id))
    .where(and(eq(oauth.situacao, "AUTORIZADA"), vivos(oauth), vivos(integ)));
  let renovadas = 0;
  for (const l of linhas) {
    try {
      await tokenDeAcesso(l.integracaoId, true);
      renovadas++;
    } catch (e) {
      console.error("[bling] renovação diária falhou:", l.integracaoId, e instanceof Error ? e.message.slice(0, 120) : "erro");
    }
  }
  return { renovadas, falhas: linhas.length - renovadas };
}
