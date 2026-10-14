/**
 * Apoio dos testes de eventos e gamificação (PostgreSQL real): membro SEM senha (rápido: nada de
 * scrypt), evento e desafio montados direto no banco (as actions são das telas). Importar só
 * dentro do teste (depois do _ambiente.ts).
 */
import { db } from "@/lib/db";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import { criadores_desafios, criadores_eventos, criadores_gamificacao } from "@/lib/db/schema";
import type { QuemPede } from "@/lib/progresso/visao";
import { novoUsuario, vincular } from "./_apoio";

export async function pessoa(criadorId: string, papel: PapelCriador = "ALUNO") {
  const usuario = await novoUsuario({ senha: null });
  const membro = await vincular(criadorId, usuario.id, papel);
  return { usuario, membro };
}

export type Pessoa = Awaited<ReturnType<typeof pessoa>>;

export const quemE = (criadorId: string, p: Pessoa): QuemPede => ({ usuario: { id: p.usuario.id }, criador: { id: criadorId }, membro: { id: p.membro.id, papel: p.membro.papel } });

const MIN = 60_000;

export async function evento(criadorId: string, autorId: string, o: Partial<typeof criadores_eventos.$inferInsert> & { emMin?: number } = {}) {
  const { emMin, ...resto } = o;
  const situacao = resto.situacao ?? "PUBLICADO";
  const [e] = await db
    .insert(criadores_eventos)
    .values({
      criador_id: criadorId,
      titulo: "Mentoria ao vivo",
      inicio_em: new Date(Date.now() + (emMin ?? 60 * 24) * MIN),
      duracao_min: 60,
      link_acesso: "https://meet.google.com/abc-defg-hij",
      situacao,
      publicado_em: situacao === "RASCUNHO" ? null : new Date(),
      cancelado_em: situacao === "CANCELADO" ? new Date() : null,
      criado_por: autorId,
      modified_by: autorId,
      ...resto,
    })
    .returning();
  return e;
}

export async function desafio(criadorId: string, autorId: string, o: Partial<typeof criadores_desafios.$inferInsert> = {}) {
  const [d] = await db
    .insert(criadores_desafios)
    .values({
      criador_id: criadorId,
      titulo: "Maratona da semana",
      inicio_em: new Date(Date.now() - 24 * 60 * MIN),
      fim_em: new Date(Date.now() + 6 * 24 * 60 * MIN),
      meta_tipo: "AULAS_CONCLUIDAS",
      meta_quantidade: 2,
      pontos_bonus: 50,
      situacao: "PUBLICADO",
      criado_por: autorId,
      modified_by: autorId,
      ...o,
    })
    .returning();
  return d;
}

export async function ligarGamificacao(criadorId: string, autorId: string, o: Partial<typeof criadores_gamificacao.$inferInsert> = {}) {
  const [g] = await db.insert(criadores_gamificacao).values({ criador_id: criadorId, ligada: true, modified_by: autorId, ...o }).returning();
  return g;
}
