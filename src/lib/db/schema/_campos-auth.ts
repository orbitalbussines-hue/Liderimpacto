/**
 * De-para Better Auth -> coluna. FONTE UNICA: `src/lib/auth/auth.ts` e montado
 * a partir daqui. O Better Auth valida o schema no boot — nome divergente
 * derruba a autenticacao inteira, por isso nenhum outro arquivo redigita coluna.
 */
export const CAMPOS_AUTH = {
  user: {
    modelName: "usuarios",
    fields: {
      name: "nome",
      email: "email",
      emailVerified: "email_verificado",
      image: "imagem",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  account: {
    modelName: "usuarios_contas",
    fields: {
      userId: "usuario_id",
      accountId: "conta_id",
      providerId: "provedor_id",
      password: "senha_hash",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expira_em",
      refreshTokenExpiresAt: "refresh_token_expira_em",
      scope: "escopo",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  session: {
    modelName: "usuarios_sessoes",
    fields: {
      userId: "usuario_id",
      token: "token",
      expiresAt: "expira_em",
      ipAddress: "ip",
      userAgent: "agente",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "usuarios_verificacoes",
    fields: {
      identifier: "identificador",
      value: "valor",
      expiresAt: "expira_em",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  rateLimit: {
    modelName: "usuarios_limites",
    fields: { key: "chave", count: "contagem", lastRequest: "ultima_requisicao" },
  },
  /** Plugin `twoFactor` (TOTP + codigos de recuperacao). */
  twoFactor: {
    modelName: "usuarios_totp",
    fields: {
      userId: "usuario_id",
      secret: "segredo",
      backupCodes: "codigos_recuperacao",
      verified: "verificado",
      failedVerificationCount: "falhas_verificacao",
      lockedUntil: "bloqueado_ate",
    },
  },
  /** Campo que o plugin `twoFactor` acrescenta ao `user`. */
  userTwoFactor: { fields: { twoFactorEnabled: "two_factor_enabled" } },
} as const;
