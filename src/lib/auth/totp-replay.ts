import "server-only";
import { createOTP } from "@better-auth/utils/otp";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { symmetricDecrypt } from "better-auth/crypto";
import { db } from "@/lib/db";
import { usuarios_totp } from "@/lib/db/schema";

/**
 * Anti-replay do TOTP NO BANCO (docs/seguranca-login.md, "uso unico atomico").
 *
 * O plugin do Better Auth confere o codigo e NAO lembra qual passo ja foi
 * usado: o mesmo codigo de 6 digitos entraria de novo enquanto valesse (ate
 * ~90 s com a janela de +-1 passo). Aqui o passo do codigo e gravado num UPDATE
 * condicional — zero linhas = "este passo, ou um mais novo, ja foi usado" e a
 * sessao nao nasce.
 *
 * O PASSO E O DO CODIGO, nao o do relogio: a biblioteca aceita +-1 passo.
 * Gravar o do relogio deixaria o mesmo codigo entrar de novo no passo seguinte.
 * Por isso o segredo e decifrado aqui (com a MESMA chave da biblioteca) so para
 * descobrir qual passo casou; ele nao sai desta funcao nem vai para log.
 */

/** Os mesmos valores de `totpOptions` em auth.ts. */
export const PERIODO_TOTP_S = 30;
export const DIGITOS_TOTP = 6;
/** Janela fixa de `createOTP().verify` em @better-auth/utils 0.4. */
const JANELA = 1;

const passoAgora = () => Math.floor(Date.now() / 1000 / PERIODO_TOTP_S);

async function passoDoCodigo(segredo: string, codigo: string): Promise<number | null> {
  const agora = passoAgora();
  const otp = createOTP(segredo, { digits: DIGITOS_TOTP, period: PERIODO_TOTP_S });
  for (let desvio = -JANELA; desvio <= JANELA; desvio++) {
    if ((await otp.hotp(agora + desvio)) === codigo) return agora + desvio;
  }
  return null;
}

// usuarios_totp e compliance:framework (a biblioteca gerencia a linha): nao tem is_deleted.
async function linhaDoTotp(usuarioId: string) {
  const [linha] = await db
    .select({ segredo: usuarios_totp.segredo, verificado: usuarios_totp.verificado, ultimoPasso: usuarios_totp.ultimo_passo_totp })
    .from(usuarios_totp)
    .where(eq(usuarios_totp.usuario_id, usuarioId));
  if (!linha) return null;
  const { auth } = await import("./auth"); // import tardio: auth.ts importa este modulo pelos hooks
  const contexto = await auth.$context;
  return { ...linha, segredo: await symmetricDecrypt({ key: contexto.secretConfig, data: linha.segredo }) };
}

/** UPDATE condicional: zero linhas = este passo, ou um mais novo, ja foi usado. */
async function gravarPasso(usuarioId: string, passo: number): Promise<boolean> {
  const gravado = await db
    .update(usuarios_totp)
    .set({ ultimo_passo_totp: passo })
    .where(
      and(
        eq(usuarios_totp.usuario_id, usuarioId),
        or(isNull(usuarios_totp.ultimo_passo_totp), lt(usuarios_totp.ultimo_passo_totp, passo)),
      ),
    )
    .returning({ id: usuarios_totp.id });
  return gravado.length === 1;
}

const falhou = (erro: unknown) => console.error("[auth] anti-replay de TOTP falhou:", erro instanceof Error ? erro.message : "erro");

/**
 * Funil de sessao: a biblioteca JA conferiu o codigo; aqui so se grava o passo.
 * `true` = passo inedito, gravado agora. `false` = reapresentacao, ou falha ao
 * conferir — FAIL-CLOSED: sem o banco o codigo voltaria a valer.
 */
export async function consumirPassoDoTotp(usuarioId: string, codigo: unknown): Promise<boolean> {
  try {
    const linha = await linhaDoTotp(usuarioId);
    if (!linha) return false;
    // Codigo ilegivel: grava ao menos o passo do relogio (recusa o mesmo passo).
    const passo = (typeof codigo === "string" ? await passoDoCodigo(linha.segredo, codigo) : null) ?? passoAgora();
    return await gravarPasso(usuarioId, passo);
  } catch (erro) {
    falhou(erro);
    return false;
  }
}

/**
 * Reautenticacao (step-up): confere o codigo contra o TOTP CONFIRMADO e queima
 * o passo. Fail-closed.
 */
export async function conferirCodigoTotp(usuarioId: string, codigo: string): Promise<boolean> {
  try {
    const linha = await linhaDoTotp(usuarioId);
    if (!linha?.verificado) return false;
    const passo = await passoDoCodigo(linha.segredo, codigo);
    return passo !== null && (await gravarPasso(usuarioId, passo));
  } catch (erro) {
    falhou(erro);
    return false;
  }
}

/**
 * Leitura, sem gravar: o codigo casa com um passo ja usado? Roda ANTES do
 * plugin (hooks.before em auth.ts) para a reapresentacao nao zerar o contador
 * de falhas da conta. Falhar aqui deixa passar — o funil acima continua fechado.
 */
export async function ehReapresentacao(usuarioId: string, codigo: unknown): Promise<boolean> {
  try {
    if (typeof codigo !== "string") return false;
    const linha = await linhaDoTotp(usuarioId);
    if (!linha || linha.ultimoPasso === null) return false;
    const passo = await passoDoCodigo(linha.segredo, codigo);
    return passo !== null && passo <= linha.ultimoPasso;
  } catch {
    return false;
  }
}
