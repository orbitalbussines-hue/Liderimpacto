/**
 * Parte do `seed:demo` (SÓ DESENVOLVIMENTO) do passo 7: 2 avaliações no "Líder de Impacto" (quiz
 * do módulo 1 que libera o módulo 2 — já aprovado pela Ana — e a prova final obrigatória para o
 * certificado), 1 trilha publicada com 3 etapas e 1 certificado emitido para a Ana no "Editora
 * Signature" (todas as aulas concluídas) com o PDF v1 gerado e gravado no storage. Usa os
 * serviços reais (tentativa, emissão, worker). Idempotente (chaves naturais).
 */
import { and, eq } from "drizzle-orm";
import { iniciarTentativa, finalizarTentativa, responder } from "@/lib/avaliacoes/tentativas";
import { emitir } from "@/lib/certificados/emissao";
import { processarVersao } from "@/lib/certificados/worker";
import { db } from "@/lib/db";
import type { TipoAvaliacao } from "@/lib/db/schema/_enums";
import {
  criadores_trilhas,
  criadores_trilhas_itens,
  produtos_avaliacoes,
  produtos_avaliacoes_questoes,
  produtos_avaliacoes_tentativas,
  produtos_certificados_versoes,
  produtos_modulos,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { concluirManualmente } from "@/lib/progresso/registrar";
import { questaoSchema } from "@/lib/validators/avaliacoes";

type Pessoa = { usuarioId: string; membroId: string };
type Curso = { id: string; slug: string };
type Aula = { id: string; produtoSlug: string };

const op = (texto: string, correta = false) => ({ texto, correta });
const QUESTOES_QUIZ = [
  { tipo: "UNICA", enunciado: "Qual é a principal função de um líder de impacto?", opcoes: [op("Controlar cada tarefa"), op("Desenvolver pessoas e gerar resultados", true), op("Evitar conflitos")], explicacao: "Liderança de impacto = pessoas + resultado." },
  { tipo: "VERDADEIRO_FALSO", enunciado: "Saber o seu porquê ajuda a sustentar decisões difíceis.", opcoes: [op("Verdadeiro", true), op("Falso")], explicacao: null },
  { tipo: "MULTIPLA", enunciado: "Quais atitudes fortalecem a confiança da equipe?", opcoes: [op("Coerência entre fala e ação", true), op("Esconder erros"), op("Dar crédito a quem fez", true)], explicacao: "Coerência e reconhecimento." },
] as const;
const QUESTOES_PROVA = [
  { tipo: "UNICA", enunciado: "Feedback que desenvolve é…", opcoes: [op("Genérico e raro"), op("Específico, no momento certo e com foco no comportamento", true), op("Só elogio")], explicacao: "Específico e oportuno." },
  { tipo: "MULTIPLA", enunciado: "O que compõe uma cultura organizacional?", opcoes: [op("Valores", true), op("Comportamentos repetidos", true), op("O logotipo"), op("Rituais", true)], explicacao: null },
  { tipo: "VERDADEIRO_FALSO", enunciado: "Cultura forte é sempre cultura saudável.", opcoes: [op("Verdadeiro"), op("Falso", true)], explicacao: "Uma cultura pode ser forte e tóxica." },
  { tipo: "UNICA", enunciado: "Delegar bem significa…", opcoes: [op("Transferir a tarefa e sumir"), op("Dar autonomia com clareza de resultado", true)], explicacao: null },
] as const;

async function garantirAvaliacao(
  criadorId: string,
  autor: string,
  produtoId: string,
  titulo: string,
  campos: { tipo: TipoAvaliacao; moduloId: string | null; notaMinima: number; tentativasMax: number; tempoLimiteMin: number | null; obrigatoria: boolean; libera: boolean; exige: boolean },
  questoes: readonly { tipo: string; enunciado: string; opcoes: readonly { texto: string; correta: boolean }[]; explicacao: string | null }[],
) {
  const [existe] = await db.select().from(produtos_avaliacoes).where(and(eq(produtos_avaliacoes.produto_id, produtoId), eq(produtos_avaliacoes.titulo, titulo), vivos(produtos_avaliacoes)));
  if (existe) return existe;
  return db.transaction(async (tx) => {
    const [a] = await tx
      .insert(produtos_avaliacoes)
      .values({
        criador_id: criadorId,
        produto_id: produtoId,
        modulo_id: campos.moduloId,
        tipo: campos.tipo,
        titulo,
        instrucoes: "Leia com calma. Suas respostas são salvas a cada clique.",
        nota_minima: campos.notaMinima,
        tentativas_max: campos.tentativasMax,
        tempo_limite_min: campos.tempoLimiteMin,
        obrigatoria_para_certificado: campos.obrigatoria,
        libera_proximo_modulo: campos.libera,
        exige_aulas_concluidas: campos.exige,
        embaralhar: campos.tipo === "PROVA",
        status: "PUBLICADA",
        publicada_em: new Date(),
        modified_by: autor,
      })
      .returning();
    for (const [i, q] of questoes.entries()) {
      const v = questaoSchema.parse({ tipo: q.tipo, enunciado: q.enunciado, opcoes: q.opcoes.map((o) => ({ texto: o.texto, correta: o.correta })), explicacao: q.explicacao });
      await tx.insert(produtos_avaliacoes_questoes).values({ criador_id: criadorId, avaliacao_id: a.id, ordem: i + 1, tipo: v.tipo, enunciado: v.enunciado, opcoes: v.opcoes, gabarito: v.gabarito, peso: v.peso, explicacao: v.explicacao, modified_by: autor });
    }
    return a;
  });
}

/** Ana responde o quiz certo (uma vez). */
async function aprovarAna(criadorId: string, ana: Pessoa, avaliacaoId: string) {
  const [ja] = await db
    .select({ id: produtos_avaliacoes_tentativas.id })
    .from(produtos_avaliacoes_tentativas)
    .where(and(eq(produtos_avaliacoes_tentativas.avaliacao_id, avaliacaoId), eq(produtos_avaliacoes_tentativas.membro_id, ana.membroId), vivos(produtos_avaliacoes_tentativas)));
  if (ja) return;
  const quem = { criadorId, membroId: ana.membroId, papel: "ALUNO" as const, usuarioId: ana.usuarioId };
  const { tentativaId } = await iniciarTentativa(quem, avaliacaoId);
  const qs = await db.select().from(produtos_avaliacoes_questoes).where(and(eq(produtos_avaliacoes_questoes.avaliacao_id, avaliacaoId), vivos(produtos_avaliacoes_questoes)));
  for (const q of qs) await responder(quem, { tentativaId, questaoId: q.id, opcoes: q.gabarito });
  await finalizarTentativa(quem, tentativaId, "ALUNO");
}

async function garantirTrilha(criadorId: string, autor: string, itens: ({ produtoId: string } | { avaliacaoId: string })[]) {
  const titulo = "Jornada do Líder";
  const [existe] = await db.select({ id: criadores_trilhas.id }).from(criadores_trilhas).where(and(eq(criadores_trilhas.criador_id, criadorId), eq(criadores_trilhas.titulo, titulo), vivos(criadores_trilhas)));
  if (existe) return existe.id;
  return db.transaction(async (tx) => {
    const [t] = await tx
      .insert(criadores_trilhas)
      .values({ criador_id: criadorId, titulo, descricao: "Da base da liderança à prova final, e depois o seu capítulo no livro.", tag: "Liderança", status: "PUBLICADA", publicada_em: new Date(), modified_by: autor })
      .returning({ id: criadores_trilhas.id });
    for (const [i, it] of itens.entries()) {
      const alvo = "produtoId" in it ? { tipo: "PRODUTO" as const, produto_id: it.produtoId } : { tipo: "AVALIACAO" as const, avaliacao_id: it.avaliacaoId };
      await tx.insert(criadores_trilhas_itens).values({ criador_id: criadorId, trilha_id: t.id, ordem: i + 1, ...alvo, modified_by: autor });
    }
    return t.id;
  });
}

export async function semearPasso7(criadorId: string, dono: Pessoa, ana: Pessoa, cursos: Curso[], aulas: Aula[]) {
  const lider = cursos.find((c) => c.slug === "lider-de-impacto")!;
  const editora = cursos.find((c) => c.slug === "editora-signature")!;
  const [modulo1] = await db
    .select({ id: produtos_modulos.id })
    .from(produtos_modulos)
    .where(and(eq(produtos_modulos.produto_id, lider.id), eq(produtos_modulos.ordem, 1), vivos(produtos_modulos)));
  const quiz = await garantirAvaliacao(
    criadorId,
    dono.usuarioId,
    lider.id,
    "Quiz · Fundamentos da liderança",
    { tipo: "QUIZ", moduloId: modulo1.id, notaMinima: 70, tentativasMax: 0, tempoLimiteMin: null, obrigatoria: false, libera: true, exige: false },
    QUESTOES_QUIZ,
  );
  const prova = await garantirAvaliacao(
    criadorId,
    dono.usuarioId,
    lider.id,
    "Prova final · Líder de Impacto",
    { tipo: "PROVA", moduloId: null, notaMinima: 70, tentativasMax: 2, tempoLimiteMin: 20, obrigatoria: true, libera: false, exige: true },
    QUESTOES_PROVA,
  );
  await aprovarAna(criadorId, ana, quiz.id);
  const trilhaId = await garantirTrilha(criadorId, dono.usuarioId, [{ produtoId: lider.id }, { avaliacaoId: prova.id }, { produtoId: editora.id }]);

  // Certificado da Ana: todas as aulas do Editora Signature concluídas -> emissão automática.
  for (const a of aulas.filter((x) => x.produtoSlug === editora.slug)) {
    await concluirManualmente({ criadorId, membroId: ana.membroId, usuarioId: ana.usuarioId, aulaId: a.id });
  }
  const emissao = await emitir(criadorId, ana.membroId, editora.id);
  if (!emissao) throw new Error("certificado de demonstração não ficou elegível");
  const pendentes = await db
    .select({ id: produtos_certificados_versoes.id })
    .from(produtos_certificados_versoes)
    .where(and(eq(produtos_certificados_versoes.certificado_id, emissao.certificadoId), eq(produtos_certificados_versoes.situacao, "PENDENTE")));
  for (const v of pendentes) await processarVersao(v.id);
  console.log(`Passo 7: quiz ${quiz.id}, prova ${prova.id}, trilha ${trilhaId}, certificado ${emissao.certificadoId} (PDF gerado).`);
}
