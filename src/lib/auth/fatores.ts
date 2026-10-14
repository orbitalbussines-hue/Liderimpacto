import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { renderSVG } from "uqr";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { criadorIdDo } from "@/lib/criador/area";
import { db } from "@/lib/db";
import { usuarios, usuarios_totp } from "@/lib/db/schema";
import { totpVerificadoSql } from "@/lib/db/sinais-fator";
import { auth } from "./auth";
import { avisarDono } from "./aviso";
import { senhaConfere } from "./conta-seguranca";
import { desfazerCadastroPelaMetade } from "./login";
import { exige2FA } from "./politica-fatores";
import { expirarSessoesDe, type SessaoDeSeguranca } from "./sessao";
import { estourouTeto } from "./teto";
import { conferirCodigoTotp, consumirPassoDoTotp } from "./totp-replay";

/**
 * Ciclo de vida do SEGUNDO FATOR (ADR-0003): TOTP + codigos de recuperacao, obrigatorios
 * para SUPER_ADMIN. Todo cadastro e `auth.api.*` no servidor. NAO existe aqui: desligar o
 * segundo fator, ler o segredo depois do cadastro, mostrar os codigos de novo. Trocar o
 * aplicativo: outro SUPER_ADMIN/runbook (sem passkey, a troca self-service deixaria a conta
 * aberta so com a senha no meio do caminho).
 */

// usuarios_totp e compliance:framework (a biblioteca gerencia a linha): nao tem is_deleted.
export async function estadoDoTotp(usuarioId: string): Promise<{ ativo: boolean }> {
  const [t] = await db.select({ verificado: usuarios_totp.verificado }).from(usuarios_totp).where(eq(usuarios_totp.usuario_id, usuarioId));
  return { ativo: t?.verificado === true };
}

const trilha = (s: SessaoDeSeguranca, detalhes: string, tx: Parameters<typeof registrarAuditoria>[0] = db) =>
  registrarAuditoria(tx, { userId: s.userId, criadorId: criadorIdDo(s.alvo), acao: "segundo_fator", tabela: "usuarios", registroId: s.userId, detalhes });

/** Serializa as mudancas de fator de UMA conta (duas abas, dois cliques). Trava TENTADA: quem chega em segundo e recusado. */
async function comTravaDaConta<T>(usuarioId: string, acao: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const r = await tx.execute<{ ok: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext(${usuarioId})) as ok`);
    if (!r.rows[0]?.ok) throw new ErroDeNegocio("Outra alteração de segurança desta conta está em andamento. Tente de novo.");
    return acao();
  });
}

const tetoDaConta = async (chave: string, usuarioId: string) => {
  if (await estourouTeto(`${chave}:${usuarioId}`, 600, 10)) throw new ErroDeNegocio("Muitas tentativas. Aguarde alguns minutos.");
};

export interface CadastroTotp {
  /** SVG do QR code da URI otpauth:// (renderizado no servidor). */
  qrSvg: string;
  /** Segredo em base32 para digitar a mao, mostrado SO neste momento. */
  segredo: string;
  /** 10 codigos de recuperacao, mostrados SO neste momento (cifrados no banco). */
  codigosRecuperacao: string[];
}

/**
 * Comeca o cadastro (so na sessao PROVISORIA de quem a politica obriga). A senha atual e a
 * prova de que quem esta na sessao e o dono da conta — conferida ANTES de qualquer efeito.
 */
export async function iniciarTotp(sessao: SessaoDeSeguranca, senha: string): Promise<CadastroTotp> {
  if (!sessao.provisoria || !exige2FA(sessao.papelPlataforma)) throw new ErroDeNegocio("O aplicativo autenticador já está configurado.");
  await tetoDaConta("reauth", sessao.userId);
  if (!(await senhaConfere(sessao.userId, senha))) throw new ErroDeNegocio("Senha incorreta.");
  return comTravaDaConta(sessao.userId, async () => {
    let r: { totpURI?: unknown; backupCodes?: unknown };
    try {
      r = (await auth.api.enableTwoFactor({ body: { password: senha }, headers: await headers() })) as typeof r;
    } catch {
      throw new ErroDeNegocio("Não foi possível preparar o aplicativo autenticador. Tente de novo.");
    }
    if (typeof r.totpURI !== "string" || !Array.isArray(r.backupCodes)) throw new ErroDeNegocio("Não foi possível preparar o aplicativo autenticador. Tente de novo.");
    const segredo = new URL(r.totpURI).searchParams.get("secret") ?? "";
    return { qrSvg: renderSVG(r.totpURI, { border: 1 }), segredo, codigosRecuperacao: r.backupCodes.map(String) };
  });
}

/** Confirma o primeiro codigo: so aqui o TOTP passa a valer. Fecha o provisionamento. */
export async function confirmarTotp(sessao: SessaoDeSeguranca, codigo: string): Promise<{ provisionamentoConcluido: boolean }> {
  await tetoDaConta("totp-conf", sessao.userId);
  await comTravaDaConta(sessao.userId, async () => {
    if ((await estadoDoTotp(sessao.userId)).ativo) throw new ErroDeNegocio("Não há aplicativo autenticador aguardando confirmação.");
    try {
      await auth.api.verifyTOTP({ body: { code: codigo }, headers: await headers() });
    } catch {
      await desfazerCadastroPelaMetade(sessao.userId); // o funil pode ter recusado depois de o plugin ligar a flag
      throw new ErroDeNegocio("Código incorreto. Confira o aplicativo e tente de novo.");
    }
    // O banco e a fonte da verdade.
    if (!(await estadoDoTotp(sessao.userId)).ativo) throw new ErroDeNegocio("Código incorreto. Confira o aplicativo e tente de novo.");
    await consumirPassoDoTotp(sessao.userId, codigo);
    await trilha(sessao, "Segundo fator: aplicativo autenticador e códigos de recuperação cadastrados");
  });
  await avisarDono(sessao.userId, "Um aplicativo autenticador foi cadastrado na sua conta");
  return { provisionamentoConcluido: await concluirProvisionamento(sessao) };
}

/**
 * Fecha o provisionamento quando a POLITICA esta cumprida: garante a flag e encerra TODAS as
 * sessoes na mesma transacao (nenhuma sessao aberta so com a senha vira plena) — a pessoa
 * entra de novo pelo caminho normal (senha + codigo).
 */
export async function concluirProvisionamento(sessao: SessaoDeSeguranca): Promise<boolean> {
  if (!sessao.provisoria) return false;
  return db.transaction(async (tx) => {
    const liberada = await tx
      .update(usuarios)
      .set({ two_factor_enabled: true })
      .where(and(eq(usuarios.id, sessao.userId), totpVerificadoSql))
      .returning({ id: usuarios.id });
    if (liberada.length === 0) return false;
    await trilha(sessao, "Segundo fator configurado: provisionamento concluído (sessões encerradas)", tx);
    await expirarSessoesDe(tx, sessao.userId);
    return true;
  });
}

/**
 * Novos codigos de recuperacao (os anteriores deixam de valer). Exige senha + codigo do
 * aplicativo: e a mesma prova de um login completo.
 */
export async function novosCodigosDeRecuperacao(sessao: SessaoDeSeguranca, senha: string, codigo: string): Promise<string[]> {
  if (sessao.provisoria || !(await estadoDoTotp(sessao.userId)).ativo) throw new ErroDeNegocio("Configure o aplicativo autenticador primeiro.");
  await tetoDaConta("reauth", sessao.userId);
  // O codigo so e conferido (e o passo queimado) com a senha certa.
  if (!(await senhaConfere(sessao.userId, senha)) || !(await conferirCodigoTotp(sessao.userId, codigo))) {
    throw new ErroDeNegocio("Senha ou código incorretos.");
  }
  const r = (await auth.api.generateBackupCodes({ body: { password: senha }, headers: await headers() })) as { backupCodes?: unknown };
  if (!Array.isArray(r.backupCodes)) throw new ErroDeNegocio("Não foi possível gerar os códigos. Tente de novo.");
  await trilha(sessao, "Segundo fator: novos códigos de recuperação gerados (os anteriores deixaram de valer)");
  await avisarDono(sessao.userId, "Novos códigos de recuperação foram gerados para a sua conta");
  return r.backupCodes.map(String);
}
