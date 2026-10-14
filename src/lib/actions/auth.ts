"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { registrarAuditoriaSegura } from "@/lib/audit/registrar";
import { auth } from "@/lib/auth/auth";
import { depoisDaResposta } from "@/lib/auth/depois";
import { destinoSeguro } from "@/lib/auth/destino";
import { ipDoCliente } from "@/lib/auth/ip";
import { confirmarCodigoDeEntrada, MSG_CODIGO_RECUSADO, MSG_LOGIN_RECUSADO, tentarLogin } from "@/lib/auth/login";
import { recusaDaPolitica } from "@/lib/auth/politica-senha";
import { dadosDaPessoa, donoDoLink, mensagemDoPedido, redefinirSenha, solicitarRedefinicao, tetoDeTokenEstourou } from "@/lib/auth/recuperacao";
import { obterSessaoDeSeguranca } from "@/lib/auth/sessao";
import { alvoDosCabecalhos, criadorIdDo } from "@/lib/criador/area";
import { MAX_SENHA } from "@/lib/validators/senha";

/**
 * Actions PUBLICAS da entrada (sem sessao, por natureza). Cada uma tem teto proprio, valida
 * tudo com Zod e devolve a MESMA resposta para toda recusa. A area (criador ou plataforma)
 * vem sempre do host — nunca do formulario.
 */

export type EstadoForm = { erro: string } | null;

const esquemaLogin = z.strictObject({
  email: z.email().max(254),
  senha: z.string().min(1).max(MAX_SENHA),
  manterConectado: z.boolean(),
});

/** Para onde vai quem acabou de entrar: o `?de=` interno, ou o inicio da area. */
async function destinoDepoisDeEntrar(de: unknown): Promise<string> {
  const destino = destinoSeguro(de);
  if (destino !== "/") return destino;
  return (await alvoDosCabecalhos(await headers()))?.tipo === "plataforma" ? "/plataforma" : "/";
}

/** Passo 1: senha. Quem tem segundo fator segue para o codigo. */
export async function entrar(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const dados = esquemaLogin.safeParse({
    email: form.get("email"),
    senha: form.get("senha"),
    manterConectado: form.get("manterConectado") === "on",
  });
  if (!dados.success) return { erro: MSG_LOGIN_RECUSADO };
  const h = await headers();
  const r = await tentarLogin(dados.data.email, dados.data.senha, dados.data.manterConectado, ipDoCliente(h), h);
  if (!r.ok) return { erro: r.erro };
  const destino = destinoSeguro(form.get("de"));
  if (r.proximo === "codigo") redirect(destino === "/" ? "/login/verificar" : `/login/verificar?de=${encodeURIComponent(destino)}`);
  redirect(await destinoDepoisDeEntrar(form.get("de")));
}

/** Passo 2: codigo de 6 digitos do aplicativo ou um codigo de recuperacao. */
export async function verificarCodigo(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const codigo = z
    .string()
    .regex(/^(\d{6}|[A-Za-z0-9-]{8,24})$/)
    .safeParse(String(form.get("codigo") ?? "").replace(/\s/g, ""));
  if (!codigo.success) return { erro: MSG_CODIGO_RECUSADO };
  // Com sessao aberta o plugin trataria o codigo como CADASTRO: o passo 2 e so para quem nao tem sessao.
  if (await obterSessaoDeSeguranca()) return { erro: MSG_CODIGO_RECUSADO };
  const h = await headers();
  if (!(await confirmarCodigoDeEntrada(codigo.data, ipDoCliente(h), h))) return { erro: MSG_CODIGO_RECUSADO };
  redirect(await destinoDepoisDeEntrar(form.get("de")));
}

/** Sair vale tambem para a sessao provisoria. Trilha ANTES do efeito (a lib apaga a sessao). */
export async function sair() {
  const sessao = await obterSessaoDeSeguranca();
  const h = await headers();
  if (sessao) {
    await registrarAuditoriaSegura({
      userId: sessao.userId,
      criadorId: criadorIdDo(sessao.alvo),
      acao: "logout",
      tabela: "usuarios",
      registroId: sessao.userId,
      detalhes: "Saiu do sistema",
    });
  }
  await auth.api.signOut({ headers: h }).catch(() => null);
  redirect("/login");
}

/** "Esqueci a senha": resposta sempre igual, exista ou nao o e-mail. */
export async function pedirLinkDeSenha(_: { mensagem: string } | null, form: FormData): Promise<{ mensagem: string }> {
  const email = z.email().max(254).safeParse(form.get("email"));
  if (email.success) {
    const h = await headers();
    // DEPOIS da resposta: consultar a conta e mandar o e-mail aqui faria o tempo revelar se ela existe.
    await depoisDaResposta(() => solicitarRedefinicao(email.data, ipDoCliente(h), h));
  }
  return { mensagem: mensagemDoPedido() };
}

const esquemaNovaSenha = z
  .strictObject({
    token: z.string().min(10).max(200),
    senha: z.string().max(MAX_SENHA),
    confirmacao: z.string().max(MAX_SENHA),
  })
  .refine((d) => d.senha === d.confirmacao, { message: "As senhas não conferem.", path: ["confirmacao"] });

export type ResultadoNovaSenha = { ok: true } | { ok: false; erro: string; expirado?: boolean };

/** Primeiro acesso / redefinicao: grava a senha com o token do link (lido do fragmento pela tela). */
export async function definirNovaSenha(entrada: unknown): Promise<ResultadoNovaSenha> {
  const d = esquemaNovaSenha.safeParse(entrada);
  if (!d.success) return { ok: false, erro: d.error.issues[0]?.message ?? "Dados inválidos." };
  const h = await headers();
  // Teto primeiro: a action e publica e a politica consulta o servico de senhas vazadas.
  if (await tetoDeTokenEstourou(ipDoCliente(h))) return { ok: false, erro: "Muitas tentativas. Aguarde alguns minutos." };
  const dono = await donoDoLink(d.data.token);
  if (!dono) return { ok: false, erro: "Este link expirou ou já foi usado.", expirado: true };
  // Politica ANTES de consumir o token: senha fraca nao queima o link.
  const recusa = await recusaDaPolitica(d.data.senha, { usuarioId: dono, ...(await dadosDaPessoa(dono)) });
  if (recusa) return { ok: false, erro: recusa };
  if ((await redefinirSenha(d.data.token, d.data.senha, h)) === "ok") return { ok: true };
  return { ok: false, erro: "Este link expirou ou já foi usado.", expirado: true };
}
