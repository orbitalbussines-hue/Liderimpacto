import { montarEmail, type Marca } from "./modelo";

/**
 * Os textos de cada e-mail do sistema, puros: quem envia (recuperacao, primeiro acesso, aviso)
 * e a previa do /componentes/emails usam as MESMAS funcoes.
 */

export interface MensagemPronta {
  /** Nome de exibição do remetente (o endereço é sempre o EMAIL_REMETENTE). */
  remetente: string;
  assunto: string;
  html: string;
  texto: string;
}

const dataHora = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function emailDefinirSenha(marca: Marca, nome: string, url: string, validadeMin: number): MensagemPronta {
  return {
    remetente: marca.nome,
    assunto: `${marca.nome} · definir senha`,
    ...montarEmail({
      marca,
      nome,
      titulo: "Defina sua senha",
      previa: `Seu link para definir a senha vale ${validadeMin} minutos.`,
      paragrafos: [`Recebemos um pedido para definir a senha da sua conta em ${marca.nome}.`, "Use o botão abaixo para escolher uma senha nova."],
      botao: { texto: "Definir minha senha", url },
      observacao: `O link vale ${validadeMin} minutos e funciona uma única vez.`,
      motivo: `Você recebeu este e-mail porque alguém pediu para definir a senha desta conta em ${marca.nome}. Se não foi você, ignore: sua senha continua a mesma.`,
    }),
  };
}

export function emailPrimeiroAcesso(marca: Marca, nome: string, url: string, expiraEm: Date): MensagemPronta {
  return {
    remetente: marca.nome,
    assunto: `${marca.nome} · seu primeiro acesso`,
    ...montarEmail({
      marca,
      nome,
      titulo: "Seu acesso está pronto",
      previa: `Defina sua senha para entrar em ${marca.nome}.`,
      paragrafos: [`Sua conta em ${marca.nome} foi criada.`, "Para entrar pela primeira vez, escolha uma senha pessoal. Ela é só sua: ninguém da equipe tem acesso a ela."],
      botao: { texto: "Criar minha senha", url },
      observacao: `O link vale até ${dataHora(expiraEm)} (horário de Brasília) e funciona uma única vez.`,
      motivo: `Você recebeu este e-mail porque a equipe de ${marca.nome} cadastrou este endereço. Se não esperava por ele, ignore.`,
    }),
  };
}

export function emailAvisoSeguranca(marca: Marca, nome: string, oQueMudou: string, quando: Date): MensagemPronta {
  return {
    remetente: marca.nome,
    assunto: `${marca.nome} · mudança na segurança da sua conta`,
    ...montarEmail({
      marca,
      nome,
      titulo: "Mudança na segurança da sua conta",
      previa: `${oQueMudou}. Se não foi você, aja agora.`,
      paragrafos: [
        `${oQueMudou} em ${dataHora(quando)} (horário de Brasília).`,
        "Se foi você, não precisa fazer nada.",
        "Se não foi você, use “Esqueci a senha” na tela de entrada para criar uma senha nova e avise a equipe responsável pela sua área.",
      ],
      botao: { texto: "Revisar a segurança da conta", url: `${marca.url}/conta/seguranca` },
      motivo: "Você recebeu este aviso porque ele é enviado sempre que a senha ou o segundo fator da sua conta muda.",
    }),
  };
}
