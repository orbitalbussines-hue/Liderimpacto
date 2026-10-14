/** Base de conhecimento (ADR-0014): rotas e abas, iguais na lista, no teste e no editor. */

export const ROTA_BASE = "/admin/base-de-conhecimento";

export const ABAS_BASE = [
  { rotulo: "Fontes", href: ROTA_BASE },
  { rotulo: "Testar busca", href: `${ROTA_BASE}/testar` },
] as const;

export const MSG_IA_NAO_CONFIGURADA_BASE =
  "IA não configurada: a base continua sendo montada, mas o assistente só responde quando a chave da Anthropic estiver definida no servidor.";
