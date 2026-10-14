/**
 * Apoio dos testes do passo 5 (PostgreSQL real): catálogo publicado montado direto no banco (o
 * caminho pelas actions já é provado em catalogo.test.ts), aluno matriculado e o `QuemPede`.
 * Importar só dentro do teste (depois do _ambiente.ts).
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { PapelCriador, StatusModulo, StatusProduto, TipoProduto } from "@/lib/db/schema/_enums";
import { produtos, produtos_matriculas, produtos_modulos, produtos_modulos_aulas, produtos_modulos_aulas_progressos } from "@/lib/db/schema";
import type { QuemPede } from "@/lib/progresso/visao";
import { novoUsuario, vincular } from "./_apoio";

let codigo = 1;

export interface OpcoesCurso {
  aulas?: number;
  duracao?: number;
  status?: StatusProduto;
  statusModulo?: StatusModulo;
  tipo?: TipoProduto;
  publicadoEm?: Date | null;
}

/** Produto com UM módulo e N aulas com duração (vídeo "processado"). */
export async function cursoPronto(criadorId: string, o: OpcoesCurso = {}) {
  const n = codigo++;
  const status = o.status ?? "PUBLICADO";
  const [produto] = await db
    .insert(produtos)
    .values({
      criador_id: criadorId,
      codigo: n,
      titulo: `Curso ${n}`,
      slug: `curso-${n}-${randomUUID().slice(0, 8)}`,
      status,
      tipo: o.tipo ?? "CURSO",
      publicado_em: o.publicadoEm === undefined ? (status === "RASCUNHO" ? null : new Date()) : o.publicadoEm,
      modified_by: criadorId,
    })
    .returning();
  const modulo = await novoModulo(criadorId, produto.id, 1, o.statusModulo ?? "PUBLICADO");
  const aulas = [];
  for (let i = 1; i <= (o.aulas ?? 3); i++) aulas.push(await novaAula(criadorId, modulo.id, i, o.duracao ?? 100));
  return { produto, modulo, aulas };
}

export async function novoModulo(criadorId: string, produtoId: string, ordem: number, status: StatusModulo = "PUBLICADO") {
  const [m] = await db.insert(produtos_modulos).values({ criador_id: criadorId, produto_id: produtoId, ordem, titulo: `Módulo ${ordem}`, status, modified_by: criadorId }).returning();
  return m;
}

export async function novaAula(criadorId: string, moduloId: string, ordem: number, duracao: number | null = 100) {
  const [a] = await db
    .insert(produtos_modulos_aulas)
    .values({ criador_id: criadorId, modulo_id: moduloId, ordem, titulo: `Aula ${ordem}`, duracao_seg: duracao, modified_by: criadorId })
    .returning();
  return a;
}

export async function membroCom(criadorId: string, papel: PapelCriador = "ALUNO") {
  const usuario = await novoUsuario();
  return { usuario, membro: await vincular(criadorId, usuario.id, papel) };
}

export async function matricular(criadorId: string, membroId: string, produtoId: string, expiraEm: Date | null = null) {
  const [m] = await db
    .insert(produtos_matriculas)
    .values({ criador_id: criadorId, membro_id: membroId, produto_id: produtoId, origem: "MANUAL", expira_em: expiraEm, modified_by: criadorId })
    .returning();
  return m;
}

/** Aluno com matrícula valendo no produto. */
export async function alunoMatriculado(criadorId: string, produtoId: string) {
  const a = await membroCom(criadorId, "ALUNO");
  await matricular(criadorId, a.membro.id, produtoId);
  return a;
}

export const quem = (criadorId: string, p: { usuario: { id: string }; membro: { id: string; papel: PapelCriador } }): QuemPede => ({
  usuario: { id: p.usuario.id },
  criador: { id: criadorId },
  membro: { id: p.membro.id, papel: p.membro.papel },
});

const pr = produtos_modulos_aulas_progressos;

export async function progressoDe(membroId: string, aulaId: string) {
  const [l] = await db.select().from(pr).where(and(eq(pr.membro_id, membroId), eq(pr.aula_id, aulaId), eq(pr.is_deleted, false)));
  return l;
}

/** Simula o tempo real passando desde a última batida aceita (o teto do upsert usa `updated_at`). */
export async function envelhecer(membroId: string, aulaId: string, segundos: number) {
  await db
    .update(pr)
    .set({ updated_at: sql`${pr.updated_at} - make_interval(secs => ${segundos})` })
    .where(and(eq(pr.membro_id, membroId), eq(pr.aula_id, aulaId), eq(pr.is_deleted, false)));
}
