import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { generateRandomString } from "better-auth/crypto";
import { registrarAuditoria, registrarAuditoriaSegura } from "@/lib/audit/registrar";
import { acessoAoAlvo, alvoDosCabecalhos, criadorIdDo } from "@/lib/criador/area";
import { urlDaArea } from "@/lib/criador/host";
import { db } from "@/lib/db";
import { usuarios, usuarios_contas } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { emailConfigurado, enviarEmail } from "@/lib/email/enviar";
import { emailDefinirSenha } from "@/lib/email/mensagens";
import { marcaDaArea } from "@/lib/email/modelo";
import { auth, URL_PLATAFORMA } from "./auth";
import { depoisDaResposta } from "./depois";
import { guardarSenhaAnterior, hashAtualDaConta } from "./historico-senha";
import { agenteDe, chaveDeIp } from "./ip";
import { estourouTeto } from "./teto";

/**
 * Definir senha (primeiro acesso e redefinicao) — um caminho so: o token
 * `reset-password:<token>` -> id do usuario, consumido por `auth.api.resetPassword`.
 * O link leva o token no FRAGMENTO (`#token=`): fragmento nao vai para log de servidor,
 * proxy nem Referer. Validade: link da equipe 24 h; pedido pelo proprio e-mail 30 min.
 */

export const VALIDADE_LINK_EQUIPE_MIN = 24 * 60;
export const VALIDADE_LINK_EMAIL_MIN = 30;
export const CAMINHO_DEFINIR_SENHA = "/primeiro-acesso";

/**
 * Linha de credencial criada por nos (`conta_id` = id do usuario, senha nula). A biblioteca
 * criaria sozinha ao definir a senha, mas sem `modified_by` (NOT NULL). Idempotente.
 */
export async function garantirContaDeSenha(usuarioId: string, autorId: string): Promise<void> {
  await db
    .insert(usuarios_contas)
    .values({ usuario_id: usuarioId, conta_id: usuarioId, provedor_id: "credential", senha_hash: null, modified_by: autorId })
    .onConflictDoNothing({ target: [usuarios_contas.provedor_id, usuarios_contas.conta_id] });
}

/** Link novo invalida os anteriores (os desafios de segundo fator, de 5 min, ficam). */
async function invalidarLinksAnteriores(usuarioId: string): Promise<void> {
  const contexto = await auth.$context;
  const linhas = await contexto.adapter.findMany<{ id: string; expiresAt: Date }>({ model: "verification", where: [{ field: "value", value: usuarioId }] });
  const limite = Date.now() + 6 * 60 * 1000;
  for (const linha of linhas) {
    if (new Date(linha.expiresAt).getTime() > limite) {
      await contexto.adapter.delete({ model: "verification", where: [{ field: "id", value: linha.id }] });
    }
  }
}

export interface LinkDeSenha {
  url: string;
  expiraEm: Date;
}

/**
 * Gera o link de definir senha no HOST da area (`<slug>.<dominio>` ou o apex) e o DEVOLVE.
 * Quem gera entrega por canal privado ou ele vai por e-mail; a SENHA continua sendo escolhida
 * por quem recebe (o administrador nunca define a senha de outra pessoa). Trilha registra o
 * ATO (quem, para quem, area, validade), nunca o token. Autorizacao: link-de-senha.ts.
 */
export async function gerarLinkDeSenha(
  usuarioId: string,
  criador: { id: string; slug: string } | null,
  autor: { id: string; motivo: string } | null,
  validadeMin = VALIDADE_LINK_EQUIPE_MIN,
): Promise<LinkDeSenha> {
  const autorId = autor?.id ?? usuarioId;
  await garantirContaDeSenha(usuarioId, autorId);
  await invalidarLinksAnteriores(usuarioId);
  const expiraEm = new Date(Date.now() + validadeMin * 60_000);
  // Trilha ANTES do efeito (o link e uma porta para a conta): falhou a trilha, nao ha link.
  await registrarAuditoria(db, {
    userId: autorId,
    criadorId: criador?.id ?? null,
    acao: "senha",
    tabela: "usuarios",
    registroId: usuarioId,
    detalhes: autor
      ? `Link de definição de senha gerado pela equipe (válido até ${expiraEm.toISOString()}). Motivo: ${autor.motivo}`
      : `Link de definição de senha pedido pelo próprio usuário (válido até ${expiraEm.toISOString()})`,
  });
  const token = generateRandomString(32);
  const contexto = await auth.$context;
  await contexto.internalAdapter.createVerificationValue({ identifier: `reset-password:${token}`, value: usuarioId, expiresAt: expiraEm });
  return { url: `${urlDaArea(URL_PLATAFORMA, criador?.slug ?? null)}${CAMINHO_DEFINIR_SENHA}#token=${token}`, expiraEm };
}

/** Resposta UNICA do pedido: nao revela se o e-mail existe, se a conta esta ativa nem se tem vinculo aqui. */
export const MSG_PEDIDO_COM_EMAIL = `Se o e-mail estiver cadastrado nesta área, enviamos um link para definir a senha. Ele vale ${VALIDADE_LINK_EMAIL_MIN} minutos.`;
export const MSG_PEDIDO_SEM_EMAIL = "Peça à equipe responsável pela sua área um link para definir a senha.";
export const mensagemDoPedido = () => (emailConfigurado() ? MSG_PEDIDO_COM_EMAIL : MSG_PEDIDO_SEM_EMAIL);

/**
 * "Esqueci a senha". Teto por IP e por e-mail; so recebe quem pode entrar NESTE host
 * (vinculo ativo ou SUPER_ADMIN). Sem SMTP nada e gerado: a tela orienta a pedir o link.
 * Roda DEPOIS da resposta (quem chama usa depoisDaResposta): o tempo nao revela a conta.
 */
export async function solicitarRedefinicao(email: string, ip: string, cabecalhos: Headers): Promise<void> {
  if (!emailConfigurado()) return;
  const alvoEmail = email.toLowerCase();
  if (await estourouTeto(`senha-ip:${chaveDeIp(ip)}`, 600, 10)) return;
  if (await estourouTeto(`senha-email:${alvoEmail}`, 600, 3)) return;
  const area = await alvoDosCabecalhos(cabecalhos);
  if (!area) return;
  const [u] = await db
    .select({ id: usuarios.id, nome: usuarios.nome, ativo: usuarios.ativo, papel: usuarios.papel_plataforma })
    .from(usuarios)
    .where(and(sql`lower(${usuarios.email}) = ${alvoEmail}`, vivos(usuarios)));
  if (!u?.ativo || !(await acessoAoAlvo(u.id, u.papel, area))) return;
  // Intervalo minimo por conta-alvo: reenviar em rajada enche a caixa de quem nem pediu.
  if (await estourouTeto(`senha-intervalo:${alvoEmail}`, 60, 1)) return;
  const criador = area.tipo === "criador" ? area.criador : null;
  const link = await gerarLinkDeSenha(u.id, criador, null, VALIDADE_LINK_EMAIL_MIN);
  await registrarAuditoriaSegura({
    userId: u.id,
    criadorId: criadorIdDo(area),
    acao: "senha",
    tabela: "usuarios",
    registroId: u.id,
    detalhes: `Pedido de link para definir senha por e-mail · IP ${ip} · ${agenteDe(cabecalhos)}`,
  });
  await enviarEmail({ para: alvoEmail, tipo: "DEFINIR_SENHA", criadorId: criador?.id ?? null, ...emailDefinirSenha(marcaDaArea(criador, URL_PLATAFORMA), u.nome, link.url, VALIDADE_LINK_EMAIL_MIN) });
}

/** Teto do passo 2, cobrado ANTES de qualquer trabalho (a tela e publica). */
export const tetoDeTokenEstourou = (ip: string) => estourouTeto(`senha-token-ip:${chaveDeIp(ip)}`, 600, 20);

/** Dono do link, lido do proprio token (o mesmo identificador que a biblioteca usa). */
export async function donoDoLink(token: string): Promise<string | null> {
  try {
    const contexto = await auth.$context;
    const verificacao = await contexto.internalAdapter.findVerificationValue(`reset-password:${token}`);
    if (!verificacao || new Date(verificacao.expiresAt) < new Date()) return null;
    return verificacao.value;
  } catch {
    return null;
  }
}

/** Nome e e-mail de quem vai definir a senha: a politica recusa senha que contenha os dois. */
export async function dadosDaPessoa(usuarioId: string): Promise<{ nome?: string; email?: string }> {
  const [u] = await db.select({ nome: usuarios.nome, email: usuarios.email }).from(usuarios).where(eq(usuarios.id, usuarioId));
  return u ?? {};
}

/** Grava a senha com o token do link. `link-invalido` = expirado, ja usado ou inexistente. */
export async function redefinirSenha(token: string, senha: string, cabecalhos: Headers): Promise<"ok" | "link-invalido"> {
  const dono = await donoDoLink(token);
  if (!dono) return "link-invalido";
  const hashAntigo = await hashAtualDaConta(dono);
  try {
    await auth.api.resetPassword({ body: { token, newPassword: senha }, headers: cabecalhos });
  } catch {
    return "link-invalido";
  }
  await depoisDaResposta(() => guardarSenhaAnterior(dono, hashAntigo));
  return "ok";
}
