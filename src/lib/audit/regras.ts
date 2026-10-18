import type { AcaoAuditada } from "./registrar";

/**
 * Regras PURAS do visualizador da trilha (Configurações > Logs). A trilha é append-only: a tela
 * só LÊ. O que sai para a tela passa por aqui (RN-140):
 *  - `dados_anteriores`/`dados_novos` (jsonb livre) NUNCA saem — só o texto `detalhes`;
 *  - `detalhes` sai mascarado: e-mail vira `p•••@dominio`, IP perde o último bloco, e qualquer
 *    sequência longa com cara de token/hash/segredo vira "[oculto]".
 */

export const ROTULO_ACAO: Record<AcaoAuditada, string> = {
  criar: "Criou",
  atualizar: "Alterou",
  excluir: "Excluiu",
  publicar: "Publicou",
  reordenar: "Reordenou",
  login: "Entrou",
  login_recusado: "Entrada recusada",
  conta_bloqueada: "Conta bloqueada",
  logout: "Saiu",
  acesso_negado: "Acesso negado",
  senha: "Senha",
  segundo_fator: "Segundo fator",
  reproduzir: "Assistiu",
};

export const ACOES_AUDITADAS = Object.keys(ROTULO_ACAO) as AcaoAuditada[];

export const ehAcaoAuditada = (v: string | undefined): v is AcaoAuditada => !!v && (ACOES_AUDITADAS as string[]).includes(v);

/** Nome legível da tabela (entidade). Tabela sem rótulo aparece com o nome técnico. */
const ROTULO_ENTIDADE: Record<string, string> = {
  criadores: "Área",
  criadores_membros: "Membro",
  criadores_grupos: "Grupo",
  criadores_grupos_membros: "Grupos do membro",
  criadores_tags: "Tag",
  criadores_membros_tags: "Tags do membro",
  criadores_vouchers: "Voucher",
  criadores_vouchers_resgates: "Resgate de voucher",
  criadores_webhooks: "Webhook",
  criadores_webhooks_entregas: "Entrega de webhook",
  produtos_modulos_aulas_feedbacks: "Feedback de aula",
  produtos_modulos_aulas_sugestoes: "Sugestão da IA",
  criadores_membros_favoritos: "Favorito",
  criadores_membros_silenciamentos: "Silenciamento",
  criadores_canais: "Canal",
  criadores_canais_posts: "Publicação",
  criadores_canais_posts_votos: "Voto em enquete",
  criadores_comentarios: "Comentário",
  criadores_curtidas: "Curtida",
  criadores_denuncias: "Denúncia",
  criadores_trilhas: "Trilha",
  criadores_trilhas_itens: "Etapa da trilha",
  criadores_certificados_modelos: "Modelo de certificado",
  criadores_vitrines: "Vitrine",
  criadores_vitrines_versoes: "Versão da vitrine",
  usuarios: "Conta",
  arquivos: "Arquivo",
  produtos: "Produto",
  produtos_modulos: "Módulo",
  produtos_modulos_aulas: "Aula",
  produtos_modulos_aulas_materiais: "Material",
  produtos_modulos_aulas_videos: "Vídeo",
  produtos_modulos_aulas_videos_sessoes: "Reprodução",
  produtos_modulos_aulas_anotacoes: "Anotação",
  produtos_modulos_aulas_progressos: "Progresso",
  produtos_matriculas: "Matrícula",
  produtos_avaliacoes: "Avaliação",
  produtos_avaliacoes_questoes: "Questão",
  produtos_avaliacoes_tentativas: "Tentativa",
  produtos_avaliacoes_concessoes: "Tentativa extra",
  produtos_certificados: "Certificado",
  produtos_certificados_versoes: "PDF do certificado",
  criadores_assistentes: "Assistente do professor",
  criadores_assistentes_conversas: "Conversa com o assistente",
  criadores_assistentes_conversas_mensagens: "Mensagem ao assistente",
  criadores_assistentes_produtos: "Cursos do assistente",
  criadores_canais_posts_anexos: "Anexo de publicação",
  criadores_conhecimento_documentos: "Base de conhecimento",
  criadores_conhecimento_documentos_trechos: "Trecho da base",
  criadores_desafios: "Desafio",
  criadores_desafios_grupos: "Grupos do desafio",
  criadores_desafios_participacoes: "Participação em desafio",
  criadores_eventos: "Evento ao vivo",
  criadores_eventos_grupos: "Grupos do evento",
  criadores_eventos_inscricoes: "Presença em evento",
  criadores_gamificacao: "Gamificação",
  criadores_membros_atividades: "Atividade",
  criadores_membros_notificacoes: "Notificação",
  criadores_membros_pontos: "Pontos",
  produtos_modulos_aulas_legendas: "Legenda",
  produtos_modulos_aulas_videos_processamentos: "Processamento de vídeo",
  produtos_modulos_aulas_visualizacoes: "Visualização",
  usuarios_contas: "Login",
  usuarios_sessoes: "Sessão",
  usuarios_totp: "Segundo fator",
  usuarios_verificacoes: "Verificação",
}

export const rotuloEntidade = (tabela: string) => ROTULO_ENTIDADE[tabela] ?? tabela;

/** Nome de tabela aceito no filtro (formato do Postgres; a consulta ainda filtra pelo criador). */
export const ehNomeDeTabela = (v: string | undefined): v is string => !!v && /^[a-z][a-z0-9_]{0,62}$/.test(v);

const RE_EMAIL = /([A-Z0-9._%+-])[A-Z0-9._%+-]*@([A-Z0-9.-]+\.[A-Z]{2,})/gi;
const RE_IPV4 = /\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g;
const RE_IPV6 = /\b([0-9a-f]{1,4}:[0-9a-f]{1,4}):[0-9a-f:]{2,}/gi;
const RE_CHAVE_VALOR = /\b(token|senha|password|secret|segredo|codigo|code|otp)\s*[=:]\s*\S+/gi;
// 24+ caracteres sem hífen: token, hash, base64. UUID (blocos de até 12 com hífen) passa.
const RE_LONGO = /[A-Za-z0-9_+/=]{24,}/g;

/** `detalhes` pronto para a tela: sem e-mail inteiro, sem IP inteiro, sem cara de segredo. */
export function detalheSeguro(texto: string): string {
  return texto
    .replace(RE_CHAVE_VALOR, "$1=[oculto]")
    .replace(RE_EMAIL, "$1•••@$2")
    .replace(RE_IPV4, "$1.x")
    .replace(RE_IPV6, "$1:…")
    .replace(RE_LONGO, "[oculto]");
}

/** "O que era" de uma exclusão: o primeiro trecho entre aspas do detalhe (título/nome). */
export function tituloDoDetalhe(texto: string): string | null {
  return /"([^"]{1,200})"/.exec(texto)?.[1] ?? null;
}

// ---------------------------------------------------------------- cursor
// (O período dos Logs é `?de=&ate=`, lido por `lerIntervaloExplicito` de src/lib/painel/periodo.ts.)

/** Cursor da paginação (keyset por created_at desc, id desc): "<ms>_<uuid>". */
export interface CursorTrilha {
  em: Date;
  id: string;
}

export const codificarCursor = (c: CursorTrilha) => `${c.em.getTime()}_${c.id}`;

/** Cursor vem da URL: formato errado = null (volta ao início, nunca erro). */
export function lerCursor(v: string | undefined): CursorTrilha | null {
  const m = /^(\d{1,15})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(v ?? "");
  return m ? { em: new Date(Number(m[1])), id: m[2].toLowerCase() } : null;
}
