/**
 * Parte do `seed:demo` (SÓ DESENVOLVIMENTO) dos eventos ao vivo e da gamificação (ADR-0011/0012):
 * gamificação LIGADA com os padrões, 2 eventos (um daqui a 3 dias com a Ana confirmada e o aviso
 * de publicação; um de 7 dias atrás com a gravação apontando para a 1ª aula das mentorias), 1
 * desafio ativo com a Ana participando, e o recálculo retroativo dos pontos (idempotente).
 * Idempotente: cada peça é procurada pelo título e só é criada se faltar.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { criadores_desafios, criadores_eventos, criadores_gamificacao } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { confirmarPresenca } from "@/lib/eventos/presenca";
import { participarDoDesafio } from "@/lib/gamificacao/desafios";
import { recalcularPontos } from "@/lib/gamificacao/recalcular";
import { notificarEventoPublicado } from "@/lib/notificacoes/gerar";
import type { QuemPede } from "@/lib/progresso/visao";

type Pessoa = { usuarioId: string; membroId: string };
type Aula = { id: string; produtoSlug: string };

const DIA = 86_400_000;

/** Meia-noite de Brasília daqui a `dias` + `hora` (ex.: 19:30). */
const emBrasilia = (dias: number, hora: string) => new Date(`${new Date(Date.now() + dias * DIA).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}T${hora}:00-03:00`);

async function garantirEvento(criadorId: string, dono: Pessoa, v: Omit<typeof criadores_eventos.$inferInsert, "criador_id" | "criado_por" | "modified_by">) {
  const e = criadores_eventos;
  const [existe] = await db.select().from(e).where(and(eq(e.criador_id, criadorId), eq(e.titulo, v.titulo), vivos(e)));
  if (existe) return { evento: existe, novo: false };
  const [novo] = await db.insert(e).values({ ...v, criador_id: criadorId, criado_por: dono.usuarioId, modified_by: dono.usuarioId }).returning();
  return { evento: novo, novo: true };
}

export async function semearEngajamento(criadorId: string, dono: Pessoa, ana: Pessoa, aulas: Aula[]) {
  const g = criadores_gamificacao;
  const [config] = await db.select({ id: g.id }).from(g).where(and(eq(g.criador_id, criadorId), vivos(g)));
  if (!config) await db.insert(g).values({ criador_id: criadorId, ligada: true, modified_by: dono.usuarioId });

  const quemAna: QuemPede = { usuario: { id: ana.usuarioId }, criador: { id: criadorId }, membro: { id: ana.membroId, papel: "ALUNO" } };
  const proximo = await garantirEvento(criadorId, dono, {
    titulo: "Mentoria em grupo: liderança em tempos de mudança",
    descricao: "Encontro ao vivo para tirar dúvidas do módulo 2 e discutir casos reais da turma. Traga a sua pergunta!",
    inicio_em: emBrasilia(3, "19:30"),
    duracao_min: 90,
    link_acesso: "https://meet.google.com/demo-lider-impacto",
    situacao: "PUBLICADO",
    publicado_em: new Date(),
  });
  if (proximo.novo) {
    await confirmarPresenca(quemAna, proximo.evento.id, new Date());
    await notificarEventoPublicado(criadorId, proximo.evento.id, { usuarioId: dono.usuarioId, membroId: dono.membroId, nome: "Dono" });
  }
  const gravacao = aulas.find((a) => a.produtoSlug === "mentorias-ao-vivo") ?? aulas[0];
  await garantirEvento(criadorId, dono, {
    titulo: "Live: os 5 hábitos do líder de impacto",
    descricao: "Live aberta para todos os alunos. A gravação já está disponível.",
    inicio_em: emBrasilia(-7, "20:00"),
    duracao_min: 60,
    link_acesso: "https://www.youtube.com/live/demo-lider-impacto",
    situacao: "PUBLICADO",
    publicado_em: new Date(Date.now() - 10 * DIA),
    gravacao_aula_id: gravacao?.id ?? null,
  });

  const d = criadores_desafios;
  const titulo = "Desafio da semana: 3 aulas concluídas";
  let [desafio] = await db.select({ id: d.id }).from(d).where(and(eq(d.criador_id, criadorId), eq(d.titulo, titulo), vivos(d)));
  if (!desafio) {
    [desafio] = await db
      .insert(d)
      .values({
        criador_id: criadorId,
        titulo,
        descricao: "Conclua 3 aulas de qualquer curso até domingo e ganhe pontos extras.",
        inicio_em: emBrasilia(-2, "00:00"),
        fim_em: emBrasilia(6, "00:00"),
        meta_tipo: "AULAS_CONCLUIDAS",
        meta_quantidade: 3,
        pontos_bonus: 50,
        recompensa: "Mentoria individual de 30 min",
        situacao: "PUBLICADO",
        criado_por: dono.usuarioId,
        modified_by: dono.usuarioId,
      })
      .returning({ id: d.id });
    await participarDoDesafio(quemAna, desafio.id, new Date());
  }

  const r = await recalcularPontos(criadorId);
  console.log("Engajamento: gamificação ligada, 2 eventos, 1 desafio; recálculo:", r);
}
