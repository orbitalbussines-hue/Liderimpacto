import type { CanalDoMembro } from "@/lib/comunidade/canais";
import type { EnqueteDoPost } from "@/lib/comunidade/consultas";

/** Formatos e regras de TELA da comunidade (puros: servidor, cliente e teste). */

const FUSO = "America/Sao_Paulo";

/** "agora", "há 5 min", "há 3 h", "ontem", "há 15 dias", "há um mês", "há 4 meses", "há 1 ano". */
export function quando(em: Date | string, agora: Date = new Date()): string {
  const seg = Math.max(0, Math.round((agora.getTime() - new Date(em).getTime()) / 1000));
  if (seg < 60) return "agora";
  const min = Math.floor(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  const meses = Math.floor(d / 30);
  if (meses === 1) return "há um mês";
  if (meses < 12) return `há ${meses} meses`;
  const anos = Math.floor(d / 365);
  return anos <= 1 ? "há 1 ano" : `há ${anos} anos`;
}

/** "20/10 às 18:00" (Brasília): prazo da enquete, fim do silêncio. */
export function dataHoraCurta(em: Date | string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: FUSO })
      .formatToParts(new Date(em))
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}

/** "1 curtida" / "4 curtidas" (idem comentário, voto, publicação). */
export const contagem = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;

/** Voto otimista: tira o voto anterior (se houver) e soma na opção nova. Mesma opção = nada muda. */
export function aplicarVoto(e: EnqueteDoPost, opcao: number): EnqueteDoPost {
  if (e.meuVoto === opcao) return e;
  const anterior = e.meuVoto;
  return {
    ...e,
    meuVoto: opcao,
    totalVotos: anterior === null ? e.totalVotos + 1 : e.totalVotos,
    opcoes: e.opcoes.map((o) => ({
      ...o,
      votos: o.votos + (o.indice === opcao ? 1 : 0) - (o.indice === anterior ? 1 : 0),
    })),
  };
}

/** Percentual inteiro de uma opção (0 sem votos). */
export const percentual = (votos: number, total: number) => (total > 0 ? Math.round((votos / total) * 100) : 0);

/**
 * O que o topo do feed mostra no lugar do compositor:
 * - `livre`: compositor normal;
 * - `silenciado`: aviso com a data (não publica nem comenta);
 * - `so-equipe`: canal de avisos para quem não é da equipe (compositor some);
 * - `sem-vinculo`: SUPER_ADMIN sem vínculo só lê.
 */
export type EstadoDoCompositor = "livre" | "silenciado" | "so-equipe" | "sem-vinculo";

export function estadoDoCompositor(
  situacao: { podeParticipar: boolean; silenciadoAte: Date | null },
  canal: Pick<CanalDoMembro, "podePublicar"> | null,
  canaisParaPublicar: number,
): EstadoDoCompositor {
  if (!situacao.podeParticipar) return "sem-vinculo";
  if (situacao.silenciadoAte) return "silenciado";
  if (canal ? !canal.podePublicar : canaisParaPublicar === 0) return "so-equipe";
  return "livre";
}

/** Texto do aviso de silenciado (compositor e comentários). */
export const textoSilenciado = (ate: Date | string) =>
  `Você está silenciado na comunidade até ${dataHoraCurta(ate)}. Ainda pode ler e curtir, mas não publicar nem comentar.`;

/** Link do post aberto (as notificações apontam para ele). */
export const hrefDoPost = (postId: string) => `/comunidade?post=${postId}`;
