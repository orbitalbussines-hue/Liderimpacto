import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { registrarAuditoriaSegura } from "@/lib/audit/registrar";
import { alvoDosCabecalhos, criadorIdDo } from "@/lib/criador/area";
import { db } from "@/lib/db";
import { usuarios, usuarios_contas } from "@/lib/db/schema";
import { totpVerificadoSql } from "@/lib/db/sinais-fator";
import { vivos } from "@/lib/db/soft-delete";
import { auth } from "./auth";
import { depoisDaResposta } from "./depois";
import { agenteDe, chaveDeIp } from "./ip";
import { ehHashAtual, hashDeSenha } from "./senha-kdf";
import { estourouTeto } from "./teto";

/**
 * Entrada por senha (portado do Espaco 7). Ordem: teto do IP -> conta existe, ativa e sem
 * bloqueio -> senha (Better Auth) -> funil de sessao (vinculo NESTE host) -> zera contador.
 * Toda recusa devolve a MESMA mensagem, com o mesmo custo: e-mail inexistente, senha
 * errada, conta inativa/bloqueada e "sem vinculo neste criador" sao indistinguiveis.
 */

/** Impressao do e-mail tentado: liga as tentativas sem guardar o endereco de quem nem conta tem. */
const impressaoDoEmail = (email: string) => createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 12);

export const MSG_LOGIN_RECUSADO = "E-mail ou senha inválidos.";
export const MAX_FALHAS_CONTA = 5;
export const BLOQUEIO_CONTA_MIN = 15;
/** Teto por IP. Baixo de proposito: cada tentativa custa um scrypt de 128 MiB (senha-kdf.ts). */
const TETO_IP = { janelaSeg: 600, max: 12 };

/**
 * Cadastro do TOTP que ficou pela metade (o plugin liga `two_factor_enabled` antes de a
 * sessao nascer; se o funil recusou, o TOTP ficou sem confirmar). Sem desfazer, o login
 * pediria um codigo que nao existe. Desfeito, a conta volta a provisoria e recadastra.
 */
export async function desfazerCadastroPelaMetade(usuarioId: string): Promise<boolean> {
  const desfeito = await db
    .update(usuarios)
    .set({ two_factor_enabled: false })
    .where(and(eq(usuarios.id, usuarioId), eq(usuarios.two_factor_enabled, true), sql`not ${totpVerificadoSql}`))
    .returning({ id: usuarios.id });
  return desfeito.length > 0;
}

/** Senha provada: hash em formato/custo antigo e regravado no atual. */
async function regravarHashLegado(usuarioId: string, senha: string) {
  const [conta] = await db
    .select({ id: usuarios_contas.id, hash: usuarios_contas.senha_hash })
    .from(usuarios_contas)
    .where(and(eq(usuarios_contas.usuario_id, usuarioId), eq(usuarios_contas.provedor_id, "credential"), vivos(usuarios_contas)));
  if (!conta?.hash || ehHashAtual(conta.hash)) return;
  const novo = await hashDeSenha(senha);
  await db
    .update(usuarios_contas)
    .set({ senha_hash: novo, updated_at: new Date(), modified_by: usuarioId })
    // O hash PRECISA continuar o lido: se a pessoa trocou a senha nesse meio tempo, nada muda.
    .where(and(eq(usuarios_contas.id, conta.id), eq(usuarios_contas.senha_hash, conta.hash)));
}

/** Conta a falha na CONTA de forma atomica (um UPDATE so) e bloqueia ao atingir o teto. */
async function registrarFalha(usuarioId: string, criadorId: string | null, origem: string) {
  const [u] = await db
    .update(usuarios)
    .set({
      falhas_login: sql`${usuarios.falhas_login} + 1`,
      bloqueado_ate: sql`case when ${usuarios.falhas_login} + 1 >= ${MAX_FALHAS_CONTA}
        then now() + make_interval(mins => ${BLOQUEIO_CONTA_MIN}) else ${usuarios.bloqueado_ate} end`,
    })
    .where(eq(usuarios.id, usuarioId))
    .returning({ falhas: usuarios.falhas_login });
  const bloqueou = (u?.falhas ?? 0) >= MAX_FALHAS_CONTA;
  await registrarAuditoriaSegura({
    userId: usuarioId,
    criadorId,
    acao: bloqueou ? "conta_bloqueada" : "login_recusado",
    tabela: "usuarios",
    registroId: usuarioId,
    detalhes: `${bloqueou ? `Conta bloqueada por ${BLOQUEIO_CONTA_MIN} min após ${MAX_FALHAS_CONTA} falhas` : "Senha incorreta"} · ${origem}`,
  });
}

/** E-mail inexistente: roda o MESMO KDF de uma senha errada (senao o tempo e o oraculo). */
async function custoDeVerificacao(senha: string, cabecalhos: Headers) {
  const t = Date.now();
  await auth.api.signInEmail({ body: { email: "nao-existe@invalido.local", password: senha }, headers: cabecalhos }).catch(() => null);
  observarCusto(Date.now() - t);
}

/**
 * Piso de tempo das recusas que NAO rodam o KDF (conta bloqueada ou inativa): espera ate o
 * custo MAIS CARO observado do caminho com KDF, com jitter, sem ocupar uma thread com scrypt.
 */
let custoObservadoMs = 500;
const observarCusto = (ms: number) => {
  custoObservadoMs = Math.max(ms, custoObservadoMs * 0.98);
};

async function pisoDeTempo(inicioMs: number): Promise<void> {
  const falta = custoObservadoMs - (Date.now() - inicioMs) + (Math.random() * 40 - 20);
  if (falta > 0) await new Promise((seguir) => setTimeout(seguir, falta));
}

export type ResultadoLogin = { ok: true; proximo: "codigo" | "entrar" } | { ok: false; erro: string };

/**
 * Passo 1 (senha). Senha certa NAO e entrada completa para quem tem segundo fator: a
 * biblioteca apaga a sessao da senha e abre o desafio do codigo (`proximo: "codigo"`).
 * SUPER_ADMIN sem TOTP entra com sessao PROVISORIA (so cadastra o fator).
 */
export async function tentarLogin(email: string, senha: string, manterConectado: boolean, ip: string, cabecalhos: Headers): Promise<ResultadoLogin> {
  const origem = `IP ${ip} · ${agenteDe(cabecalhos)}`;
  const criadorId = criadorIdDo(await alvoDosCabecalhos(cabecalhos));
  // Teto do IP estourado: recusa na hora (estado do IP, nao da conta).
  if (await estourouTeto(`login-ip:${chaveDeIp(ip)}`, TETO_IP.janelaSeg, TETO_IP.max)) {
    await depoisDaResposta(() =>
      registrarAuditoriaSegura({ userId: null, criadorId, acao: "login_recusado", tabela: "usuarios", registroId: null, detalhes: `Teto de tentativas do IP estourado · e-mail ${impressaoDoEmail(email)} · ${origem}` }),
    );
    return { ok: false, erro: MSG_LOGIN_RECUSADO };
  }

  const inicio = Date.now();
  const [u] = await db
    .select({ id: usuarios.id, ativo: usuarios.ativo, bloqueado_ate: usuarios.bloqueado_ate })
    .from(usuarios)
    .where(and(sql`lower(${usuarios.email}) = ${email.toLowerCase()}`, vivos(usuarios)));

  if (!u) {
    await custoDeVerificacao(senha, cabecalhos);
    await depoisDaResposta(() =>
      registrarAuditoriaSegura({ userId: null, criadorId, acao: "login_recusado", tabela: "usuarios", registroId: null, detalhes: `Tentativa com e-mail inexistente ${impressaoDoEmail(email)} · ${origem}` }),
    );
    return { ok: false, erro: MSG_LOGIN_RECUSADO };
  }
  if (!u.ativo || (u.bloqueado_ate && u.bloqueado_ate > new Date())) {
    await pisoDeTempo(inicio);
    await depoisDaResposta(() =>
      registrarAuditoriaSegura({
        userId: u.id,
        criadorId,
        acao: "login_recusado",
        tabela: "usuarios",
        registroId: u.id,
        detalhes: `${u.ativo ? "Tentativa com a conta bloqueada" : "Tentativa com a conta inativa"} · ${origem}`,
      }),
    );
    return { ok: false, erro: MSG_LOGIN_RECUSADO };
  }

  const entrarComSenha = async () => {
    const t = Date.now();
    try {
      return await auth.api.signInEmail({ body: { email, password: senha, rememberMe: manterConectado }, headers: cabecalhos });
    } finally {
      observarCusto(Date.now() - t);
    }
  };
  let resposta: unknown;
  try {
    resposta = await entrarComSenha();
  } catch (erro) {
    // Senha certa, mas o funil recusou (sem vinculo neste host, corrida com bloqueio): ele ja
    // registrou o motivo. Contar como "senha incorreta" prorrogaria o bloqueio com linha falsa.
    const recusaDoFunil = isAPIError(erro) && (erro.body as { code?: string } | undefined)?.code === "FAILED_TO_CREATE_SESSION";
    if (!recusaDoFunil) await depoisDaResposta(() => registrarFalha(u.id, criadorId, origem));
    await pisoDeTempo(inicio);
    return { ok: false, erro: MSG_LOGIN_RECUSADO };
  }

  // A senha foi provada: zera o contador de falhas DE SENHA (as do codigo sao do plugin).
  await db.update(usuarios).set({ falhas_login: 0, bloqueado_ate: null }).where(eq(usuarios.id, u.id));
  await depoisDaResposta(() => regravarHashLegado(u.id, senha));
  const pedeCodigo = (r: unknown) => (r as { twoFactorRedirect?: unknown } | null)?.twoFactorRedirect === true;
  if (pedeCodigo(resposta)) {
    // Senha aceita e ainda sem sessao: o evento que revela senha vazada quando o codigo nunca vem.
    await depoisDaResposta(() =>
      registrarAuditoriaSegura({ userId: u.id, criadorId, acao: "login_recusado", tabela: "usuarios", registroId: u.id, detalhes: `Senha aceita; aguardando o código do aplicativo · ${origem}` }),
    );
    // Raro: cadastro do TOTP pela metade. Desfeito so DEPOIS da senha provada e refeito como provisoria.
    if (await desfazerCadastroPelaMetade(u.id)) {
      try {
        resposta = await entrarComSenha();
      } catch {
        return { ok: false, erro: MSG_LOGIN_RECUSADO };
      }
    }
  }
  return { ok: true, proximo: pedeCodigo(resposta) ? "codigo" : "entrar" };
}

export const MSG_CODIGO_RECUSADO = "Código incorreto ou expirado. Confira e tente de novo.";
const TETO_CODIGO_IP = { janelaSeg: 600, max: 30 };

/**
 * Passo 2: codigo do aplicativo (6 digitos) ou codigo de recuperacao, sobre o desafio
 * aberto pela senha. Anti-replay e bloqueio rodam no funil/plugin.
 */
export async function confirmarCodigoDeEntrada(codigo: string, ip: string, cabecalhos: Headers): Promise<boolean> {
  if (await estourouTeto(`codigo-ip:${chaveDeIp(ip)}`, TETO_CODIGO_IP.janelaSeg, TETO_CODIGO_IP.max)) return false;
  try {
    // `trustDevice` NUNCA: "confiar neste aparelho" nao existe (trustDeviceMaxAge = 0).
    if (/^\d{6}$/.test(codigo)) await auth.api.verifyTOTP({ body: { code: codigo }, headers: cabecalhos });
    else await auth.api.verifyBackupCode({ body: { code: codigo }, headers: cabecalhos });
    return true;
  } catch {
    return false;
  }
}
