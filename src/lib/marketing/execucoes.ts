import "server-only";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import {
  criadores_automacoes as auto,
  criadores_automacoes_execucoes as exec,
  criadores_emails_envios as envios,
  criadores_membros as m,
  criadores_membros_tags,
  criadores_tags,
  usuarios as u,
} from "@/lib/db/schema";
import { GATILHOS_COM_DIAS } from "@/lib/db/schema/_enums";
import { vivos } from "@/lib/db/soft-delete";
import { MOTIVOS_ENVIO, REFERENCIA_NUNCA_ACESSOU } from "./regras";

/**
 * EXECUÇÃO de automação (7º Worker, fila `marketing`): na hora marcada (atraso), aplica a tag e/ou cria
 * o ENVIO do e-mail (`automacao:<execução>`, idempotente) — o envio segue pela fila `emails` com teto
 * e descadastro. Automação pausada/excluída ou membro inativo = IGNORADA. Atualização de sistema: não
 * mexe em `updated_at`. A tag aplicada vai para a trilha como evento do sistema (sem usuário).
 */

export type ResultadoExecucao = { r: "executada"; envioId: string | null } | { r: "ignorada" } | { r: "cedo"; quando: Date };

export async function processarExecucao(execucaoId: string, agora = new Date()): Promise<ResultadoExecucao> {
  const [x] = await db
    .select({
      exec,
      automacaoOk: sql<boolean>`${auto.situacao} = 'ATIVA' and not ${auto.is_deleted}`,
      nome: auto.nome,
      conteudo: auto.conteudo,
      tagId: auto.tag_id,
      membroOk: sql<boolean>`${m.status} = 'ATIVO' and not ${m.is_deleted}`,
    })
    .from(exec)
    .innerJoin(auto, eq(auto.id, exec.automacao_id))
    .innerJoin(m, eq(m.id, exec.membro_id))
    .where(and(eq(exec.id, execucaoId), vivos(exec)));
  if (!x || x.exec.situacao !== "AGENDADA") return { r: "ignorada" };
  if (x.exec.executar_em.getTime() > agora.getTime() + 5000) return { r: "cedo", quando: x.exec.executar_em };
  const { criador_id: criadorId, membro_id: membroId } = x.exec;
  const fechar = (campos: Partial<typeof exec.$inferInsert>) =>
    db.update(exec).set({ executada_em: agora, ...campos }).where(and(eq(exec.id, execucaoId), eq(exec.situacao, "AGENDADA")));
  if (!x.automacaoOk) {
    await fechar({ situacao: "IGNORADA", motivo: MOTIVOS_ENVIO.PAUSADA });
    return { r: "ignorada" };
  }
  if (!x.membroOk) {
    await fechar({ situacao: "IGNORADA", motivo: MOTIVOS_ENVIO.MEMBRO });
    return { r: "ignorada" };
  }

  const envioId = await db.transaction(async (tx) => {
    let tagAplicada = false;
    if (x.tagId) {
      const [tag] = await tx.select({ nome: criadores_tags.nome }).from(criadores_tags).where(and(eq(criadores_tags.id, x.tagId), vivos(criadores_tags)));
      const nova = tag
        ? await tx.insert(criadores_membros_tags).values({ criador_id: criadorId, membro_id: membroId, tag_id: x.tagId, modified_by: x.exec.modified_by }).onConflictDoNothing().returning({ id: criadores_membros_tags.id })
        : [];
      tagAplicada = !!tag;
      if (nova.length) {
        await registrarAuditoria(tx, {
          userId: null,
          criadorId,
          acao: "criar",
          tabela: "criadores_membros_tags",
          registroId: x.tagId,
          detalhes: `Automação "${x.nome}" marcou 1 membro com a tag "${tag!.nome}"`,
          dadosNovos: { membro_ids: [membroId], execucao_id: execucaoId },
        });
      }
    }
    let id: string | null = null;
    if (x.conteudo) {
      const chave = `automacao:${execucaoId}`;
      const [novo] = await tx
        .insert(envios)
        .values({ criador_id: criadorId, membro_id: membroId, origem: "AUTOMACAO", automacao_id: x.exec.automacao_id, chave, modified_by: x.exec.modified_by })
        .onConflictDoNothing()
        .returning({ id: envios.id });
      id = novo?.id ?? (await tx.select({ id: envios.id }).from(envios).where(and(eq(envios.criador_id, criadorId), eq(envios.chave, chave))))[0]?.id ?? null;
    }
    await tx
      .update(exec)
      .set({ situacao: "CONCLUIDA", executada_em: agora, tag_aplicada: tagAplicada, envio_id: id })
      .where(and(eq(exec.id, execucaoId), eq(exec.situacao, "AGENDADA")));
    return id;
  });
  return { r: "executada", envioId };
}

/**
 * VARREDURA DIÁRIA (job repetido da fila `marketing`): INATIVIDADE = sem acessar há N dias (uma vez por
 * "episódio": a referência é o último acesso; voltou e sumiu de novo = dispara de novo); NUNCA_ACESSOU =
 * cadastrado há N dias e nunca entrou (uma vez). Devolve as execuções novas para o worker enfileirar.
 */
export async function varreduraDiaria(agora = new Date()): Promise<{ id: string; quando: Date }[]> {
  const autos = await db
    .select({ id: auto.id, criadorId: auto.criador_id, gatilho: auto.gatilho, dias: auto.dias, atraso: auto.atraso_minutos, autor: auto.modified_by })
    .from(auto)
    .where(and(inArray(auto.gatilho, [...GATILHOS_COM_DIAS]), eq(auto.situacao, "ATIVA"), vivos(auto)));
  const novas: { id: string; quando: Date }[] = [];
  for (const a of autos) {
    const limite = new Date(agora.getTime() - (a.dias ?? 1) * 86_400_000);
    const inatividade = a.gatilho === "INATIVIDADE";
    const condicao = inatividade ? lt(m.ultimo_acesso_em, limite) : and(isNull(m.ultimo_acesso_em), lt(m.created_at, limite));
    // Referência = o "episódio" (ISO do último acesso, igual ao toISOString) — já disparado fica de fora da busca.
    const referencia = inatividade
      ? sql<string>`'inativo:' || to_char(${m.ultimo_acesso_em} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
      : sql<string>`${REFERENCIA_NUNCA_ACESSOU}`;
    const jaFoi = sql`exists (select 1 from criadores_automacoes_execucoes x where x.automacao_id = ${a.id} and x.membro_id = ${m.id} and x.referencia = ${referencia})`;
    const pessoas = await db
      .select({ membroId: m.id, referencia })
      .from(m)
      .innerJoin(u, eq(u.id, m.usuario_id))
      .where(and(eq(m.criador_id, a.criadorId), vivos(m), eq(m.status, "ATIVO"), eq(m.papel, "ALUNO"), vivos(u), eq(u.ativo, true), condicao, sql`not ${jaFoi}`))
      .limit(10_000); // ponytail: teto por automação por dia; o resto entra na varredura de amanhã
    if (!pessoas.length) continue;
    const quando = new Date(agora.getTime() + a.atraso * 60_000);
    for (let i = 0; i < pessoas.length; i += 1000) {
      const criadas = await db
        .insert(exec)
        .values(
          pessoas.slice(i, i + 1000).map((p) => ({
            criador_id: a.criadorId,
            automacao_id: a.id,
            membro_id: p.membroId,
            referencia: p.referencia,
            executar_em: quando,
            modified_by: a.autor,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: exec.id, quando: exec.executar_em });
      novas.push(...criadas);
    }
  }
  return novas;
}
