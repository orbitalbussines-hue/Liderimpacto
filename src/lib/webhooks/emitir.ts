import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { EventoWebhook } from "@/lib/db/schema/_enums";
import {
  criadores,
  criadores_membros,
  criadores_webhooks as wh,
  criadores_webhooks_entregas as ent,
  produtos,
  produtos_avaliacoes,
  produtos_certificados,
  produtos_matriculas,
  produtos_modulos,
  produtos_modulos_aulas,
  usuarios,
  type PayloadWebhook,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { enfileirarEntregasComPrazo } from "./fila";

/**
 * EMISSÃO de eventos para os webhooks (RN-204). Chamado DEPOIS do commit da ação de negócio e
 * NUNCA lança (o evento não pode derrubar a matrícula/conclusão). Sem webhook ATIVO inscrito no
 * evento = uma consulta e pronto. Senão: uma ENTREGA por webhook (payload fixo, reusado em toda
 * tentativa) e o job na fila `webhooks`. Dados da pessoa: id, nome e e-mail (o receptor é o sistema
 * do próprio criador, que já tem esses dados).
 */

async function seguro(rotulo: string, f: () => Promise<number>): Promise<number> {
  try {
    return await f();
  } catch (e) {
    console.error(`CRITICAL [webhooks] evento ${rotulo} não emitido:`, e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Grava as entregas de cada `dados` para os webhooks inscritos e enfileira. Devolve quantas. */
export async function emitirEvento(criadorId: string, evento: EventoWebhook, lista: readonly Record<string, unknown>[], autorId: string | null, agora = new Date()): Promise<string[]> {
  if (!lista.length) return [];
  const inscritos = await db
    .select({ id: wh.id, dono: wh.modified_by })
    .from(wh)
    .where(and(eq(wh.criador_id, criadorId), eq(wh.situacao, "ATIVO"), vivos(wh), sql`${evento} = any(${wh.eventos})`));
  if (!inscritos.length) return [];
  const [c] = await db.select({ slug: criadores.slug }).from(criadores).where(eq(criadores.id, criadorId));
  const linhas = lista.flatMap((dados) => {
    const payload: PayloadWebhook = { id: randomUUID(), evento, ocorridoEm: agora.toISOString(), criador: { id: criadorId, slug: c.slug }, dados };
    return inscritos.map((w) => ({ criador_id: criadorId, webhook_id: w.id, evento, payload, modified_by: autorId ?? w.dono }));
  });
  const ids = (await db.insert(ent).values(linhas).returning({ id: ent.id })).map((l) => l.id);
  await enfileirarEntregasComPrazo(ids);
  return ids;
}

/** Quem tem webhook ATIVO no evento (atalho antes de montar o payload). */
async function temInscritos(criadorId: string, evento: EventoWebhook): Promise<boolean> {
  const [w] = await db
    .select({ id: wh.id })
    .from(wh)
    .where(and(eq(wh.criador_id, criadorId), eq(wh.situacao, "ATIVO"), vivos(wh), sql`${evento} = any(${wh.eventos})`))
    .limit(1);
  return !!w;
}

const membroJson = sql<{ id: string; nome: string; email: string }>`json_build_object('id', ${criadores_membros.id}, 'nome', ${usuarios.nome}, 'email', ${usuarios.email})`;

async function dadosDoMembro(criadorId: string, membroId: string) {
  const [m] = await db
    .select({ membro: membroJson })
    .from(criadores_membros)
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(and(eq(criadores_membros.id, membroId), eq(criadores_membros.criador_id, criadorId)));
  return m?.membro ?? null;
}

/** MATRICULA_CRIADA (criada/reativada) ou MATRICULA_CANCELADA, uma por matrícula. */
export async function webhookMatriculas(criadorId: string, matriculaIds: readonly string[], evento: "MATRICULA_CRIADA" | "MATRICULA_CANCELADA", autorId: string | null): Promise<number> {
  if (!matriculaIds.length) return 0;
  return seguro(evento, async () => {
    if (!(await temInscritos(criadorId, evento))) return 0;
    const linhas = await db
      .select({
        matricula: sql<Record<string, unknown>>`json_build_object('id', ${produtos_matriculas.id}, 'origem', ${produtos_matriculas.origem}, 'status', ${produtos_matriculas.status}, 'expiraEm', ${produtos_matriculas.expira_em})`,
        membro: membroJson,
        produto: sql<Record<string, unknown>>`json_build_object('id', ${produtos.id}, 'titulo', ${produtos.titulo})`,
      })
      .from(produtos_matriculas)
      .innerJoin(criadores_membros, eq(criadores_membros.id, produtos_matriculas.membro_id))
      .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
      .innerJoin(produtos, eq(produtos.id, produtos_matriculas.produto_id))
      .where(and(inArray(produtos_matriculas.id, [...matriculaIds]), eq(produtos_matriculas.criador_id, criadorId)));
    return (await emitirEvento(criadorId, evento, linhas, autorId)).length;
  });
}

export async function webhookMembrosCadastrados(criadorId: string, membroIds: readonly string[], autorId: string): Promise<number> {
  if (!membroIds.length) return 0;
  return seguro("MEMBRO_CADASTRADO", async () => {
    if (!(await temInscritos(criadorId, "MEMBRO_CADASTRADO"))) return 0;
    const linhas = await db
      .select({ membro: membroJson, papel: criadores_membros.papel })
      .from(criadores_membros)
      .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
      .where(and(inArray(criadores_membros.id, [...membroIds]), eq(criadores_membros.criador_id, criadorId)));
    return (await emitirEvento(criadorId, "MEMBRO_CADASTRADO", linhas, autorId)).length;
  });
}

export async function webhookAulaConcluida(criadorId: string, membroId: string, aulaId: string): Promise<number> {
  return seguro("AULA_CONCLUIDA", async () => {
    if (!(await temInscritos(criadorId, "AULA_CONCLUIDA"))) return 0;
    const membro = await dadosDoMembro(criadorId, membroId);
    const [a] = await db
      .select({ aula: sql<Record<string, unknown>>`json_build_object('id', ${produtos_modulos_aulas.id}, 'titulo', ${produtos_modulos_aulas.titulo})`, produto: sql<Record<string, unknown>>`json_build_object('id', ${produtos.id}, 'titulo', ${produtos.titulo})` })
      .from(produtos_modulos_aulas)
      .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
      .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id))
      .where(and(eq(produtos_modulos_aulas.id, aulaId), eq(produtos_modulos_aulas.criador_id, criadorId)));
    if (!membro || !a) return 0;
    return (await emitirEvento(criadorId, "AULA_CONCLUIDA", [{ membro, ...a }], null)).length;
  });
}

export async function webhookCursoConcluido(criadorId: string, membroId: string, produtoId: string): Promise<number> {
  return seguro("CURSO_CONCLUIDO", async () => {
    if (!(await temInscritos(criadorId, "CURSO_CONCLUIDO"))) return 0;
    const membro = await dadosDoMembro(criadorId, membroId);
    const [p] = await db.select({ id: produtos.id, titulo: produtos.titulo }).from(produtos).where(and(eq(produtos.id, produtoId), eq(produtos.criador_id, criadorId)));
    if (!membro || !p) return 0;
    return (await emitirEvento(criadorId, "CURSO_CONCLUIDO", [{ membro, produto: p }], null)).length;
  });
}

export async function webhookAvaliacaoAprovada(criadorId: string, membroId: string, avaliacaoId: string, nota: number): Promise<number> {
  return seguro("AVALIACAO_APROVADA", async () => {
    if (!(await temInscritos(criadorId, "AVALIACAO_APROVADA"))) return 0;
    const membro = await dadosDoMembro(criadorId, membroId);
    const [a] = await db
      .select({ id: produtos_avaliacoes.id, titulo: produtos_avaliacoes.titulo, produtoId: produtos_avaliacoes.produto_id })
      .from(produtos_avaliacoes)
      .where(and(eq(produtos_avaliacoes.id, avaliacaoId), eq(produtos_avaliacoes.criador_id, criadorId)));
    if (!membro || !a) return 0;
    return (await emitirEvento(criadorId, "AVALIACAO_APROVADA", [{ membro, avaliacao: a, nota }], null)).length;
  });
}

export async function webhookCertificadoEmitido(criadorId: string, certificadoId: string): Promise<number> {
  return seguro("CERTIFICADO_EMITIDO", async () => {
    if (!(await temInscritos(criadorId, "CERTIFICADO_EMITIDO"))) return 0;
    const [c] = await db
      .select({ certificado: sql<Record<string, unknown>>`json_build_object('id', ${produtos_certificados.id}, 'codigo', ${produtos_certificados.codigo})`, membroId: produtos_certificados.membro_id, produto: sql<Record<string, unknown>>`json_build_object('id', ${produtos.id}, 'titulo', ${produtos.titulo})` })
      .from(produtos_certificados)
      .innerJoin(produtos, eq(produtos.id, produtos_certificados.produto_id))
      .where(and(eq(produtos_certificados.id, certificadoId), eq(produtos_certificados.criador_id, criadorId)));
    const membro = c ? await dadosDoMembro(criadorId, c.membroId) : null;
    if (!c || !membro) return 0;
    return (await emitirEvento(criadorId, "CERTIFICADO_EMITIDO", [{ membro, certificado: c.certificado, produto: c.produto }], null)).length;
  });
}
