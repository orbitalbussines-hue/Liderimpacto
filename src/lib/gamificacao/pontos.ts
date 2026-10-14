import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db, type Transacao } from "@/lib/db";
import { criadores_gamificacao } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { dataEmBrasilia } from "@/lib/matriculas/regras";
import { concluirDesafiosCumpridos } from "./desafios";
import { COLUNA_DO_MOTIVO, NIVEIS_PADRAO, PONTOS_PADRAO, type MotivoAutomatico, type NivelGamificacao } from "./regras";

/**
 * CONCESSÃO de pontos (ADR-0012, RN-145). O razão `criadores_membros_pontos` é append-only: tudo
 * aqui é INSERT. Idempotência pelo índice único (membro, motivo, referência) + ON CONFLICT DO
 * NOTHING: reprocessar, clicar duas vezes ou rodar o recálculo nunca dá ponto duas vezes.
 * Só ALUNO (vínculo vivo) pontua; gamificação desligada (ou sem configuração) = nada é concedido.
 */

type Executor = Transacao | typeof db;

/** O fato que gera pontos. A referência sai do fato (id da aula/curso/avaliação; dia da publicação). */
export type Conquista =
  | { motivo: "AULA_CONCLUIDA"; aulaId: string }
  | { motivo: "CURSO_CONCLUIDO"; produtoId: string }
  | { motivo: "AVALIACAO_APROVADA"; avaliacaoId: string }
  /** Só a PRIMEIRA publicação do dia (Brasília) pontua: a referência é o dia. */
  | { motivo: "PUBLICACAO_COMUNIDADE" };

export function referenciaDa(c: Conquista, ocorridoEm: Date): string {
  switch (c.motivo) {
    case "AULA_CONCLUIDA":
      return c.aulaId;
    case "CURSO_CONCLUIDO":
      return c.produtoId;
    case "AVALIACAO_APROVADA":
      return c.avaliacaoId;
    case "PUBLICACAO_COMUNIDADE":
      return dataEmBrasilia(ocorridoEm);
  }
}

export interface EntradaConcessao {
  criadorId: string;
  membroId: string;
  conquista: Conquista;
  /** Quando o fato aconteceu (conclusão, aprovação, publicação): conta no ranking deste período. */
  ocorridoEm?: Date;
}

/** Pontos concedidos AGORA (0 = já tinha, desligada, valor 0 na configuração ou não é aluno). */
export async function concederPontos(exec: Executor, e: EntradaConcessao): Promise<number> {
  const ocorridoEm = e.ocorridoEm ?? new Date();
  const motivo: MotivoAutomatico = e.conquista.motivo;
  const valor = sql.raw(`g.${COLUNA_DO_MOTIVO[motivo]}`);
  const { rows } = await exec.execute<{ pontos: number }>(sql`
    insert into criadores_membros_pontos (criador_id, membro_id, motivo, pontos, referencia, ocorrido_em, modified_by)
    select m.criador_id, m.id, ${motivo}, ${valor}, ${referenciaDa(e.conquista, ocorridoEm)}, ${ocorridoEm}, m.usuario_id
    from criadores_membros m
    join criadores_gamificacao g on g.criador_id = m.criador_id and g.is_deleted = false and g.ligada
    where m.id = ${e.membroId}::uuid and m.criador_id = ${e.criadorId}::uuid and m.is_deleted = false and m.papel = 'ALUNO' and ${valor} > 0
    on conflict (membro_id, motivo, referencia) do nothing
    returning pontos
  `);
  return rows[0]?.pontos ?? 0;
}

/**
 * Ponto de entrada para quem liga a gamificação nos fluxos (conclusão de aula/curso, aprovação,
 * publicação): concede os pontos e conclui os desafios que ficaram cumpridos. Chamar DEPOIS do
 * commit da ação principal; NUNCA lança (falha vai para o log, a ação segue valendo).
 */
export async function registrarConquista(e: EntradaConcessao, agora = new Date()): Promise<void> {
  try {
    await concederPontos(db, e);
    await concluirDesafiosCumpridos(db, e.criadorId, e.membroId, agora);
  } catch (erro) {
    console.error("[gamificacao] falha ao registrar conquista (a ação principal já valeu):", e.conquista.motivo, erro);
  }
}

export interface EntradaAjuste {
  criadorId: string;
  membroId: string;
  /** Positivo ou negativo, nunca 0 (o CHECK do banco também recusa). */
  pontos: number;
  /** 5 a 500 caracteres: vai para o razão e para a trilha. */
  justificativa: string;
  /** DONO/ADMIN da sessão (a action confere o papel). */
  autorUsuarioId: string;
}

/**
 * AJUSTE_MANUAL (RN-145): só para ALUNO deste criador; lançamento + trilha na MESMA transação.
 * Corrigir um ajuste = outro ajuste com o sinal contrário (o razão nunca muda).
 */
export async function ajustarPontos(tx: Transacao, e: EntradaAjuste): Promise<string> {
  const justificativa = e.justificativa.trim();
  if (!Number.isInteger(e.pontos) || e.pontos === 0 || Math.abs(e.pontos) > 100_000) throw new ErroDeNegocio("Informe um ajuste diferente de zero (até 100.000 pontos).");
  if (justificativa.length < 5 || justificativa.length > 500) throw new ErroDeNegocio("Explique o ajuste (5 a 500 caracteres).");
  const { rows } = await tx.execute<{ id: string }>(sql`
    insert into criadores_membros_pontos (criador_id, membro_id, motivo, pontos, referencia, ocorrido_em, justificativa, modified_by)
    select m.criador_id, m.id, 'AJUSTE_MANUAL', ${e.pontos}::int, ${randomUUID()}, now(), ${justificativa}, ${e.autorUsuarioId}::uuid
    from criadores_membros m
    where m.id = ${e.membroId}::uuid and m.criador_id = ${e.criadorId}::uuid and m.is_deleted = false and m.papel = 'ALUNO'
    returning id
  `);
  const id = rows[0]?.id;
  if (!id) throw new ErroDeNegocio("Aluno não encontrado nesta área.");
  await registrarAuditoria(tx, {
    userId: e.autorUsuarioId,
    criadorId: e.criadorId,
    acao: "criar",
    tabela: "criadores_membros_pontos",
    registroId: id,
    detalhes: `Ajuste manual de ${e.pontos > 0 ? "+" : ""}${e.pontos} pontos para o membro ${e.membroId}: ${justificativa}`,
    dadosNovos: { membro_id: e.membroId, pontos: e.pontos, justificativa },
  });
  return id;
}

export interface ConfigGamificacaoLida {
  /** Nulo = o criador nunca salvou (vale o padrão, DESLIGADA). */
  id: string | null;
  updatedAt: Date | null;
  ligada: boolean;
  pontos: { aulaConcluida: number; cursoConcluido: number; avaliacaoAprovada: number; publicacaoComunidade: number };
  niveis: NivelGamificacao[];
}

/** Configuração do criador (ou o padrão desligado). A tela de config usa `updatedAt` como trava. */
export async function configDaGamificacao(criadorId: string, exec: Executor = db): Promise<ConfigGamificacaoLida> {
  const g = criadores_gamificacao;
  const [l] = await exec.select().from(g).where(and(eq(g.criador_id, criadorId), vivos(g)));
  if (!l) return { id: null, updatedAt: null, ligada: false, pontos: { ...PONTOS_PADRAO }, niveis: [...NIVEIS_PADRAO] };
  return {
    id: l.id,
    updatedAt: l.updated_at,
    ligada: l.ligada,
    pontos: {
      aulaConcluida: l.pontos_aula_concluida,
      cursoConcluido: l.pontos_curso_concluido,
      avaliacaoAprovada: l.pontos_avaliacao_aprovada,
      publicacaoComunidade: l.pontos_publicacao_comunidade,
    },
    niveis: l.niveis,
  };
}
