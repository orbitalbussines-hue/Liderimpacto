import "server-only";
import { and, asc, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import type { StatusAvaliacao } from "@/lib/db/schema/_enums";
import {
  criadores_membros,
  produtos,
  produtos_avaliacoes as av,
  produtos_avaliacoes_concessoes as conc,
  produtos_avaliacoes_questoes as qst,
  produtos_avaliacoes_tentativas as tent,
  produtos_modulos,
  usuarios,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { ROTULO_TIPO_AVALIACAO, tentativasRestantes } from "./regras";

/**
 * LEITURAS da equipe (admin › Avaliações): lista com tentativas e aprovação, editor (COM
 * gabarito: só a equipe chega aqui — a página usa `membroDaPagina(EQUIPE)`) e alunos de uma
 * avaliação (para conceder tentativa). Estatísticas contam só membros com papel ALUNO (a prévia
 * da equipe não entra).
 */

const curinga = (texto: string) => `%${texto.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;

/** Tentativas finalizadas de ALUNOS vivos (a prévia da equipe fica fora das contas). */
const deAluno = sql`exists (select 1 from criadores_membros cm where cm.id = t.membro_id and cm.papel = 'ALUNO' and cm.is_deleted = false)`;

export async function avaliacoesDoAdmin(criadorId: string, f: { busca?: string; produtoId?: string; status?: StatusAvaliacao } = {}) {
  const condicoes: SQL[] = [eq(av.criador_id, criadorId), vivos(av), vivos(produtos)];
  if (f.busca) condicoes.push(ilike(av.titulo, curinga(f.busca)));
  if (f.produtoId) condicoes.push(eq(av.produto_id, f.produtoId));
  if (f.status) condicoes.push(eq(av.status, f.status));
  const linhas = await db
    .select({
      id: av.id,
      titulo: av.titulo,
      tipo: av.tipo,
      status: av.status,
      notaMinima: av.nota_minima,
      obrigatoriaParaCertificado: av.obrigatoria_para_certificado,
      liberaProximoModulo: av.libera_proximo_modulo,
      versao: av.updated_at,
      produto: { id: produtos.id, titulo: produtos.titulo },
      moduloId: produtos_modulos.id,
      moduloTitulo: produtos_modulos.titulo,
      questoes: sql<number>`(select count(*)::int from produtos_avaliacoes_questoes q where q.avaliacao_id = ${av.id} and q.is_deleted = false)`,
      tentativas: sql<number>`(select count(*)::int from produtos_avaliacoes_tentativas t where t.avaliacao_id = ${av.id} and t.finalizada_em is not null and t.is_deleted = false and ${deAluno})`,
      alunos: sql<number>`(select count(distinct t.membro_id)::int from produtos_avaliacoes_tentativas t where t.avaliacao_id = ${av.id} and t.finalizada_em is not null and t.is_deleted = false and ${deAluno})`,
      aprovados: sql<number>`(select count(distinct t.membro_id)::int from produtos_avaliacoes_tentativas t where t.avaliacao_id = ${av.id} and t.aprovada and t.is_deleted = false and ${deAluno})`,
      notaMedia: sql<number | null>`(select round(avg(m.melhor), 1)::float8 from (select max(t.nota) as melhor from produtos_avaliacoes_tentativas t
        where t.avaliacao_id = ${av.id} and t.finalizada_em is not null and t.is_deleted = false and ${deAluno} group by t.membro_id) m)`,
    })
    .from(av)
    .innerJoin(produtos, eq(produtos.id, av.produto_id))
    .leftJoin(produtos_modulos, and(eq(produtos_modulos.id, av.modulo_id), vivos(produtos_modulos)))
    .where(and(...condicoes))
    .orderBy(asc(produtos.titulo), sql`${produtos_modulos.ordem} nulls last`, asc(av.titulo));
  const resultado = linhas.map((l) => ({
    id: l.id,
    titulo: l.titulo,
    tipo: l.tipo,
    tipoRotulo: ROTULO_TIPO_AVALIACAO[l.tipo],
    status: l.status,
    notaMinima: l.notaMinima,
    obrigatoriaParaCertificado: l.obrigatoriaParaCertificado,
    liberaProximoModulo: l.liberaProximoModulo,
    versao: l.versao.toISOString(),
    produto: l.produto,
    modulo: l.moduloId ? { id: l.moduloId, titulo: l.moduloTitulo! } : null,
    questoes: l.questoes,
    tentativas: l.tentativas,
    alunos: l.alunos,
    aprovados: l.aprovados,
    /** aprovados ÷ alunos que tentaram (0..1); null sem tentativa. */
    taxaAprovacao: l.alunos ? l.aprovados / l.alunos : null,
    /** Média da MELHOR nota de cada aluno; null sem tentativa. */
    notaMedia: l.notaMedia,
  }));
  const comTentativa = resultado.filter((r) => r.taxaAprovacao !== null);
  return {
    resumo: {
      total: resultado.length,
      publicadas: resultado.filter((r) => r.status === "PUBLICADA").length,
      tentativas: resultado.reduce((s, r) => s + r.tentativas, 0),
      /** Média das taxas de aprovação das avaliações com tentativa (0..1). */
      aprovacaoMedia: comTentativa.length ? comTentativa.reduce((s, r) => s + r.taxaAprovacao!, 0) / comTentativa.length : null,
    },
    linhas: resultado,
  };
}

/** Editor da avaliação: campos + versão + módulos do produto + questões COM gabarito. `null` = 404. */
export async function avaliacaoParaEditar(criadorId: string, avaliacaoId: string) {
  const [a] = await db
    .select({ a: av, produtoTitulo: produtos.titulo })
    .from(av)
    .innerJoin(produtos, eq(produtos.id, av.produto_id))
    .where(and(eq(av.id, avaliacaoId), eq(av.criador_id, criadorId), vivos(av), vivos(produtos)));
  if (!a) return null;
  const [modulos, questoes] = await Promise.all([
    db
      .select({ id: produtos_modulos.id, titulo: produtos_modulos.titulo, ordem: produtos_modulos.ordem, status: produtos_modulos.status })
      .from(produtos_modulos)
      .where(and(eq(produtos_modulos.produto_id, a.a.produto_id), eq(produtos_modulos.criador_id, criadorId), vivos(produtos_modulos)))
      .orderBy(asc(produtos_modulos.ordem)),
    db
      .select()
      .from(qst)
      .where(and(eq(qst.avaliacao_id, avaliacaoId), eq(qst.criador_id, criadorId), vivos(qst)))
      .orderBy(asc(qst.ordem)),
  ]);
  const x = a.a;
  return {
    avaliacao: {
      id: x.id,
      versao: x.updated_at.toISOString(),
      produto: { id: x.produto_id, titulo: a.produtoTitulo },
      moduloId: x.modulo_id,
      status: x.status,
      publicadaEm: x.publicada_em,
      /** Mesmo formato de `camposAvaliacaoSchema` (o formulário reenvia como está). */
      campos: {
        titulo: x.titulo,
        tipo: x.tipo,
        moduloId: x.modulo_id,
        instrucoes: x.instrucoes,
        notaMinima: x.nota_minima,
        tentativasMax: x.tentativas_max,
        tempoLimiteMin: x.tempo_limite_min,
        obrigatoriaParaCertificado: x.obrigatoria_para_certificado,
        liberaProximoModulo: x.libera_proximo_modulo,
        embaralhar: x.embaralhar,
        exigeAulasConcluidas: x.exige_aulas_concluidas,
      },
    },
    modulos,
    /** `questao` no formato de `questaoSchema` (opções com `correta`); `versao` = trava. */
    questoes: questoes.map((q) => ({
      id: q.id,
      ordem: q.ordem,
      versao: q.updated_at.toISOString(),
      questao: {
        tipo: q.tipo,
        enunciado: q.enunciado,
        opcoes: q.opcoes.map((o) => ({ texto: o.texto, correta: q.gabarito.includes(o.id) })),
        peso: q.peso,
        explicacao: q.explicacao,
      },
    })),
  };
}

/** Alunos que tentaram a avaliação (melhor nota, tentativas, extras): base de "Conceder tentativa". */
export async function alunosDaAvaliacao(criadorId: string, avaliacaoId: string) {
  const [a] = await db.select({ max: av.tentativas_max }).from(av).where(and(eq(av.id, avaliacaoId), eq(av.criador_id, criadorId), vivos(av)));
  if (!a) return null;
  const linhas = await db
    .select({
      membroId: criadores_membros.id,
      nome: usuarios.nome,
      email: usuarios.email,
      imagem: usuarios.imagem,
      finalizadas: sql<number>`count(*) filter (where ${tent.finalizada_em} is not null)::int`,
      emAndamento: sql<boolean>`bool_or(${tent.finalizada_em} is null)`,
      melhorNota: sql<number | null>`max(${tent.nota})::float8`,
      aprovada: sql<boolean>`coalesce(bool_or(${tent.aprovada}), false)`,
      ultimaEm: sql<Date>`max(${tent.iniciada_em})`,
      extras: sql<number>`(select coalesce(sum(c.quantidade), 0)::int from ${conc} c where c.avaliacao_id = ${avaliacaoId}::uuid and c.membro_id = ${criadores_membros.id} and c.is_deleted = false)`,
    })
    .from(tent)
    .innerJoin(criadores_membros, eq(criadores_membros.id, tent.membro_id))
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(and(eq(tent.avaliacao_id, avaliacaoId), eq(tent.criador_id, criadorId), vivos(tent), vivos(criadores_membros), eq(criadores_membros.papel, "ALUNO")))
    .groupBy(criadores_membros.id, usuarios.id)
    .orderBy(desc(sql`max(${tent.iniciada_em})`));
  return linhas.map((l) => ({
    ...l,
    ultimaEm: new Date(l.ultimaEm),
    tentativasRestantes: tentativasRestantes(a.max, l.extras, l.finalizadas),
    /** Mostrar "Conceder +1": esgotou sem aprovar (avaliação com limite). */
    podeConceder: a.max > 0 && !l.aprovada && tentativasRestantes(a.max, l.extras, l.finalizadas) === 0,
  }));
}
