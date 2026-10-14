import type { PapelPlataforma } from "@/lib/db/schema/_enums";

/**
 * POLITICA DO SEGUNDO FATOR (ADR-0003) — funcoes puras, sem banco nem Next, para o teste
 * travar a regra. Quem aplica: sessao.ts (a cada requisicao) e fatores.ts (cadastro).
 *
 * Nesta fase: TOTP + codigos de recuperacao OBRIGATORIOS so para SUPER_ADMIN (desvio
 * autorizado da regua, que pede para todos). Estender a DONO/ADMIN = mudar `exige2FA`
 * (passar a receber tambem o papel no criador) e mais nada.
 */
export const exige2FA = (papelPlataforma: PapelPlataforma): boolean => papelPlataforma === "SUPER_ADMIN";

export interface SinaisDaConta {
  papelPlataforma: PapelPlataforma;
  /** Flag do plugin: o login por senha pede o codigo. */
  twoFactorEnabled: boolean;
  /** TOTP confirmado com um codigo. So ele conta como fator. */
  totpVerificado: boolean;
}

/**
 * A sessao e PROVISORIA (so abre Conta > Seguranca, para cadastrar o fator) enquanto a conta
 * nao cumpre a politica AGORA — lida do banco a cada requisicao. Promover alguem a
 * SUPER_ADMIN sem TOTP, ou trocar o aplicativo, cai sempre no lado fechado. Os dois sinais
 * contam: divergencia (flag ligada sem TOTP confirmado, ou o contrario) e provisoria.
 */
export function contaProvisoria(c: SinaisDaConta): boolean {
  if (!exige2FA(c.papelPlataforma)) return false;
  return !c.twoFactorEnabled || !c.totpVerificado;
}
