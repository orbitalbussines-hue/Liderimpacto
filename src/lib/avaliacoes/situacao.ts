import "server-only";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, type Transacao } from "@/lib/db";
import type { PapelCriador, StatusModulo, StatusProduto } from "@/lib/db/schema/_enums";
import { produtos, produtos_avaliacoes as av, produtos_modulos } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { motivoDaAvaliacao, tentativasRestantes, type MotivoAvaliacao } from "./regras";
import { aprovadoSql, avaliacaoPendenteSql } from "./sql";

/**
 * Situação de um membro em várias avaliações numa ida ao banco: o que `motivoDaAvaliacao` precisa
 * (matrícula, módulo travado, aulas pendentes, tentativas, concessões) + o que os cards mostram.
 * Base de `disponibilidade`, `iniciarTentativa`, da lista do aluno e das trilhas. Sempre do
 * criador do HOST; só avaliações vivas de produto e módulo vivos.
 */

export interface QuemAvalia {
  criadorId: string;
  /** Nulo = SUPER_ADMIN sem vínculo: nunca faz tentativa. */
  membroId: string | null;
  papel: PapelCriador | null;
}

export interface SituacaoAvaliacao {
  id: string;
  titulo: string;
  tipo: (typeof av.$inferSelect)["tipo"];
  status: (typeof av.$inferSelect)["status"];
  instrucoes: string;
  notaMinima: number;
  tentativasMax: number;
  tempoLimiteMin: number | null;
  embaralhar: boolean;
  exigeAulasConcluidas: boolean;
  obrigatoriaParaCertificado: boolean;
  liberaProximoModulo: boolean;
  produto: { id: string; titulo: string; slug: string; status: StatusProduto };
  modulo: { id: string; titulo: string; ordem: number; status: StatusModulo } | null;
  questoes: number;
  matriculaValendo: boolean;
  moduloTravado: boolean;
  aulasPendentes: number;
  finalizadas: number;
  extras: number;
  aberta: { id: string; prazoEm: Date | null } | null;
  aprovada: boolean;
  melhorNota: number | null;
  restantes: number | null;
  /** null = pode iniciar (ou retomar a aberta). */
  motivo: MotivoAvaliacao | null;
}

export async function situacoesDoMembro(
  quem: QuemAvalia,
  filtro: { avaliacaoIds?: readonly string[]; somentePublicadas?: boolean; condicao?: SQL },
  agora: Date = new Date(),
  exec: Transacao | typeof db = db,
): Promise<SituacaoAvaliacao[]> {
  const m = quem.membroId;
  // `t` é sempre um apelido fixo daqui; o id vai como parâmetro.
  const doMembro = (t: string) => (m ? sql`${sql.raw(t)}.membro_id = ${m}::uuid` : sql`false`);
  const linhas = await exec
    .select({
      id: av.id,
      titulo: av.titulo,
      tipo: av.tipo,
      status: av.status,
      instrucoes: av.instrucoes,
      notaMinima: av.nota_minima,
      tentativasMax: av.tentativas_max,
      tempoLimiteMin: av.tempo_limite_min,
      embaralhar: av.embaralhar,
      exigeAulasConcluidas: av.exige_aulas_concluidas,
      obrigatoriaParaCertificado: av.obrigatoria_para_certificado,
      liberaProximoModulo: av.libera_proximo_modulo,
      produtoId: produtos.id,
      produtoTitulo: produtos.titulo,
      produtoSlug: produtos.slug,
      produtoStatus: produtos.status,
      moduloId: produtos_modulos.id,
      moduloTitulo: produtos_modulos.titulo,
      moduloOrdem: produtos_modulos.ordem,
      moduloStatus: produtos_modulos.status,
      questoes: sql<number>`(select count(*)::int from produtos_avaliacoes_questoes q where q.avaliacao_id = ${av.id} and q.is_deleted = false)`,
      matriculaValendo: sql<boolean>`exists (select 1 from produtos_matriculas pm where ${doMembro("pm")} and pm.produto_id = ${produtos.id}
        and pm.is_deleted = false and pm.status = 'ATIVA' and (pm.expira_em is null or pm.expira_em > ${agora}))`,
      moduloTravado: avaliacaoPendenteSql(av.modulo_id, m),
      aulasPendentes: sql<number>`(select count(*)::int from produtos_modulos_aulas a join produtos_modulos mo on mo.id = a.modulo_id
        where mo.produto_id = ${produtos.id} and (${av.modulo_id} is null or mo.id = ${av.modulo_id})
          and mo.status = 'PUBLICADO' and mo.is_deleted = false and a.is_deleted = false
          and not exists (select 1 from produtos_modulos_aulas_progressos pr where pr.aula_id = a.id and ${doMembro("pr")} and pr.concluida and pr.is_deleted = false))`,
      finalizadas: sql<number>`(select count(*)::int from produtos_avaliacoes_tentativas t where t.avaliacao_id = ${av.id} and ${doMembro("t")}
        and t.finalizada_em is not null and t.is_deleted = false)`,
      extras: sql<number>`(select coalesce(sum(c.quantidade), 0)::int from produtos_avaliacoes_concessoes c where c.avaliacao_id = ${av.id} and ${doMembro("c")} and c.is_deleted = false)`,
      abertaId: sql<string | null>`(select t.id from produtos_avaliacoes_tentativas t where t.avaliacao_id = ${av.id} and ${doMembro("t")}
        and t.finalizada_em is null and t.is_deleted = false)`,
      abertaPrazo: sql<string | null>`(select t.prazo_em from produtos_avaliacoes_tentativas t where t.avaliacao_id = ${av.id} and ${doMembro("t")}
        and t.finalizada_em is null and t.is_deleted = false)`,
      aprovada: aprovadoSql(av.id, m),
      melhorNota: sql<number | null>`(select max(t.nota)::float8 from produtos_avaliacoes_tentativas t where t.avaliacao_id = ${av.id} and ${doMembro("t")} and t.is_deleted = false)`,
    })
    .from(av)
    .innerJoin(produtos, eq(produtos.id, av.produto_id))
    .leftJoin(produtos_modulos, eq(produtos_modulos.id, av.modulo_id))
    .where(
      and(
        eq(av.criador_id, quem.criadorId),
        vivos(av),
        vivos(produtos),
        sql`(${av.modulo_id} is null or ${produtos_modulos.is_deleted} = false)`,
        filtro.avaliacaoIds ? inArray(av.id, [...filtro.avaliacaoIds]) : undefined,
        filtro.somentePublicadas ? eq(av.status, "PUBLICADA") : undefined,
        filtro.condicao,
      ),
    );
  return linhas.map((l) => {
    const restantes = tentativasRestantes(l.tentativasMax, l.extras, l.finalizadas);
    const aberta = l.abertaId ? { id: l.abertaId, prazoEm: l.abertaPrazo ? new Date(l.abertaPrazo) : null } : null;
    const motivo = motivoDaAvaliacao({
      papel: quem.papel,
      temVinculo: !!m,
      status: l.status,
      statusProduto: l.produtoStatus,
      statusModulo: l.moduloId ? l.moduloStatus : null,
      matriculaValendo: l.matriculaValendo,
      moduloTravado: l.moduloTravado,
      exigeAulasConcluidas: l.exigeAulasConcluidas,
      aulasPendentes: l.aulasPendentes,
      temAberta: !!aberta,
      restantes,
    });
    return {
      id: l.id,
      titulo: l.titulo,
      tipo: l.tipo,
      status: l.status,
      instrucoes: l.instrucoes,
      notaMinima: l.notaMinima,
      tentativasMax: l.tentativasMax,
      tempoLimiteMin: l.tempoLimiteMin,
      embaralhar: l.embaralhar,
      exigeAulasConcluidas: l.exigeAulasConcluidas,
      obrigatoriaParaCertificado: l.obrigatoriaParaCertificado,
      liberaProximoModulo: l.liberaProximoModulo,
      produto: { id: l.produtoId, titulo: l.produtoTitulo, slug: l.produtoSlug, status: l.produtoStatus },
      modulo: l.moduloId ? { id: l.moduloId, titulo: l.moduloTitulo!, ordem: l.moduloOrdem!, status: l.moduloStatus! } : null,
      questoes: l.questoes,
      matriculaValendo: l.matriculaValendo,
      moduloTravado: l.moduloTravado,
      aulasPendentes: l.aulasPendentes,
      finalizadas: l.finalizadas,
      extras: l.extras,
      aberta,
      aprovada: l.aprovada,
      melhorNota: l.melhorNota,
      // A equipe faz prévia sem limite.
      restantes: quem.papel === "ALUNO" ? restantes : null,
      motivo,
    };
  });
}

/** `disponibilidade(membro, avaliação)`: `null` = não existe neste criador. */
export async function disponibilidade(quem: QuemAvalia, avaliacaoId: string, agora: Date = new Date()): Promise<SituacaoAvaliacao | null> {
  return (await situacoesDoMembro(quem, { avaliacaoIds: [avaliacaoId] }, agora))[0] ?? null;
}
