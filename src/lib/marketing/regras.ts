import type { GatilhoAutomacao, SituacaoCampanha, SituacaoEnvio, SituacaoExecucao } from "@/lib/db/schema/_enums";
import type { ConteudoMarketing, PublicoCampanha } from "@/lib/db/schema/marketing";

/**
 * Regras PURAS do e-mail de marketing (ADR-0020): servidor e telas usam as mesmas. Sem banco, sem
 * segredo. O conteúdo é texto: cada linha vira um parágrafo e cada URL https vira link.
 */

export const PUBLICO_TODOS: PublicoCampanha = { grupoIds: [], tagIds: [], produtoIds: [], nuncaAcessou: false };

/** URL dentro do texto (o fim tira a pontuação que costuma colar: "veja https://x.com."). */
const RE_URL = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const PONTUACAO_FINAL = /[.,;:!?)\]}]+$/;

export function extrairUrls(texto: string): string[] {
  const achadas = (texto.match(RE_URL) ?? []).map((u) => u.replace(PONTUACAO_FINAL, ""));
  return [...new Set(achadas)];
}

/** Cada linha não vazia é um parágrafo (o modelo do e-mail escapa e espaça). */
export const paragrafosDoCorpo = (corpo: string) => corpo.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** TODAS as URLs que o e-mail pode levar (as únicas que o redirect de clique aceita assinar). */
export const urlsDoConteudo = (c: ConteudoMarketing) => [...new Set([...extrairUrls(c.corpo), ...(c.botao ? [c.botao.url] : [])])];

/** Divide o parágrafo em texto e links, na ordem (a tela de prévia e o HTML usam o mesmo corte). */
export function segmentosComLinks(paragrafo: string): ({ texto: string } | { url: string })[] {
  const partes: ({ texto: string } | { url: string })[] = [];
  let resto = 0;
  for (const m of paragrafo.matchAll(RE_URL)) {
    const url = m[0].replace(PONTUACAO_FINAL, "");
    const inicio = m.index;
    if (inicio > resto) partes.push({ texto: paragrafo.slice(resto, inicio) });
    partes.push({ url });
    resto = inicio + url.length;
  }
  if (resto < paragrafo.length) partes.push({ texto: paragrafo.slice(resto) });
  return partes;
}

/**
 * TETO de envio da plataforma (um SMTP para todas as áreas). Padrão conservador para o SMTP da
 * Hostinger: 100/hora e 1000/dia (o plano de e-mail tem teto diário por caixa e os e-mails de senha
 * saem da MESMA caixa: o teto fica abaixo do limite do plano para sobrar folga). Valor inválido = padrão.
 */
export const LIMITE_HORA_PADRAO = 100;
export const LIMITE_DIA_PADRAO = 1000;

export function limitesDeEnvio(env: Record<string, string | undefined> = process.env): { hora: number; dia: number } {
  const ler = (v: string | undefined, padrao: number) => {
    const n = Number(v);
    return v && Number.isInteger(n) && n > 0 && n <= 1_000_000 ? n : padrao;
  };
  return { hora: ler(env.EMAIL_LIMITE_HORA, LIMITE_HORA_PADRAO), dia: ler(env.EMAIL_LIMITE_DIA, LIMITE_DIA_PADRAO) };
}

/** Quanto esperar (ms) até caber mais um. `liberaEm` = quando o envio mais antigo da janela cheia sai dela. */
export function esperaDoTeto(agora: Date, liberaHoraEm: Date | null, liberaDiaEm: Date | null): number {
  const espera = Math.max(liberaHoraEm ? liberaHoraEm.getTime() - agora.getTime() : 0, liberaDiaEm ? liberaDiaEm.getTime() - agora.getTime() : 0);
  return espera > 0 ? Math.max(espera, 1000) : 0;
}

/** Referência de idempotência do "nunca acessou" (a da inatividade é `inativo:<ISO do último acesso>`). */
export const REFERENCIA_NUNCA_ACESSOU = "nunca-acessou";

export const MSG_EMAIL_DESLIGADO = "E-mail não configurado nesta plataforma.";

/** Por que um envio não saiu (vai na coluna `motivo`, curto e sem dado pessoal). */
export const MOTIVOS_ENVIO = {
  DESCADASTRADO: "Descadastrado dos e-mails desta área.",
  CANCELADA: "Campanha cancelada.",
  PAUSADA: "Automação pausada ou excluída.",
  MEMBRO: "Membro inativo ou removido.",
  SEM_PERMISSAO: "Link de acesso não permitido para esta pessoa.",
  NAO_CONFIGURADO: "E-mail não configurado na plataforma.",
} as const;

export const ROTULO_SITUACAO_CAMPANHA: Record<SituacaoCampanha, string> = {
  RASCUNHO: "Rascunho",
  AGENDADA: "Agendada",
  ENVIANDO: "Enviando",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};
export const ROTULO_SITUACAO_ENVIO: Record<SituacaoEnvio, string> = { PENDENTE: "Na fila", ENVIADO: "Enviado", FALHOU: "Falhou", IGNORADO: "Não enviado" };
export const ROTULO_SITUACAO_EXECUCAO: Record<SituacaoExecucao, string> = { AGENDADA: "Agendada", CONCLUIDA: "Executada", IGNORADA: "Ignorada", FALHOU: "Falhou" };
export const ROTULO_GATILHO: Record<GatilhoAutomacao, string> = {
  MEMBRO_CADASTRADO: "Membro cadastrado",
  MATRICULA_CRIADA: "Matrícula criada",
  AULA_CONCLUIDA: "Aula concluída",
  CURSO_CONCLUIDO: "Curso concluído",
  CERTIFICADO_EMITIDO: "Certificado emitido",
  VOUCHER_RESGATADO: "Voucher resgatado",
  INATIVIDADE: "Sem acessar há N dias",
  NUNCA_ACESSOU: "Nunca acessou após N dias",
};

/** Campanha editável (conteúdo, público, agenda) só antes de começar a sair. */
export const campanhaEditavel = (s: SituacaoCampanha) => s === "RASCUNHO" || s === "AGENDADA";
export const campanhaCancelavel = (s: SituacaoCampanha) => s === "AGENDADA" || s === "ENVIANDO";

/** Taxas para a tela (sobre os ENVIADOS; 0 envios = 0). */
export const taxa = (parte: number, enviados: number) => (enviados > 0 ? Math.round((parte / enviados) * 1000) / 10 : 0);
