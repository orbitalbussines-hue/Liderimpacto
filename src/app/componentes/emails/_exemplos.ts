import { emailAvisoSeguranca, emailDefinirSenha, emailPrimeiroAcesso, type MensagemPronta } from "@/lib/email/mensagens";
import { marcaDaArea } from "@/lib/email/modelo";

/** Dados de EXEMPLO da previa (token falso, data fixa): a mesma funcao que o envio usa. */
const URL = "https://lideresdeimpacto.com.br";
const NOME = "Mariana Albuquerque Souza";
const QUANDO = new Date("2026-10-18T14:30:00-03:00");
const TOKEN = "#token=exemplo-0000000000000000000000000000";

export const MARCAS_EXEMPLO = {
  plataforma: { rotulo: "Plataforma (dourado)", criador: null },
  clara: { rotulo: "Criador, cor clara", criador: { nome: "Ateliê Aurora", slug: "atelie-aurora", cor_marca: "#f2d16b" } },
  escura: { rotulo: "Criador, cor escura", criador: { nome: "Instituto Vinho & Café", slug: "instituto-vinho", cor_marca: "#5b1a2e" } },
} as const;
export type MarcaExemplo = keyof typeof MARCAS_EXEMPLO;

export const EMAILS_EXEMPLO = {
  "definir-senha": "Definir senha (Esqueci a senha)",
  "primeiro-acesso": "Primeiro acesso",
  "aviso-seguranca": "Aviso de segurança",
} as const;
export type EmailExemplo = keyof typeof EMAILS_EXEMPLO;

export function exemplo(email: EmailExemplo, qual: MarcaExemplo): MensagemPronta {
  const marca = marcaDaArea(MARCAS_EXEMPLO[qual].criador, URL);
  if (email === "definir-senha") return emailDefinirSenha(marca, NOME, `${marca.url}/primeiro-acesso${TOKEN}`, 30);
  if (email === "primeiro-acesso") return emailPrimeiroAcesso(marca, NOME, `${marca.url}/primeiro-acesso${TOKEN}`, new Date(QUANDO.getTime() + 24 * 3_600_000));
  return emailAvisoSeguranca(marca, NOME, "A senha da sua conta foi trocada", QUANDO);
}
