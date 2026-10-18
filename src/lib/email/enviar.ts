import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type { TipoEmail } from "@/lib/db/schema/_enums";
import { registrarDisparo } from "./disparos";
import type { MensagemPronta } from "./mensagens";

/** Sempre multipart (html + texto), montado por `mensagens.ts` / `modelo.ts`. */
export interface Email extends MensagemPronta {
  para: string;
  /** Para o registro de disparos (RN-203): que e-mail é e de qual área saiu (nulo = plataforma). */
  tipo: TipoEmail;
  criadorId: string | null;
  /** Cabeçalhos extras montados pelo sistema (marketing: `List-Unsubscribe`, RFC 8058). */
  cabecalhos?: Record<string, string>;
}

/** Valor de cabeçalho sem quebra de linha (injeção de cabeçalho). */
const semQuebra = (c: Record<string, string> | undefined) => (c ? Object.fromEntries(Object.entries(c).map(([k, v]) => [k.replace(/[^A-Za-z0-9-]/g, ""), v.replace(/[\r\n]/g, "")])) : undefined);

/** Só o NOME/código do erro vai para o registro (a mensagem do SMTP pode ecoar o destinatário). */
const codigoDoErro = (e: unknown) => {
  const x = e as { code?: unknown; name?: unknown } | null;
  return typeof x?.code === "string" ? x.code : typeof x?.name === "string" ? x.name : "Erro";
};

/**
 * E-mail do sistema: SMTP da Hostinger (`smtp.hostinger.com`, porta 465 com TLS direto),
 * configurado SO por variavel de ambiente — nenhuma credencial no codigo.
 * Sem configuracao completa, nada sai: `emailConfigurado()` devolve false e os fluxos caem
 * no link entregue pela equipe (ADR-0003). Nunca loga o corpo (ele leva o link com token).
 */
function config() {
  const host = process.env.SMTP_HOST;
  const usuario = process.env.SMTP_USUARIO;
  const senha = process.env.SMTP_SENHA;
  const remetente = process.env.EMAIL_REMETENTE;
  if (!host || !usuario || !senha || !remetente) return null;
  const porta = Number(process.env.SMTP_PORTA ?? 465);
  return { host, porta, usuario, senha, remetente };
}

export const emailConfigurado = () => config() !== null;

let transporte: Transporter | null = null;

/**
 * `true` = entregue ao servidor SMTP; `false` = sem configuracao (nada enviado). Falha de envio lanca.
 * Todo caso (ENVIADO, FALHOU, NAO_CONFIGURADO) vira uma linha em `emails_disparos`, sem o corpo.
 */
export async function enviarEmail(e: Email): Promise<boolean> {
  const registro = { criadorId: e.criadorId, tipo: e.tipo, para: e.para, assunto: e.assunto } as const;
  const c = config();
  if (!c) {
    console.info(`[email] SMTP não configurado: "${e.assunto}" não foi enviado.`);
    await registrarDisparo({ ...registro, situacao: "NAO_CONFIGURADO" });
    return false;
  }
  transporte ??= nodemailer.createTransport({
    host: c.host,
    port: c.porta,
    secure: c.porta === 465, // 465 = TLS direto; 587 = STARTTLS (exigido abaixo)
    requireTLS: c.porta !== 465,
    auth: { user: c.usuario, pass: c.senha },
  });
  // Nome de exibicao = a area ("Area X" <nao-responda@...>); o endereco e sempre o da env.
  const endereco = /<([^>]+)>/.exec(c.remetente)?.[1] ?? c.remetente;
  const nome = e.remetente.replace(/[\r\n"<>]/g, "").trim();
  const from = nome ? { name: nome, address: endereco } : c.remetente;
  try {
    await transporte.sendMail({ from, to: e.para, subject: e.assunto, text: e.texto, html: e.html, headers: semQuebra(e.cabecalhos) });
  } catch (erro) {
    await registrarDisparo({ ...registro, situacao: "FALHOU", erro: codigoDoErro(erro) });
    throw erro;
  }
  await registrarDisparo({ ...registro, situacao: "ENVIADO" });
  return true;
}
