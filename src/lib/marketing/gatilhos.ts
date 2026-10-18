import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  criadores_automacoes as auto,
  criadores_automacoes_execucoes as exec,
  criadores_membros as m,
  criadores_vouchers_resgates,
  produtos_certificados,
  produtos_matriculas,
  produtos_modulos,
  produtos_modulos_aulas,
} from "@/lib/db/schema";
import type { GatilhoAutomacao } from "@/lib/db/schema/_enums";
import { vivos } from "@/lib/db/soft-delete";
import { enfileirarMarketingComPrazo } from "./fila";

/**
 * GANCHOS das automações (RN-225): chamados DEPOIS do commit, nos MESMOS pontos onde os webhooks de
 * saída são emitidos (`webhooks/emitir.ts`), e NUNCA lançam (o gatilho não derruba a matrícula, a
 * conclusão nem o certificado). Sem automação ATIVA no gatilho = uma consulta e pronto. Senão: uma
 * EXECUÇÃO por (automação, membro, referência) — o índice único faz o mesmo evento disparar 1x — e o
 * job atrasado pelo `atraso_minutos` na fila `marketing`. Só ALUNO com vínculo ativo entra.
 */

export interface AlvoDoGatilho {
  membroId: string;
  /** Identidade do evento (ex.: `matricula:<id>`): repetir o evento não repete a ação. */
  referencia: string;
  /** Curso do evento (filtro "só deste curso"). */
  produtoId?: string | null;
}

export async function dispararAutomacoes(criadorId: string, gatilho: GatilhoAutomacao, alvos: readonly AlvoDoGatilho[], agora = new Date()): Promise<number> {
  if (!alvos.length) return 0;
  try {
    const ativas = await db
      .select({ id: auto.id, produtoId: auto.produto_id, atraso: auto.atraso_minutos, autor: auto.modified_by })
      .from(auto)
      .where(and(eq(auto.criador_id, criadorId), eq(auto.gatilho, gatilho), eq(auto.situacao, "ATIVA"), vivos(auto)));
    if (!ativas.length) return 0;
    const ids = [...new Set(alvos.map((a) => a.membroId))];
    const alunos = new Set(
      (
        await db
          .select({ id: m.id })
          .from(m)
          .where(and(inArray(m.id, ids), eq(m.criador_id, criadorId), eq(m.papel, "ALUNO"), eq(m.status, "ATIVO"), vivos(m)))
      ).map((x) => x.id),
    );
    const linhas = ativas.flatMap((a) =>
      alvos
        .filter((x) => alunos.has(x.membroId) && (!a.produtoId || x.produtoId === a.produtoId))
        .map((x) => ({
          criador_id: criadorId,
          automacao_id: a.id,
          membro_id: x.membroId,
          referencia: x.referencia.slice(0, 200),
          executar_em: new Date(agora.getTime() + a.atraso * 60_000),
          modified_by: a.autor,
        })),
    );
    if (!linhas.length) return 0;
    const criadas = await db.insert(exec).values(linhas).onConflictDoNothing().returning({ id: exec.id, quando: exec.executar_em });
    await enfileirarMarketingComPrazo(criadas.map((c) => ({ job: { tipo: "execucao" as const, execucaoId: c.id }, quando: c.quando })));
    return criadas.length;
  } catch (e) {
    console.error(`CRITICAL [automacoes] gatilho ${gatilho} não processado:`, e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Cada função abaixo traduz o evento em alvos; o erro de leitura também é engolido (nunca lança). */
async function seguro(gatilho: GatilhoAutomacao, criadorId: string, alvos: () => Promise<AlvoDoGatilho[]>): Promise<number> {
  try {
    return await dispararAutomacoes(criadorId, gatilho, await alvos());
  } catch (e) {
    console.error(`CRITICAL [automacoes] gatilho ${gatilho} não lido:`, e instanceof Error ? e.message : e);
    return 0;
  }
}

export const automacaoMembrosCadastrados = (criadorId: string, membroIds: readonly string[]) =>
  seguro("MEMBRO_CADASTRADO", criadorId, async () => membroIds.map((membroId) => ({ membroId, referencia: "cadastro" })));

export const automacaoMatriculas = (criadorId: string, matriculaIds: readonly string[]) =>
  seguro("MATRICULA_CRIADA", criadorId, async () =>
    matriculaIds.length
      ? (
          await db
            .select({ id: produtos_matriculas.id, membroId: produtos_matriculas.membro_id, produtoId: produtos_matriculas.produto_id })
            .from(produtos_matriculas)
            .where(and(inArray(produtos_matriculas.id, [...matriculaIds]), eq(produtos_matriculas.criador_id, criadorId)))
        ).map((x) => ({ membroId: x.membroId, produtoId: x.produtoId, referencia: `matricula:${x.id}` }))
      : [],
  );

export const automacaoAulaConcluida = (criadorId: string, membroId: string, aulaId: string) =>
  seguro("AULA_CONCLUIDA", criadorId, async () => {
    const [a] = await db
      .select({ produtoId: produtos_modulos.produto_id })
      .from(produtos_modulos_aulas)
      .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
      .where(and(eq(produtos_modulos_aulas.id, aulaId), eq(produtos_modulos_aulas.criador_id, criadorId)));
    return a ? [{ membroId, produtoId: a.produtoId, referencia: `aula:${aulaId}` }] : [];
  });

export const automacaoCursoConcluido = (criadorId: string, membroId: string, produtoId: string) =>
  seguro("CURSO_CONCLUIDO", criadorId, async () => [{ membroId, produtoId, referencia: `curso:${produtoId}` }]);

export const automacaoCertificadoEmitido = (criadorId: string, certificadoId: string) =>
  seguro("CERTIFICADO_EMITIDO", criadorId, async () => {
    const [c] = await db
      .select({ membroId: produtos_certificados.membro_id, produtoId: produtos_certificados.produto_id })
      .from(produtos_certificados)
      .where(and(eq(produtos_certificados.id, certificadoId), eq(produtos_certificados.criador_id, criadorId)));
    return c ? [{ ...c, referencia: `certificado:${certificadoId}` }] : [];
  });

export const automacaoVoucherResgatado = (criadorId: string, resgateId: string) =>
  seguro("VOUCHER_RESGATADO", criadorId, async () => {
    const [r] = await db
      .select({ membroId: criadores_vouchers_resgates.membro_id })
      .from(criadores_vouchers_resgates)
      .where(and(eq(criadores_vouchers_resgates.id, resgateId), eq(criadores_vouchers_resgates.criador_id, criadorId)));
    return r ? [{ membroId: r.membroId, referencia: `voucher:${resgateId}` }] : [];
  });

/** AGENDADAS (fila fora do ar no gatilho): o worker reenfileira ao subir, com o atraso que falta. */
export async function execucoesAgendadas(limite = 20_000): Promise<{ id: string; quando: Date }[]> {
  return db
    .select({ id: exec.id, quando: exec.executar_em })
    .from(exec)
    .where(and(eq(exec.situacao, "AGENDADA"), vivos(exec)))
    .orderBy(sql`${exec.executar_em} asc`)
    .limit(limite);
}
