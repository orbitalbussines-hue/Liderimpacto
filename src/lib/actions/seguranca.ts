"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { encerrarOutrasSessoes, trocarSenha } from "@/lib/auth/conta-seguranca";
import { confirmarTotp, iniciarTotp, novosCodigosDeRecuperacao } from "@/lib/auth/fatores";
import { obterSessaoDeSeguranca, type SessaoDeSeguranca } from "@/lib/auth/sessao";
import { MAX_SENHA } from "@/lib/validators/senha";

/**
 * Actions de Conta > Seguranca. O alvo e SEMPRE a sessao corrente: nenhuma recebe `userId`.
 * Aceitam a sessao provisoria (e por elas que o SUPER_ADMIN cadastra o fator).
 */

async function sessaoDeSeguranca(): Promise<SessaoDeSeguranca> {
  const s = await obterSessaoDeSeguranca();
  if (!s) throw new ErroDeNegocio("Sessão expirada. Entre novamente.");
  return s;
}

const senha = z.string().min(1, "Informe a senha.").max(MAX_SENHA);
const codigo = z.string().transform((s) => s.replace(/\s/g, "")).pipe(z.string().regex(/^\d{6}$/, "O código tem 6 dígitos."));

export async function acaoIniciarTotp(entrada: unknown) {
  return executar(async () => {
    const e = z.strictObject({ senha }).parse(entrada);
    return iniciarTotp(await sessaoDeSeguranca(), e.senha);
  });
}

/** Concluido = todas as sessoes encerradas: a tela mostra o sucesso e leva ao login. */
export async function acaoConfirmarTotp(entrada: unknown) {
  return executar(async () => {
    const e = z.strictObject({ codigo }).parse(entrada);
    const r = await confirmarTotp(await sessaoDeSeguranca(), e.codigo);
    if (!r.provisionamentoConcluido) revalidatePath("/conta/seguranca");
    return r;
  });
}

export async function acaoNovosCodigos(entrada: unknown) {
  return executar(async () => {
    const e = z.strictObject({ senha, codigo }).parse(entrada);
    return novosCodigosDeRecuperacao(await sessaoDeSeguranca(), e.senha, e.codigo);
  });
}

export async function acaoTrocarSenha(entrada: unknown) {
  return executar(async () => {
    const e = z
      .strictObject({ atual: senha, nova: z.string().max(MAX_SENHA), confirmacao: z.string().max(MAX_SENHA) })
      .refine((d) => d.nova === d.confirmacao, { message: "As senhas não conferem.", path: ["confirmacao"] })
      .parse(entrada);
    await trocarSenha(await sessaoDeSeguranca(), e.atual, e.nova);
    revalidatePath("/conta/seguranca");
    return null;
  });
}

export async function acaoEncerrarOutrasSessoes() {
  return executar(async () => {
    const s = await sessaoDeSeguranca();
    if (s.provisoria) throw new ErroDeNegocio("Conclua a configuração do segundo fator primeiro.");
    await encerrarOutrasSessoes(s);
    revalidatePath("/conta/seguranca");
    return null;
  });
}
