import "server-only";
import { and, eq } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { acessoAoAlvo, alvoDosCabecalhos, criadorIdDo } from "@/lib/criador/area";
import { db } from "@/lib/db";
import { criadores_membros, usuarios, usuarios_totp } from "@/lib/db/schema";
import { totpVerificadoSql } from "@/lib/db/sinais-fator";
import { depoisDaResposta } from "./depois";
import { agenteDe, ipDoCliente } from "./ip";
import { contaProvisoria } from "./politica-fatores";
import { consumirPassoDoTotp } from "./totp-replay";

/**
 * Funil UNICO de criacao de sessao (docs/seguranca-login.md, "isonomia dos caminhos"):
 * `databaseHooks.session.create` do Better Auth passa por TODO caminho que cria sessao —
 * senha, senha + TOTP, senha + codigo de recuperacao, troca de sessao do cadastro do TOTP.
 * Aqui mora a regra multi-criador: a sessao so nasce se a conta pode entrar NESTE host.
 */

/** Teto ABSOLUTO de vida da sessao: o mesmo `session.expiresIn` de auth.ts. */
export const TETO_SESSAO_S = 60 * 60 * 12;

interface ContextoBA {
  path?: string;
  body?: unknown;
  headers?: Headers;
}

const contexto = (ctx: unknown) => (ctx ?? {}) as ContextoBA;

/** Meio de autenticacao pelo CAMINHO que criou a sessao. */
export function meioDoCaminho(rota: string): "senha" | "senha+totp" | "senha+recuperacao" | "outro" {
  if (rota === "/sign-in/email") return "senha";
  if (rota === "/two-factor/verify-totp") return "senha+totp";
  if (rota === "/two-factor/verify-backup-code") return "senha+recuperacao";
  return "outro";
}

const ROTULO_MEIO = {
  senha: "senha",
  "senha+totp": "senha + aplicativo autenticador",
  "senha+recuperacao": "senha + código de recuperação",
  outro: "outro caminho",
} as const;

async function lerUsuario(id: string) {
  const [u] = await db
    .select({
      ativo: usuarios.ativo,
      is_deleted: usuarios.is_deleted,
      bloqueado_ate: usuarios.bloqueado_ate,
      papel_plataforma: usuarios.papel_plataforma,
      two_factor_enabled: usuarios.two_factor_enabled,
      totp_verificado: totpVerificadoSql,
    })
    .from(usuarios)
    .where(eq(usuarios.id, id));
  return u;
}

const origem = (c: ContextoBA) => `IP ${ipDoCliente(c.headers)} · ${agenteDe(c.headers)}`;

/** Recusa do funil na trilha, com motivo, meio, IP e aparelho (gravada depois da resposta). */
async function registrarRecusa(usuarioId: string, criadorId: string | null, c: ContextoBA, motivo: string) {
  await depoisDaResposta(() =>
    registrarAuditoria(db, {
      userId: usuarioId,
      criadorId,
      acao: "login_recusado",
      tabela: "usuarios",
      registroId: usuarioId,
      detalhes: `Entrada por ${ROTULO_MEIO[meioDoCaminho(c.path ?? "")]} recusada: ${motivo} · ${origem(c)}`,
    }),
  );
}

/**
 * Devolve os AJUSTES da sessao (teto, IP, area) ou `null`, que ABORTA a criacao.
 * FAIL-CLOSED: sem ler o usuario e o host, nao ha sessao.
 *  1. excluido ou inativo -> recusa;
 *  2. host que nao e area (criador inexistente/suspenso) -> recusa;
 *  3. sem acesso a esta area (plataforma: so SUPER_ADMIN; criador: vinculo ATIVO ou SUPER_ADMIN) -> recusa;
 *  4. conta bloqueada -> recusa nos caminhos de senha (o cadastro do TOTP ja tem sessao);
 *  5. `/two-factor/verify-totp` com passo de codigo ja usado -> recusa (anti-replay). Por ultimo:
 *     so queima o passo quando a sessao nasceria de fato.
 */
export async function ajustesSeAutorizada(
  sessao: { userId: string; expiresAt: Date },
  ctx: unknown,
): Promise<{ expiresAt: Date; ipAddress: string; criadorId: string | null } | null> {
  const c = contexto(ctx);
  let criadorId: string | null = null;
  try {
    const u = await lerUsuario(sessao.userId);
    if (!u) return null;
    const alvo = await alvoDosCabecalhos(c.headers);
    criadorId = criadorIdDo(alvo);
    if (u.is_deleted || !u.ativo) {
      await registrarRecusa(sessao.userId, criadorId, c, u.is_deleted ? "conta excluída" : "conta inativa");
      return null;
    }
    if (!alvo) {
      await registrarRecusa(sessao.userId, null, c, "área inexistente ou suspensa");
      return null;
    }
    if (!(await acessoAoAlvo(sessao.userId, u.papel_plataforma, alvo))) {
      await registrarRecusa(sessao.userId, criadorId, c, alvo.tipo === "plataforma" ? "plataforma é só para SUPER_ADMIN" : "sem vínculo ativo nesta área");
      return null;
    }
    const rota = c.path ?? "";
    // No cadastro, o plugin cria a sessao ANTES de marcar o TOTP como confirmado.
    const cadastroDoTotp = rota === "/two-factor/verify-totp" && !u.totp_verificado;
    const porSenha = rota === "/sign-in/email" || (rota.startsWith("/two-factor/") && !cadastroDoTotp);
    if (porSenha && u.bloqueado_ate && u.bloqueado_ate > new Date()) {
      await registrarRecusa(sessao.userId, criadorId, c, "conta bloqueada");
      return null;
    }
    if (rota === "/two-factor/verify-totp") {
      const codigo = (c.body as { code?: unknown } | undefined)?.code;
      if (!(await consumirPassoDoTotp(sessao.userId, codigo))) {
        await registrarRecusa(sessao.userId, criadorId, c, "código já usado (reapresentação)");
        return null;
      }
    }
    const teto = Date.now() + TETO_SESSAO_S * 1000;
    return {
      expiresAt: new Date(Math.min(new Date(sessao.expiresAt).getTime(), teto)),
      ipAddress: ipDoCliente(c.headers),
      criadorId,
    };
  } catch (erro) {
    console.error("[auth] funil de sessao falhou:", erro instanceof Error ? erro.message : "erro");
    return null;
  }
}

/**
 * Trilha de ENTRADA e carimbo de ultimo acesso (conta e vinculo), depois que a sessao nasceu.
 * Nao sao entrada: a sessao da senha de quem TEM segundo fator (o plugin a apaga na mesma
 * requisicao e abre o desafio do codigo) e a troca de sessao do proprio cadastro do TOTP.
 * Nunca lanca: falhar aqui nao pode derrubar a entrada.
 */
export async function aposCriarSessao(sessao: { userId: string; criadorId?: string | null }, ctx: unknown): Promise<void> {
  try {
    const c = contexto(ctx);
    const meio = meioDoCaminho(c.path ?? "");
    if (meio === "outro") return;
    const u = await lerUsuario(sessao.userId);
    if (!u) return;
    if (meio === "senha" && u.two_factor_enabled) return; // pre-2FA: nao e entrada
    if (meio === "senha+totp" && !u.totp_verificado) return; // cadastro do TOTP, nao entrada

    const criadorId = sessao.criadorId ?? null;
    const agora = new Date();
    await db.update(usuarios).set({ ultimo_acesso_em: agora, falhas_login: 0, bloqueado_ate: null }).where(eq(usuarios.id, sessao.userId));
    const vinculo = criadorId
      ? await db
          .update(criadores_membros)
          .set({ ultimo_acesso_em: agora })
          .where(and(eq(criadores_membros.usuario_id, sessao.userId), eq(criadores_membros.criador_id, criadorId), eq(criadores_membros.is_deleted, false)))
          .returning({ id: criadores_membros.id })
      : [];
    const provisoria = contaProvisoria({ papelPlataforma: u.papel_plataforma, twoFactorEnabled: u.two_factor_enabled, totpVerificado: u.totp_verificado });
    // SUPER_ADMIN entrando na area de um criador sem vinculo = acesso de suporte: fica explicito.
    const suporte = criadorId && vinculo.length === 0 ? " (SUPER_ADMIN sem vínculo: acesso de suporte)" : "";
    await registrarAuditoria(db, {
      userId: sessao.userId,
      criadorId,
      acao: "login",
      tabela: "usuarios",
      registroId: sessao.userId,
      detalhes: `Entrou por ${ROTULO_MEIO[meio]}${suporte}${provisoria ? " (sessão provisória: cadastrar o segundo fator)" : ""} · ${origem(c)}`,
    });
  } catch (erro) {
    console.error("[auth] trilha de entrada falhou:", erro instanceof Error ? erro.message : "erro");
  }
}

/** Erros em que o funil acima ja recusou (e registrou): nao duplicar a linha. */
export const ERROS_DO_FUNIL = new Set(["FAILED_TO_CREATE_SESSION", "UNABLE_TO_CREATE_SESSION"]);

const MOTIVO_DO_CODIGO: Record<string, string> = {
  INVALID_CODE: "código incorreto",
  INVALID_BACKUP_CODE: "código de recuperação incorreto",
  ACCOUNT_TEMPORARILY_LOCKED: "tentativa com o segundo fator bloqueado",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "tentativas esgotadas neste desafio",
  TOTP_NOT_ENABLED: "aplicativo autenticador não confirmado",
};

/** Codigo do segundo fator recusado no LOGIN. Quando esta falha foi a que travou, a linha e `conta_bloqueada`. */
export async function registrarFalhaDoCodigo(usuarioId: string, ctx: unknown, codigoDoErro: string | undefined, reapresentacao = false) {
  const c = contexto(ctx);
  await depoisDaResposta(async () => {
    const [totp] = await db.select({ bloqueadoAte: usuarios_totp.bloqueado_ate }).from(usuarios_totp).where(eq(usuarios_totp.usuario_id, usuarioId));
    const travouAgora = !!codigoDoErro?.startsWith("INVALID_") && !!totp?.bloqueadoAte && totp.bloqueadoAte > new Date();
    const motivo = reapresentacao ? "código já usado (reapresentação)" : (MOTIVO_DO_CODIGO[codigoDoErro ?? ""] ?? "falha na verificação");
    await registrarAuditoria(db, {
      userId: usuarioId,
      criadorId: criadorIdDo(await alvoDosCabecalhos(c.headers).catch(() => null)),
      acao: travouAgora ? "conta_bloqueada" : "login_recusado",
      tabela: "usuarios",
      registroId: usuarioId,
      detalhes: travouAgora
        ? `Segundo fator bloqueado por 15 min após 5 códigos errados · ${origem(c)}`
        : `Senha correta, código recusado: ${motivo} · ${origem(c)}`,
    });
  });
}
