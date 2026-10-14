import "server-only";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { FinalizacaoTentativa, TipoAvaliacao, TipoQuestao } from "@/lib/db/schema/_enums";
import { produtos_avaliacoes as av, produtos_avaliacoes_questoes as qst, produtos_avaliacoes_tentativas as tent } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import type { QuemPede } from "@/lib/progresso/visao";
import { cardDaAvaliacao, metaDaAvaliacao, revelaGabarito, ROTULO_TIPO_AVALIACAO, segundosRestantes, type MotivoAvaliacao, type SituacaoAvaliacaoAluno } from "./regras";
import { situacoesDoMembro, type SituacaoAvaliacao } from "./situacao";
import { finalizarVencidas } from "./tentativas";

/**
 * LEITURAS do aluno (tela 6, responder, resultado). O gabarito (`gabarito`, `explicacao`) só é
 * SELECIONADO no resultado de tentativa finalizada, e só sai quando `revelaGabarito` deixa.
 * Antes de ler, fecha (TEMPO) as tentativas do membro cujo prazo passou. Formatos em docs/back.md.
 */

const quemDe = (q: QuemPede) => ({ criadorId: q.criador.id, membroId: q.membro.id, papel: q.membro.papel });
const quemFaz = (q: QuemPede) => ({ criadorId: q.criador.id, membroId: q.membro.id!, papel: q.membro.papel, usuarioId: q.usuario.id });

export interface CardAvaliacao {
  id: string;
  titulo: string;
  tipo: TipoAvaliacao;
  /** "Quiz", "Prova", "Simulado". */
  tipoRotulo: string;
  curso: { id: string; titulo: string; slug: string };
  modulo: { id: string; titulo: string } | null;
  /** "10 questões · 15 min · nota mínima 70%". */
  meta: string;
  questoes: number;
  tempoLimiteMin: number | null;
  notaMinima: number;
  situacao: SituacaoAvaliacaoAluno;
  /** "Concluída · 92%" | "Em andamento" | "Disponível" | "Bloqueada · Conclua as aulas antes". */
  rotulo: string;
  /** "Ver resultado" | "Continuar" | "Iniciar" | "Tentar de novo" | null (bloqueada sem tentativa). */
  cta: string | null;
  motivo: MotivoAvaliacao | null;
  aprovada: boolean;
  melhorNota: number | null;
  /** null = ilimitado (ou equipe). */
  tentativasRestantes: number | null;
  tentativaAbertaId: string | null;
  obrigatoriaParaCertificado: boolean;
  /** A aprovação libera o módulo seguinte (RN da avaliação de módulo). */
  liberaProximoModulo: boolean;
  href: string;
}

function paraCard(s: SituacaoAvaliacao): CardAvaliacao {
  const card = cardDaAvaliacao({ aprovada: s.aprovada, melhorNota: s.melhorNota, temAberta: !!s.aberta, motivo: s.motivo, tentou: s.finalizadas > 0 });
  return {
    id: s.id,
    titulo: s.titulo,
    tipo: s.tipo,
    tipoRotulo: ROTULO_TIPO_AVALIACAO[s.tipo],
    curso: { id: s.produto.id, titulo: s.produto.titulo, slug: s.produto.slug },
    modulo: s.modulo ? { id: s.modulo.id, titulo: s.modulo.titulo } : null,
    meta: metaDaAvaliacao({ questoes: s.questoes, tempoLimiteMin: s.tempoLimiteMin, notaMinima: s.notaMinima }),
    questoes: s.questoes,
    tempoLimiteMin: s.tempoLimiteMin,
    notaMinima: s.notaMinima,
    ...card,
    motivo: s.motivo,
    aprovada: s.aprovada,
    melhorNota: s.melhorNota,
    tentativasRestantes: s.restantes,
    tentativaAbertaId: s.aberta?.id ?? null,
    obrigatoriaParaCertificado: s.obrigatoriaParaCertificado,
    liberaProximoModulo: s.liberaProximoModulo,
    href: `/avaliacoes/${s.id}`,
  };
}

/** Visível ao aluno: publicada, curso fora de rascunho, módulo (se houver) publicado, matrícula valendo. */
const visivelAoAluno = (s: SituacaoAvaliacao) =>
  s.status === "PUBLICADA" && s.produto.status !== "RASCUNHO" && (!s.modulo || s.modulo.status === "PUBLICADO") && s.matriculaValendo;

/**
 * Tela 6: avaliações dos cursos em que o ALUNO tem matrícula valendo (equipe: todas as publicadas),
 * na ordem curso → módulo. Bloqueadas aparecem com o motivo.
 */
export async function avaliacoesDoAluno(q: QuemPede, agora = new Date()): Promise<CardAvaliacao[]> {
  if (q.membro.id) await finalizarVencidas(quemFaz(q), agora);
  const lista = await situacoesDoMembro(quemDe(q), { somentePublicadas: true }, agora);
  const ehEquipe = q.membro.papel !== "ALUNO";
  return lista
    .filter((s) => ehEquipe || visivelAoAluno(s))
    .sort((a, b) => a.produto.titulo.localeCompare(b.produto.titulo, "pt-BR") || (a.modulo?.ordem ?? 1e9) - (b.modulo?.ordem ?? 1e9) || a.titulo.localeCompare(b.titulo, "pt-BR"))
    .map(paraCard);
}

export interface TentativaResumo {
  id: string;
  numero: number;
  iniciadaEm: Date;
  finalizadaEm: Date | null;
  finalizadaPor: FinalizacaoTentativa | null;
  nota: number | null;
  aprovada: boolean | null;
}

/** Página de entrada da avaliação: card + instruções + histórico de tentativas. `null` = 404. */
export async function avaliacaoDoAluno(q: QuemPede, avaliacaoId: string, agora = new Date()) {
  if (q.membro.id) await finalizarVencidas(quemFaz(q), agora, [avaliacaoId]);
  const [s] = await situacoesDoMembro(quemDe(q), { avaliacaoIds: [avaliacaoId] }, agora);
  if (!s) return null;
  const ehEquipe = q.membro.papel !== "ALUNO";
  // Sem matrícula o aluno ainda vê a página (com o motivo "Matricule-se"); rascunho/oculta = 404.
  if (!ehEquipe && (s.status !== "PUBLICADA" || s.produto.status === "RASCUNHO" || (s.modulo && s.modulo.status !== "PUBLICADO"))) return null;
  const tentativas: TentativaResumo[] = q.membro.id
    ? await db
        .select({ id: tent.id, numero: tent.numero, iniciadaEm: tent.iniciada_em, finalizadaEm: tent.finalizada_em, finalizadaPor: tent.finalizada_por, nota: tent.nota, aprovada: tent.aprovada })
        .from(tent)
        .where(and(eq(tent.avaliacao_id, avaliacaoId), eq(tent.membro_id, q.membro.id), eq(tent.criador_id, q.criador.id), vivos(tent)))
        .orderBy(desc(tent.numero))
    : [];
  return { ...paraCard(s), instrucoes: s.instrucoes, embaralhar: s.embaralhar, aulasPendentes: s.aulasPendentes, tentativas };
}

export interface QuestaoParaResponder {
  id: string;
  /** 1..N na ordem desta tentativa. */
  numero: number;
  tipo: TipoQuestao;
  enunciado: string;
  peso: number;
  /** Na ordem sorteada; SEM indicar a correta. */
  opcoes: { id: string; texto: string }[];
  /** Ids marcados (autosave). */
  resposta: string[];
}

export type TelaDeResponder =
  | {
      situacao: "aberta";
      avaliacao: { id: string; titulo: string; tipo: TipoAvaliacao; instrucoes: string; notaMinima: number; tempoLimiteMin: number | null };
      tentativa: { id: string; numero: number; iniciadaEm: Date; prazoEm: Date | null; segundosRestantes: number | null };
      questoes: QuestaoParaResponder[];
    }
  | { situacao: "encerrada"; tentativaId: string };

/**
 * Tela de responder: questões SEM gabarito, na ordem da tentativa, com as respostas salvas e o
 * tempo restante (do servidor). Prazo estourado: fecha agora e devolve `encerrada` (ir ao resultado).
 * `null` = tentativa não é do membro (ou não existe neste criador).
 */
export async function tentativaParaResponder(q: QuemPede, tentativaId: string, agora = new Date()): Promise<TelaDeResponder | null> {
  if (!q.membro.id) return null;
  const [t] = await db
    .select()
    .from(tent)
    .where(and(eq(tent.id, tentativaId), eq(tent.membro_id, q.membro.id), eq(tent.criador_id, q.criador.id), vivos(tent)));
  if (!t) return null;
  if (!t.finalizada_em && t.prazo_em && t.prazo_em <= agora) await finalizarVencidas(quemFaz(q), agora, [t.avaliacao_id]);
  if (t.finalizada_em || (t.prazo_em && t.prazo_em <= agora)) return { situacao: "encerrada", tentativaId: t.id };
  const [a] = await db
    .select({ id: av.id, titulo: av.titulo, tipo: av.tipo, instrucoes: av.instrucoes, notaMinima: av.nota_minima, tempoLimiteMin: av.tempo_limite_min })
    .from(av)
    .where(eq(av.id, t.avaliacao_id));
  const ids = t.ordem.map((o) => o.q);
  // Colunas escolhidas uma a uma: `gabarito` e `explicacao` NUNCA entram aqui.
  const linhas = await db
    .select({ id: qst.id, tipo: qst.tipo, enunciado: qst.enunciado, peso: qst.peso, opcoes: qst.opcoes })
    .from(qst)
    .where(and(inArray(qst.id, ids), eq(qst.criador_id, q.criador.id), vivos(qst)));
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const questoes = t.ordem
    .filter((o) => porId.has(o.q))
    .map((o, i): QuestaoParaResponder => {
      const l = porId.get(o.q)!;
      const textos = new Map(l.opcoes.map((op) => [op.id, op.texto]));
      return {
        id: l.id,
        numero: i + 1,
        tipo: l.tipo,
        enunciado: l.enunciado,
        peso: l.peso,
        opcoes: o.o.filter((id) => textos.has(id)).map((id) => ({ id, texto: textos.get(id)! })),
        resposta: t.respostas[l.id] ?? [],
      };
    });
  return {
    situacao: "aberta",
    avaliacao: a,
    tentativa: { id: t.id, numero: t.numero, iniciadaEm: t.iniciada_em, prazoEm: t.prazo_em, segundosRestantes: segundosRestantes(t.prazo_em, agora) },
    questoes,
  };
}

export interface QuestaoCorrigida {
  id: string;
  numero: number;
  tipo: TipoQuestao;
  enunciado: string;
  peso: number;
  correta: boolean;
  /** `correta` por opção só com o gabarito revelado (senão `null`). */
  opcoes: { id: string; texto: string; marcada: boolean; correta: boolean | null }[];
  /** Só com o gabarito revelado. */
  explicacao: string | null;
}

/**
 * Resultado de uma tentativa FINALIZADA. Aluno: só as próprias; equipe: qualquer uma do criador
 * (e sempre com gabarito). Gabarito/explicação seguem `revelaGabarito` (PROVA esconde enquanto der
 * para tentar de novo). Certa/errada vem da correção congelada. `null` = 404 ou ainda aberta.
 */
export async function resultadoDaTentativa(q: QuemPede, tentativaId: string, agora = new Date()) {
  const ehEquipe = q.membro.papel !== "ALUNO";
  if (!ehEquipe && !q.membro.id) return null;
  const [t] = await db
    .select()
    .from(tent)
    .where(and(eq(tent.id, tentativaId), eq(tent.criador_id, q.criador.id), vivos(tent), isNotNull(tent.finalizada_em), ehEquipe ? undefined : eq(tent.membro_id, q.membro.id!)));
  if (!t) return null;
  const [s] = await situacoesDoMembro({ criadorId: q.criador.id, membroId: t.membro_id, papel: "ALUNO" }, { avaliacaoIds: [t.avaliacao_id] }, agora);
  if (!s) return null;
  const revela = ehEquipe || revelaGabarito(s.tipo, s.aprovada, s.restantes);
  const ids = t.ordem.map((o) => o.q);
  const linhas = await db
    .select({
      id: qst.id,
      tipo: qst.tipo,
      enunciado: qst.enunciado,
      peso: qst.peso,
      opcoes: qst.opcoes,
      // Só lido quando vai ser mostrado.
      gabarito: revela ? qst.gabarito : sql<string[]>`'[]'::jsonb`,
      explicacao: revela ? qst.explicacao : sql<string | null>`null`,
    })
    .from(qst)
    .where(and(inArray(qst.id, ids), eq(qst.criador_id, q.criador.id), vivos(qst)));
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const certa = new Map((t.correcao ?? []).map((c) => [c.q, c.correta]));
  const questoes = t.ordem
    .filter((o) => porId.has(o.q))
    .map((o, i): QuestaoCorrigida => {
      const l = porId.get(o.q)!;
      const marcadas = new Set(t.respostas[l.id] ?? []);
      const gabarito = new Set(l.gabarito);
      const textos = new Map(l.opcoes.map((op) => [op.id, op.texto]));
      return {
        id: l.id,
        numero: i + 1,
        tipo: l.tipo,
        enunciado: l.enunciado,
        peso: l.peso,
        correta: certa.get(l.id) ?? false,
        opcoes: o.o.filter((id) => textos.has(id)).map((id) => ({ id, texto: textos.get(id)!, marcada: marcadas.has(id), correta: revela ? gabarito.has(id) : null })),
        explicacao: revela ? l.explicacao : null,
      };
    });
  return {
    avaliacao: { id: s.id, titulo: s.titulo, tipo: s.tipo, notaMinima: s.notaMinima, curso: { titulo: s.produto.titulo, slug: s.produto.slug } },
    tentativa: {
      id: t.id,
      numero: t.numero,
      nota: t.nota!,
      aprovada: t.aprovada!,
      finalizadaPor: t.finalizada_por!,
      iniciadaEm: t.iniciada_em,
      finalizadaEm: t.finalizada_em!,
      duracaoSeg: Math.round((t.finalizada_em!.getTime() - t.iniciada_em.getTime()) / 1000),
      acertos: (t.correcao ?? []).filter((c) => c.correta).length,
      total: (t.correcao ?? []).length,
    },
    melhorNota: s.melhorNota,
    aprovadaAlgumaVez: s.aprovada,
    tentativasRestantes: s.restantes,
    revelaGabarito: revela,
    /** O aluno pode iniciar outra agora? (equipe: sempre pode fazer prévia). */
    podeTentarDeNovo: !ehEquipe && s.motivo === null,
    questoes,
  };
}
