import "server-only";
import type { QuemPede } from "@/lib/progresso/visao";
import { desafiosDoMembro, type DesafioDoMembro } from "./desafios";
import { configDaGamificacao } from "./pontos";
import { extratoDoMembro, rankingDoCriador, resumoDoMembro, saldosDosMembros, type LancamentoDoMembro, type ResumoDePontos } from "./ranking";
import { nivelDoMembro, type PeriodoRanking } from "./regras";

/**
 * Tudo da tela /conquistas do PRÓPRIO membro (RN-144 a RN-147) numa chamada. `null` = gamificação
 * desligada nesta área (a página dá 404 e os links somem). SUPER_ADMIN sem vínculo vê ranking e
 * desafios, sem resumo nem extrato.
 */

export const TOP_RANKING_ALUNO = 10;
export const EXTRATO_ALUNO = 10;

export interface LinhaRankingConquistas {
  posicao: number;
  membroId: string;
  nome: string;
  imagem: string | null;
  nivel: string;
  pontos: number;
}

export interface ConquistasDoMembro {
  resumo: ResumoDePontos | null;
  desafios: { disponiveis: DesafioDoMembro[]; emAndamento: DesafioDoMembro[]; concluidos: DesafioDoMembro[] };
  ranking: LinhaRankingConquistas[];
  /** A própria linha quando está fora do top (posição real do período). */
  minhaForaDoTop: LinhaRankingConquistas | null;
  extrato: LancamentoDoMembro[];
}

export async function conquistasDoMembro(q: QuemPede, periodo: PeriodoRanking, agora: Date): Promise<ConquistasDoMembro | null> {
  const config = await configDaGamificacao(q.criador.id);
  if (!config.ligada) return null;
  const membroId = q.membro.id;
  const [resumo, desafios, top, extrato] = await Promise.all([
    membroId ? resumoDoMembro(q.criador.id, membroId, agora) : null,
    desafiosDoMembro(q, agora),
    rankingDoCriador(q.criador.id, periodo, agora, TOP_RANKING_ALUNO),
    membroId ? extratoDoMembro(q.criador.id, membroId, EXTRATO_ALUNO) : [],
  ]);
  const saldos = await saldosDosMembros(q.criador.id, top.map((l) => l.membroId));
  const nivel = (pontos: number) => nivelDoMembro(pontos, config.niveis).atual.nome;
  const ranking = top.map((l) => ({ ...l, nivel: nivel(saldos.get(l.membroId) ?? 0) }));
  const minhaPosicao = resumo?.posicao[periodo] ?? null;
  const minhaForaDoTop =
    resumo && membroId && minhaPosicao !== null && !ranking.some((l) => l.membroId === membroId)
      ? { posicao: minhaPosicao, membroId, nome: "", imagem: null, nivel: resumo.nivel.atual.nome, pontos: resumo[periodo] }
      : null;
  return {
    resumo,
    desafios: {
      disponiveis: desafios.filter((d) => !d.participando && d.momento !== "ENCERRADO"),
      emAndamento: desafios.filter((d) => d.participando && !d.concluidoEm && d.momento !== "ENCERRADO"),
      concluidos: desafios.filter((d) => d.concluidoEm),
    },
    ranking,
    minhaForaDoTop,
    extrato,
  };
}
