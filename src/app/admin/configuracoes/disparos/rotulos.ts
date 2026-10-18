/**
 * Código de erro do envio (RN-203: só o código vai para o registro, nunca a mensagem do SMTP) →
 * texto para o dono. Códigos do nodemailer e do Node; o desconhecido aparece cru.
 */
const ROTULO_ERRO_EMAIL: Record<string, string> = {
  EAUTH: "Falha de autenticação no servidor de e-mail",
  ENOAUTH: "Servidor de e-mail exige usuário e senha",
  EOAUTH2: "Falha na autorização OAuth2 do servidor de e-mail",
  ECONNECTION: "Não foi possível conectar ao servidor de e-mail",
  ECONNREFUSED: "O servidor de e-mail recusou a conexão",
  ECONNRESET: "A conexão com o servidor de e-mail caiu",
  ESOCKET: "A conexão com o servidor de e-mail caiu",
  ETIMEDOUT: "O servidor de e-mail não respondeu a tempo",
  EDNS: "Endereço do servidor de e-mail não encontrado",
  ENOTFOUND: "Endereço do servidor de e-mail não encontrado",
  ETLS: "Falha na conexão segura (TLS) com o servidor de e-mail",
  EENVELOPE: "Remetente ou destinatário recusado pelo servidor",
  EMESSAGE: "Mensagem recusada pelo servidor de e-mail",
  EPROTOCOL: "Resposta inesperada do servidor de e-mail",
  ESTREAM: "Falha ao montar a mensagem",
};

export const rotuloErroEmail = (codigo: string | null) =>
  !codigo ? "Erro sem código" : (ROTULO_ERRO_EMAIL[codigo] ?? `Erro não identificado (${codigo})`);
