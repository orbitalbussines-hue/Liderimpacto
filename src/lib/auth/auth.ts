import "server-only";
import { APIError, betterAuth, type BetterAuthOptions } from "better-auth";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { CAMPOS_AUTH } from "@/lib/db/schema/_campos-auth";
import { MAX_SENHA, MIN_SENHA } from "@/lib/validators/senha";
import { depoisDaResposta } from "./depois";
import { aposRedefinirSenha } from "./eventos-senha";
import { aposCriarSessao, ajustesSeAutorizada, ERROS_DO_FUNIL, registrarFalhaDoCodigo, TETO_SESSAO_S } from "./funil-sessao";
import { CABECALHO_IP } from "./ip";
import { conferirSenha, hashDeSenha } from "./senha-kdf";
import { DIGITOS_TOTP, ehReapresentacao, PERIODO_TOTP_S } from "./totp-replay";

/**
 * Better Auth 1.7.7 + Drizzle (portado do Espaco 7, ADR-0003 deste projeto).
 *
 * SEM ROTA HTTP: nao existe `src/app/api/auth`. Login, codigo, definir senha, troca de senha,
 * cadastro do TOTP e sessoes sao Server Actions chamando `auth.api.*` no servidor, que
 * aplicam nossos tetos e guardas antes. `disabledPaths` repete os caminhos sensiveis como
 * segunda linha para o dia em que alguem montar o handler.
 *
 * COOKIE POR HOST: sem `crossSubDomainCookies`, o cookie nasce sem `Domain` e so volta ao
 * host que o criou. Cada criador (e o apex) tem a sua sessao; "um login para tudo" e a mesma
 * conta/senha em qualquer area, nao SSO. O servidor confere de novo (sessao.ts: criador_id).
 */

const EM_PRODUCAO = process.env.NODE_ENV === "production";
const COMPILANDO = process.env.NEXT_PHASE === "phase-production-build";

/** URL da PLATAFORMA (apex). A origem vem da configuracao, nunca do cabecalho do pedido. */
export const URL_PLATAFORMA = process.env.BETTER_AUTH_URL ?? "http://localhost:3011";
if (EM_PRODUCAO && !COMPILANDO && !process.env.BETTER_AUTH_URL?.startsWith("https://")) {
  throw new Error("BETTER_AUTH_URL ausente ou sem https:// (produção: https://lideresdeimpacto.com.br).");
}

/** Segredo curto derruba tudo que e assinado e cifrado (cookie, desafio, semente do TOTP). Fail-fast. */
export const MIN_SEGREDO = 32;
if ((process.env.BETTER_AUTH_SECRET ?? "").length < MIN_SEGREDO) {
  throw new Error(`BETTER_AUTH_SECRET ausente ou com menos de ${MIN_SEGREDO} caracteres. Gere com: openssl rand -base64 32`);
}

const urlBase = new URL(URL_PLATAFORMA);
/** Exportadas para o teste conferir a configuracao REAL. */
export const OPCOES_2FA = {
  issuer: "Líder de Impacto",
  totpOptions: { digits: DIGITOS_TOTP, period: PERIODO_TOTP_S },
  // Sem codigo por e-mail (`otpOptions` ausente): e-mail nao e fator (NIST 800-63B-4).
  // Codigos de recuperacao: 10, de uso unico, cifrados no banco, mostrados UMA vez.
  backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
  // O TOTP so vale depois de confirmado com um codigo.
  skipVerificationOnEnable: false,
  // Falhas do SEGUNDO fator por conta; o bloqueio da senha e o nosso (login.ts).
  accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 },
  twoFactorCookieMaxAge: 300, // 5 min para digitar o codigo depois da senha
  trustDeviceMaxAge: 0, // "confiar neste aparelho" nao existe
  schema: { user: CAMPOS_AUTH.userTwoFactor, twoFactor: CAMPOS_AUTH.twoFactor },
} satisfies Parameters<typeof twoFactor>[0];

type ContextoDoHook = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/** Dono do desafio do segundo fator aberto pela senha (cookie assinado `two_factor`). */
async function usuarioDoDesafio(ctx: ContextoDoHook): Promise<string | null> {
  const cookie = ctx.context.createAuthCookie("two_factor");
  const assinado = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!assinado) return null;
  const desafio = await ctx.context.internalAdapter.findVerificationValue(assinado);
  return desafio?.value ?? null;
}

const CAMINHOS_DO_CODIGO = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);

/** ANTES do plugin: codigo reapresentado no login e recusado aqui (la o acerto zeraria o contador). */
const antesDoEndpoint = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/two-factor/verify-totp") return;
  const usuarioId = await usuarioDoDesafio(ctx);
  const codigo = (ctx.body as { code?: unknown } | undefined)?.code;
  if (usuarioId && (await ehReapresentacao(usuarioId, codigo))) {
    await registrarFalhaDoCodigo(usuarioId, ctx, undefined, true);
    throw new APIError("UNAUTHORIZED", { message: "Código inválido." });
  }
});

/** DEPOIS: falha do codigo (TOTP ou recuperacao) vai para a trilha. */
const depoisDoEndpoint = createAuthMiddleware(async (ctx) => {
  const erro = ctx.context.returned;
  if (!isAPIError(erro) || !CAMINHOS_DO_CODIGO.has(ctx.path)) return;
  const codigo = (erro.body as { code?: string } | undefined)?.code;
  if (codigo && ERROS_DO_FUNIL.has(codigo)) return; // o funil de sessao ja registrou o motivo
  const usuarioId = await usuarioDoDesafio(ctx);
  if (usuarioId) await registrarFalhaDoCodigo(usuarioId, ctx, codigo);
});

export const opcoesAuth = {
  appName: "Líder de Impacto",
  baseURL: URL_PLATAFORMA,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [urlBase.origin, `${urlBase.protocol}//*.${urlBase.host}`],
  database: drizzleAdapter(db, { provider: "pg", schema }),

  user: {
    ...CAMPOS_AUTH.user,
    // `input: false`: nenhuma rota aceita papel/ativo no corpo da requisicao.
    additionalFields: {
      papelPlataforma: { type: "string", fieldName: "papel_plataforma", input: false, required: true, defaultValue: "NENHUM" },
      ativo: { type: "boolean", input: false, required: true, defaultValue: true },
      // Coluna NOT NULL declarada para o validador do boot. A biblioteca nunca insere usuario (sem cadastro publico).
      modifiedBy: { type: "string", fieldName: "modified_by", input: false, required: true },
    },
    changeEmail: { enabled: false },
    deleteUser: { enabled: false }, // usuario nunca e apagado: desativa
  },

  session: {
    ...CAMPOS_AUTH.session,
    additionalFields: {
      // Area onde a sessao nasceu (nulo = plataforma); gravada pelo funil a partir do HOST.
      criadorId: { type: "string", fieldName: "criador_id", input: false, required: false },
    },
    expiresIn: TETO_SESSAO_S, // teto absoluto de 12 h
    disableSessionRefresh: true, // sem isto o uso renova a sessao para sempre
    // Papel/`ativo`/vinculo/fator vem do banco a CADA requisicao: nada de cache em cookie.
    cookieCache: { enabled: false },
  },

  account: {
    ...CAMPOS_AUTH.account,
    accountLinking: { enabled: false },
    // A linha de credencial nasce por nos (recuperacao.ts), com modified_by preenchido.
    additionalFields: { modifiedBy: { type: "string", fieldName: "modified_by", input: false, required: true } },
  },
  verification: { ...CAMPOS_AUTH.verification, storeIdentifier: "hashed" },

  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // ninguem se cadastra sozinho
    autoSignIn: false,
    minPasswordLength: MIN_SENHA, // a politica inteira roda em politica-senha.ts
    maxPasswordLength: MAX_SENHA,
    password: { hash: hashDeSenha, verify: ({ hash, password }) => conferirSenha(hash, password) },
    revokeSessionsOnPasswordReset: true,
    // O link e criado por nos (recuperacao.ts: gerarLinkDeSenha), no host da area certa.
    onPasswordReset: async ({ user }) => aposRedefinirSenha(user.id),
  },

  rateLimit: {
    ...CAMPOS_AUTH.rateLimit,
    enabled: true,
    storage: "database", // o padrao e um Map em memoria: some no restart
    // A biblioteca poda `usuarios_limites` pela MAIOR janela declarada aqui; os tetos do app
    // (teto.ts) moram na mesma tabela com janelas de ate 900 s. Nao abaixe.
    window: 900,
    max: 100,
  },

  disabledPaths: [
    "/sign-in/email",
    "/sign-up/email",
    "/request-password-reset",
    "/reset-password",
    "/change-password",
    "/update-user",
    "/two-factor/enable",
    "/two-factor/disable",
    "/two-factor/get-totp-uri",
    "/two-factor/verify-totp",
    "/two-factor/verify-backup-code",
    "/two-factor/generate-backup-codes",
  ],

  // Funil UNICO de criacao de sessao (todo caminho passa aqui): funil-sessao.ts
  databaseHooks: {
    session: {
      create: {
        before: async (sessao, ctx) => {
          const ajustes = await ajustesSeAutorizada(sessao, ctx);
          return ajustes ? { data: ajustes } : false;
        },
        after: async (sessao, ctx) => aposCriarSessao(sessao, ctx),
      },
    },
  },

  hooks: { before: antesDoEndpoint, after: depoisDoEndpoint },

  advanced: {
    backgroundTasks: { handler: (tarefa: Promise<unknown>) => void depoisDaResposta(() => tarefa) },
    // O rate limit da biblioteca le o IP do MESMO cabecalho que ipDoCliente (ip.ts).
    ipAddress: { ipAddressHeaders: [CABECALHO_IP] },
    useSecureCookies: EM_PRODUCAO,
    cookiePrefix: "li",
    database: { generateId: "uuid" },
  },

  // `nextCookies` SEMPRE o ultimo.
  plugins: [twoFactor(OPCOES_2FA), nextCookies()],
} satisfies BetterAuthOptions;

export const auth = betterAuth(opcoesAuth);
