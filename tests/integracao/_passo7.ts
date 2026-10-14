/**
 * Apoio dos testes do passo 7 (PostgreSQL real): avaliação publicada com questões montada direto
 * no banco (o caminho pelas actions é provado em avaliacoes.test.ts) e conclusão de todas as
 * aulas de um curso. Importar só dentro do teste (depois do _ambiente.ts).
 */
import { db } from "@/lib/db";
import type { TipoAvaliacao } from "@/lib/db/schema/_enums";
import { produtos_avaliacoes, produtos_avaliacoes_questoes } from "@/lib/db/schema";
import { concluirManualmente } from "@/lib/progresso/registrar";

export interface OpcoesAvaliacao {
  tipo?: TipoAvaliacao;
  moduloId?: string | null;
  notaMinima?: number;
  tentativasMax?: number;
  tempoLimiteMin?: number | null;
  obrigatoria?: boolean;
  liberaProximo?: boolean;
  exigeAulas?: boolean;
  embaralhar?: boolean;
  status?: "RASCUNHO" | "PUBLICADA";
}

/**
 * Avaliação com 3 questões: q1 UNICA (gabarito b, peso 1), q2 MULTIPLA (a+c, peso 2),
 * q3 V/F (Verdadeiro, peso 1). Todas certas = 100; só q1+q3 = 50.
 */
export async function avaliacaoPronta(criadorId: string, produtoId: string, o: OpcoesAvaliacao = {}) {
  const [a] = await db
    .insert(produtos_avaliacoes)
    .values({
      criador_id: criadorId,
      produto_id: produtoId,
      modulo_id: o.moduloId ?? null,
      tipo: o.tipo ?? "QUIZ",
      titulo: `Avaliação ${Math.random().toString(36).slice(2, 7)}`,
      nota_minima: o.notaMinima ?? 70,
      tentativas_max: o.tentativasMax ?? 3,
      tempo_limite_min: o.tempoLimiteMin ?? null,
      obrigatoria_para_certificado: o.obrigatoria ?? false,
      libera_proximo_modulo: o.liberaProximo ?? false,
      exige_aulas_concluidas: o.exigeAulas ?? false,
      embaralhar: o.embaralhar ?? false,
      status: o.status ?? "PUBLICADA",
      publicada_em: new Date(),
      modified_by: criadorId,
    })
    .returning();
  const base = { criador_id: criadorId, avaliacao_id: a.id, modified_by: criadorId };
  const qs = await db
    .insert(produtos_avaliacoes_questoes)
    .values([
      { ...base, ordem: 1, tipo: "UNICA", enunciado: "Qual?", opcoes: [{ id: "a", texto: "A" }, { id: "b", texto: "B" }, { id: "c", texto: "C" }], gabarito: ["b"], peso: 1, explicacao: "Porque B." },
      { ...base, ordem: 2, tipo: "MULTIPLA", enunciado: "Quais?", opcoes: [{ id: "a", texto: "A" }, { id: "b", texto: "B" }, { id: "c", texto: "C" }], gabarito: ["a", "c"], peso: 2, explicacao: "A e C." },
      { ...base, ordem: 3, tipo: "VERDADEIRO_FALSO", enunciado: "Verdade?", opcoes: [{ id: "a", texto: "Verdadeiro" }, { id: "b", texto: "Falso" }], gabarito: ["a"], peso: 1, explicacao: null },
    ])
    .returning();
  return { avaliacao: a, questoes: qs };
}

/** Respostas de 100 e de 50 (ids das questões na ordem do cadastro). */
export const respostasCertas = (qs: { id: string }[]) => [
  { questaoId: qs[0].id, opcoes: ["b"] },
  { questaoId: qs[1].id, opcoes: ["c", "a"] },
  { questaoId: qs[2].id, opcoes: ["a"] },
];
export const respostasMetade = (qs: { id: string }[]) => [
  { questaoId: qs[0].id, opcoes: ["b"] },
  { questaoId: qs[1].id, opcoes: ["a"] },
  { questaoId: qs[2].id, opcoes: ["a"] },
];

/** Conclui (pelo botão) todas as aulas dadas, em ordem. */
export async function concluirAulas(criadorId: string, aluno: { usuario: { id: string }; membro: { id: string } }, aulas: { id: string }[]) {
  for (const a of aulas) await concluirManualmente({ criadorId, membroId: aluno.membro.id, usuarioId: aluno.usuario.id, aulaId: a.id });
}
