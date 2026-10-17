import "server-only";
import { URL_PLATAFORMA } from "@/lib/auth/auth";
import { gerarLinkDeSenha } from "@/lib/auth/recuperacao";
import type { CriadorDaRequisicao } from "@/lib/criador/area";
import { emailConfigurado, enviarEmail } from "@/lib/email/enviar";
import { emailPrimeiroAcesso } from "@/lib/email/mensagens";
import { marcaDaArea } from "@/lib/email/modelo";

/**
 * Link de PRIMEIRO ACESSO para uma conta criada NESTA mesma action (identidade nova, vinculo
 * so neste criador e papel cadastravel pelo ator): a regra de link-de-senha-regra.ts fica
 * satisfeita por construcao. Conta que ja existia NUNCA recebe link aqui — a pessoa entra com
 * a senha que ja usa (e a equipe gera pelo menu da linha, com a regra completa).
 * O link volta para a TELA uma vez; nao vai para log nem para URL.
 */

export interface LinkNaTela {
  url: string;
  expiraEm: string;
}

/** Mensagem neutra quando o e-mail ja tinha conta: nao diz onde nem com quem. */
export const MSG_CONTA_EXISTENTE =
  "Este e-mail já tem conta na plataforma: a pessoa entra com a senha que já usa. Se não lembrar, use “Esqueci a senha” ou gere um link pelo menu da linha.";

export async function linkDePrimeiroAcesso(
  usuarioId: string,
  criador: { id: string; slug: string },
  autorId: string,
  motivo: string,
): Promise<LinkNaTela> {
  const link = await gerarLinkDeSenha(usuarioId, criador, { id: autorId, motivo });
  return { url: link.url, expiraEm: link.expiraEm.toISOString() };
}

/** Com SMTP configurado, manda o link tambem por e-mail. Falha de envio nao desfaz o cadastro. */
export async function enviarPrimeiroAcesso(para: string, nome: string, criador: CriadorDaRequisicao, link: LinkNaTela): Promise<boolean> {
  if (!emailConfigurado()) return false;
  try {
    return await enviarEmail({ para, ...emailPrimeiroAcesso(marcaDaArea(criador, URL_PLATAFORMA), nome, link.url, new Date(link.expiraEm)) });
  } catch (erro) {
    // O corpo leva o token: so o tipo do erro vai para o log.
    console.error("[email] falha ao enviar o primeiro acesso:", erro instanceof Error ? erro.name : "erro");
    return false;
  }
}
