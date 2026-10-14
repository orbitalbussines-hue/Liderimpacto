/**
 * Parte do `seed:demo` (SÓ DESENVOLVIMENTO) que dá vida ao painel do admin (passo 6): mais 7
 * alunos de demonstração (sem senha), matrículas pelo serviço real (vão para a trilha e para o
 * "Acontecendo agora"), dias de atividade espalhados nos últimos 40 dias e algumas aulas
 * concluídas. Determinístico e idempotente (chaves naturais + ON CONFLICT DO NOTHING).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import { criadores_membros, criadores_membros_atividades, produtos_matriculas, produtos_modulos_aulas_progressos } from "@/lib/db/schema";
import { matricular } from "@/lib/matriculas/servico";

type Pessoa = { usuarioId: string; membroId: string };
type Garantir = (criadorId: string, email: string, nome: string, papel: PapelCriador) => Promise<Pessoa>;

const DIA = 86_400_000;
const atras = (dias: number, horas = 0) => new Date(Date.now() - dias * DIA - horas * 3_600_000);
const diaSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

const ALUNOS: [string, string][] = [
  ["Bruno Lima", "bruno"],
  ["Carla Souza", "carla"],
  ["Diego Rocha", "diego"],
  ["Elisa Prado", "elisa"],
  ["Fábio Nunes", "fabio"],
  ["Gabi Torres", "gabi"],
  ["Helena Dias", "helena"],
];

export async function semearPainel(
  criadorId: string,
  garantir: Garantir,
  ana: Pessoa,
  cursos: { id: string; tipo: string }[],
  aulas: { id: string; duracao: number }[],
) {
  const pessoas: Pessoa[] = [ana];
  for (const [i, [nome, apelido]] of ALUNOS.entries()) {
    const p = await garantir(criadorId, `${apelido}@demo.local`, nome, "ALUNO");
    pessoas.push(p);
    // Cadastro espalhado: uns neste mês, outros no anterior (KPI "Novos alunos" com comparação).
    await db.update(criadores_membros).set({ created_at: atras(3 + i * 7, i) }).where(eq(criadores_membros.id, p.membroId));
    const curso = cursos.filter((c) => c.tipo === "CURSO")[i % 2];
    if (curso) {
      await db.transaction((tx) => matricular(tx, { criadorId, membroId: p.membroId, produtoId: curso.id, origem: "MANUAL", autor: null }));
      await db
        .update(produtos_matriculas)
        .set({ iniciada_em: atras(2 + i * 6, i) })
        .where(and(eq(produtos_matriculas.membro_id, p.membroId), eq(produtos_matriculas.produto_id, curso.id)));
    }
    // Aulas concluídas pelos primeiros: horários diferentes nas últimas horas/dias.
    for (const [k, a] of aulas.slice(0, Math.max(0, 4 - i)).entries()) {
      if (a.duracao < 1) continue;
      const quando = atras(k, 2 + i * 3);
      await db
        .insert(produtos_modulos_aulas_progressos)
        .values({
          criador_id: criadorId,
          membro_id: p.membroId,
          aula_id: a.id,
          segundos_bitmap: "1".repeat(a.duracao),
          segundos_assistidos: a.duracao,
          max_posicao_seg: a.duracao,
          ultima_posicao_seg: a.duracao,
          percentual: 100,
          concluida: true,
          concluida_em: quando,
          concluida_por: "ASSISTIU",
          ultima_visualizacao_dia: diaSP(quando),
          created_at: quando,
          updated_at: quando,
          modified_by: p.usuarioId,
        })
        .onConflictDoNothing();
    }
  }

  // Dias de atividade: padrão fixo por aluno nos últimos 40 dias (alguns dias ficam vazios).
  for (const [i, p] of pessoas.entries()) {
    for (let d = 0; d < 40; d++) {
      if ((d * 7 + i * 3) % 5 >= 2 + (d < 14 ? 1 : 0)) continue;
      await db
        .insert(criadores_membros_atividades)
        .values({ criador_id: criadorId, membro_id: p.membroId, dia: sql`((now() at time zone 'America/Sao_Paulo')::date - ${d}::int)`, modified_by: p.usuarioId })
        .onConflictDoNothing();
    }
  }
}
