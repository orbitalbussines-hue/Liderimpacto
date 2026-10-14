/**
 * Segundos por dia (RN-139, migração 0009) no PostgreSQL real: a batida do progresso soma em
 * `criadores_membros_atividades.segundos` só os segundos ÚNICOS novos — trecho repetido ou
 * sobreposto não conta duas vezes, nem com batidas simultâneas (a diferença é calculada na trava
 * de linha do ON CONFLICT) — e `horasAssistidas` sem curso passa a responder por período.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { ultimosDias } from "@/lib/painel/periodo";
import { novoCriador } from "./_apoio";
import { pessoa } from "./_engajamento";
import { cursoPronto, matricular } from "./_progresso";

let reg: typeof import("@/lib/progresso/registrar");
let an: typeof import("@/lib/analytics/consultas");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  reg = await import("@/lib/progresso/registrar");
  an = await import("@/lib/analytics/consultas");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function cenario() {
  const c = await novoCriador();
  const curso = await cursoPronto(c.id, { duracao: 300, aulas: 2 });
  const aluno = await pessoa(c.id);
  await matricular(c.id, aluno.membro.id, curso.produto.id);
  const bater = (aulaId: string, intervalos: [number, number][], posicao = intervalos.at(-1)?.[1] ?? 0) =>
    reg.registrarProgresso({ criadorId: c.id, membroId: aluno.membro.id, usuarioId: aluno.usuario.id, aulaId, intervalos, posicao, duracaoSeg: 300 });
  const segundosHoje = async () => {
    const [l] = await db
      .select({ seg: s.criadores_membros_atividades.segundos })
      .from(s.criadores_membros_atividades)
      .where(and(eq(s.criadores_membros_atividades.membro_id, aluno.membro.id), eq(s.criadores_membros_atividades.dia, hojeSP())));
    return l?.seg ?? 0;
  };
  return { c, curso, aluno, bater, segundosHoje };
}

describe("segundos novos por dia", () => {
  it("soma só o que é novo: repetir ou sobrepor não conta de novo; outra aula soma", async () => {
    const { curso, bater, segundosHoje } = await cenario();
    const [a1, a2] = curso.aulas;
    await bater(a1.id, [[0, 10]]);
    expect(await segundosHoje()).toBe(10);
    await bater(a1.id, [[5, 15]]);
    expect(await segundosHoje()).toBe(15);
    await bater(a1.id, [[0, 15]]); // reviu: nada novo
    expect(await segundosHoje()).toBe(15);
    await bater(a1.id, [], 12); // só posição (pause/seek)
    expect(await segundosHoje()).toBe(15);
    await bater(a2.id, [[100, 120]]);
    expect(await segundosHoje()).toBe(35);
  });

  it("batidas simultâneas com trechos iguais e sobrepostos não contam duas vezes", async () => {
    const { curso, bater, segundosHoje } = await cenario();
    const a = curso.aulas[0];
    await bater(a.id, [[0, 10]]);
    await Promise.all([1, 2, 3, 4, 5].map(() => bater(a.id, [[10, 20]])));
    expect(await segundosHoje()).toBe(20);
    await Promise.all([bater(a.id, [[20, 30]]), bater(a.id, [[25, 35]]), bater(a.id, [[30, 40]])]);
    expect(await segundosHoje()).toBe(40);
    const [p] = await db.select().from(s.produtos_modulos_aulas_progressos).where(eq(s.produtos_modulos_aulas_progressos.aula_id, a.id));
    expect(p.segundos_assistidos).toBe(40); // o bitmap e o dia concordam
  });

  it("batida recusada pelo teto anti-salto e conclusão pelo botão não somam segundos", async () => {
    const { c, curso, aluno, bater, segundosHoje } = await cenario();
    const a = curso.aulas[0];
    await bater(a.id, [[0, 30]]);
    expect(await bater(a.id, [[30, 60], [60, 90], [90, 120]])).toBeNull(); // 90 s declarados sem tempo real
    expect(await segundosHoje()).toBe(30);
    await reg.concluirManualmente({ criadorId: c.id, membroId: aluno.membro.id, usuarioId: aluno.usuario.id, aulaId: curso.aulas[1].id });
    expect(await segundosHoje()).toBe(30);
  });

  it("horasAssistidas sem curso = soma do período (e anterior); com curso = acumulado", async () => {
    const { c, curso, aluno, bater } = await cenario();
    await bater(curso.aulas[0].id, [[0, 25]]);
    const ontem = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - 8 * 86_400_000));
    await db.insert(s.criadores_membros_atividades).values({ criador_id: c.id, membro_id: aluno.membro.id, dia: ontem, segundos: 40, modified_by: aluno.usuario.id });
    const p = ultimosDias(7, hojeSP());
    expect(await an.horasAssistidas(c.id, p, null)).toEqual({ segundos: 25, segundosAnt: 40, recorte: "periodo" });
    expect(await an.horasAssistidas(c.id, p, curso.produto.id)).toEqual({ segundos: 25, segundosAnt: null, recorte: "acumulado" });
  });
});
