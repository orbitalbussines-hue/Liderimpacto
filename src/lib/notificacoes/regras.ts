import type { TipoNotificacao } from "@/lib/db/schema/_enums";
import type { DadosNotificacao } from "@/lib/db/schema/comunidade-moderacao";
import { quandoDoEvento, ROTA_EVENTOS } from "@/lib/eventos/regras";

/**
 * Regras PURAS das notificações (RN-134): texto e link de cada tipo saem DAQUI na hora de ler —
 * o banco guarda só ids e rótulos curtos, então mudar a frase não exige migrar dados.
 */

/** Retenção: depois disto a notificação é arquivada (nunca apagada) e some da lista. */
export const RETENCAO_DIAS = 90;
/** O sino mostra "99+" a partir daqui (o contador para de contar: consulta barata). */
export const TETO_CONTADOR = 99;
/** Intervalo sugerido do polling do sino. */
export const INTERVALO_POLLING_MS = 60_000;

export interface NotificacaoParaTexto {
  tipo: TipoNotificacao;
  dados: DadosNotificacao;
  total: number;
}

const aspas = (t: string | undefined) => `"${t ?? ""}"`;
const canal = (d: DadosNotificacao) => (d.canalNome ? ` em #${d.canalNome}` : "");

export function textoDaNotificacao(n: NotificacaoParaTexto): string {
  const d = n.dados;
  const ator = d.atorNome ?? "Alguém";
  switch (n.tipo) {
    case "COMENTARIO_NO_POST":
      return `${ator} comentou na sua publicação.`;
    case "RESPOSTA_AO_COMENTARIO":
      return `${ator} respondeu ao seu comentário.`;
    case "CURTIDAS_NO_POST":
      return n.total > 1 ? `${ator} e mais ${n.total - 1} curtiram sua publicação.` : `${ator} curtiu sua publicação.`;
    case "POST_FIXADO":
      return `Nova publicação fixada${canal(d)}.`;
    case "AVISO":
      return `${ator} publicou um aviso${canal(d)}.`;
    case "AULA_NOVA":
      return `Nova aula em ${aspas(d.produtoTitulo)}: ${aspas(d.aulaTitulo)}.`;
    case "CERTIFICADO_EMITIDO":
      return `Seu certificado de ${aspas(d.produtoTitulo)} foi emitido.`;
    case "MATRICULA_NOVA":
      return `Sua matrícula em ${aspas(d.produtoTitulo)} está ativa.`;
    case "DENUNCIA_NOVA":
      return "Nova denúncia na comunidade para revisar.";
    case "EVENTO_PUBLICADO":
      return `Novo encontro ao vivo: ${aspas(d.eventoTitulo)}${quando(d)}.`;
    case "EVENTO_LEMBRETE":
      return `${aspas(d.eventoTitulo)} começa em breve${quando(d)}.`;
    case "EVENTO_CANCELADO":
      return `O encontro ${aspas(d.eventoTitulo)}${quando(d)} foi cancelado.`;
  }
}

const quando = (d: DadosNotificacao) => (d.eventoInicio ? ` (${quandoDoEvento(new Date(d.eventoInicio))})` : "");

/**
 * Destino do clique. Rotas das telas do passo 8: `/comunidade?post=<id>` (post aberto),
 * `/aula/<id>?aba=comentarios` e a fila de denúncias `/admin/comunidade?aba=denuncias`.
 * Mudou a rota? Mude AQUI.
 */
export function linkDaNotificacao(n: Pick<NotificacaoParaTexto, "tipo" | "dados">): string {
  const d = n.dados;
  switch (n.tipo) {
    case "COMENTARIO_NO_POST":
    case "RESPOSTA_AO_COMENTARIO":
      if (d.aulaId) return `/aula/${d.aulaId}?aba=comentarios`;
      return d.postId ? `/comunidade?post=${d.postId}` : "/comunidade";
    case "CURTIDAS_NO_POST":
    case "POST_FIXADO":
    case "AVISO":
      return d.postId ? `/comunidade?post=${d.postId}` : "/comunidade";
    case "AULA_NOVA":
      return d.aulaId ? `/aula/${d.aulaId}` : "/";
    case "CERTIFICADO_EMITIDO":
      return "/certificados";
    case "MATRICULA_NOVA":
      return d.produtoSlug ? `/cursos/${d.produtoSlug}` : "/continuar";
    case "DENUNCIA_NOVA":
      return "/admin/comunidade?aba=denuncias";
    case "EVENTO_PUBLICADO":
    case "EVENTO_LEMBRETE":
    case "EVENTO_CANCELADO":
      return d.eventoId ? `${ROTA_EVENTOS}/${d.eventoId}` : ROTA_EVENTOS;
  }
}

/** Contador do sino: "99+" no teto. */
export const rotuloDoContador = (n: number) => (n > TETO_CONTADOR ? `${TETO_CONTADOR}+` : String(n));
