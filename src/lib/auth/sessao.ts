import "server-only";
import { and, eq, gt, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { acessoAoAlvo, alvoDosCabecalhos, criadorIdDo, type Acesso, type AlvoDoHost } from "@/lib/criador/area";
import { db, type Transacao } from "@/lib/db";
import type { PapelPlataforma } from "@/lib/db/schema/_enums";
import { usuarios, usuarios_sessoes } from "@/lib/db/schema";
import { totpVerificadoSql } from "@/lib/db/sinais-fator";
import { vivos } from "@/lib/db/soft-delete";
import type { Tema } from "@/lib/tema-constantes";
import { auth } from "./auth";
import { contaProvisoria } from "./politica-fatores";

/** docs/seguranca-login.md: expiracao por inatividade (<= 1 h); o teto absoluto de 12 h e o `expiresIn`. */
export const INATIVIDADE_MS = 60 * 60 * 1000;
/** O uso e carimbado no maximo a cada 5 min (uma escrita, nao uma por requisicao). */
const CARIMBO_MS = 5 * 60 * 1000;

export interface SessaoDeSeguranca {
  userId: string;
  sessaoId: string;
  sessaoCriadaEm: Date;
  nome: string;
  email: string;
  papelPlataforma: PapelPlataforma;
  tema: Tema;
  /** A conta nao cumpre a politica de fator AGORA: so abre Conta > Seguranca. */
  provisoria: boolean;
  /** Area desta requisicao (do host) e o que a conta pode nela — lidos do banco agora. */
  alvo: AlvoDoHost;
  acesso: Acesso;
}

/** Sessao PLENA: politica de fator cumprida. */
export type SessaoAtiva = SessaoDeSeguranca & { provisoria: false };

/**
 * Encerra as sessoes VIVAS da conta (`expira_em = agora`: a biblioteca passa a recusar o
 * token). Roda dentro da transacao de quem pede (atomico com a trilha).
 */
export async function expirarSessoesDe(tx: Transacao | typeof db, usuarioId: string, excetoSessaoId?: string): Promise<void> {
  const agora = new Date();
  const daConta = and(eq(usuarios_sessoes.usuario_id, usuarioId), gt(usuarios_sessoes.expira_em, agora));
  await tx
    .update(usuarios_sessoes)
    .set({ expira_em: agora })
    .where(excetoSessaoId ? and(daConta, ne(usuarios_sessoes.id, excetoSessaoId)) : daConta);
}

/**
 * Sessao do cookie + estado da conta, do vinculo e da area lidos do BANCO a cada chamada —
 * nunca do token. Sem Next aqui: recebe os cabecalhos (o teste chama direto).
 * `null` quando: sem cookie valido, ociosa > 1 h, sessao de OUTRO host (cookie copiado),
 * conta excluida/inativa, ou a conta perdeu o acesso a esta area (vinculo inativo, criador
 * suspenso, deixou de ser SUPER_ADMIN no apex).
 * `renovar: false` le sem carimbar o uso: chamada automatica (polling do sino) nao pode manter
 * viva uma aba esquecida aberta, senao a expiracao por inatividade nunca acontece.
 */
export async function sessaoDosCabecalhos(
  h: Headers,
  { renovar = true }: { renovar?: boolean } = {},
): Promise<SessaoDeSeguranca | null> {
  const alvo = await alvoDosCabecalhos(h);
  if (!alvo) return null;
  const s = await auth.api.getSession({ headers: h });
  if (!s) return null;
  const ociosaMs = Date.now() - new Date(s.session.updatedAt).getTime();
  if (ociosaMs > INATIVIDADE_MS) {
    await db.update(usuarios_sessoes).set({ expira_em: new Date() }).where(eq(usuarios_sessoes.id, s.session.id));
    return null;
  }
  // Cookie por host (ADR-0003): a sessao so vale na area em que nasceu.
  if ((s.session.criadorId ?? null) !== criadorIdDo(alvo)) return null;
  if (renovar && ociosaMs > CARIMBO_MS) {
    await db.update(usuarios_sessoes).set({ updated_at: new Date() }).where(eq(usuarios_sessoes.id, s.session.id));
  }
  const [u] = await db
    .select({
      nome: usuarios.nome,
      email: usuarios.email,
      papel_plataforma: usuarios.papel_plataforma,
      tema: usuarios.tema,
      ativo: usuarios.ativo,
      two_factor_enabled: usuarios.two_factor_enabled,
      totp_verificado: totpVerificadoSql,
    })
    .from(usuarios)
    .where(and(eq(usuarios.id, s.user.id), vivos(usuarios)));
  if (!u || !u.ativo) return null;
  const acesso = await acessoAoAlvo(s.user.id, u.papel_plataforma, alvo);
  if (!acesso) return null;
  return {
    userId: s.user.id,
    sessaoId: s.session.id,
    sessaoCriadaEm: new Date(s.session.createdAt),
    nome: u.nome,
    email: u.email,
    papelPlataforma: u.papel_plataforma,
    tema: u.tema,
    provisoria: contaProvisoria({ papelPlataforma: u.papel_plataforma, twoFactorEnabled: u.two_factor_enabled, totpVerificado: u.totp_verificado }),
    alvo,
    acesso,
  };
}

/**
 * Sessao para as telas de SEGURANCA (Conta > Seguranca). Aceita a sessao PROVISORIA — e o
 * unico lugar que aceita. O alvo de toda acao e SEMPRE esta sessao; nenhuma recebe `userId`.
 * `cache` = uma leitura por requisicao.
 */
export const obterSessaoDeSeguranca = cache(async (): Promise<SessaoDeSeguranca | null> => sessaoDosCabecalhos(await headers()));

/** Sessao PLENA. Provisoria devolve `null`: todo o resto do sistema fica fechado para ela. */
export const obterSessao = cache(async (): Promise<SessaoAtiva | null> => {
  const s = await obterSessaoDeSeguranca();
  return s && !s.provisoria ? (s as SessaoAtiva) : null;
});
