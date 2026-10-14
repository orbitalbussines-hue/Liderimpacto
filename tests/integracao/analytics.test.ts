/**
 * Analytics do admin no PostgreSQL real: KPIs no período e no anterior (com e sem curso), série
 * diária, conteúdo e abandono por aula, coortes por semana de matrícula, avaliações (aprovação por
 * aluno, top 3 questões com erro, questão removida), isolamento A x B, CSV só com a sessão da
 * equipe (401/403/200) e sem dado pessoal. Cada teste monta o PRÓPRIO criador.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhos, cabecalhosLogados, novoCriador, trilhaDe } from "./_apoio";
import { avaliacaoPronta } from "./_passo7";
import { intervalo, ultimosDias } from "@/lib/painel/periodo";
import { cursoPronto, matricular, membroCom, novaAula, novoModulo } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let c: typeof import("@/lib/analytics/consultas");
let ca: typeof import("@/lib/analytics/consultas-avaliacoes");
let regras: typeof import("@/lib/analytics/regras");
let exportar: typeof import("@/lib/analytics/exportar");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  c = await import("@/lib/analytics/consultas");
  ca = await import("@/lib/analytics/consultas-avaliacoes");
  regras = await import("@/lib/analytics/regras");
  exportar = await import("@/lib/analytics/exportar");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const diaSP = (n: number) => SP.format(new Date(Date.now() - n * 86_400_000));
const em = (n: number, hhmm: string) => new Date(`${diaSP(n)}T${hhmm}:00-03:00`);
/** Últimos N dias terminando hoje (o padrão da tela). */
const u = (n: number) => ultimosDias(n, diaSP(0));
/** Dias desde a segunda-feira desta semana (Brasília). */
const desdeSegunda = () => (new Date(`${diaSP(0)}T12:00:00Z`).getUTCDay() + 6) % 7;

type Membro = Awaited<ReturnType<typeof membroCom>>;

async function atividade(criadorId: string, m: Membro, ...diasAtras: number[]) {
  for (const n of diasAtras) await db.insert(s.criadores_membros_atividades).values({ criador_id: criadorId, membro_id: m.membro.id, dia: diaSP(n), modified_by: m.usuario.id });
}

/** Progresso direto no banco: `seg` segundos de 100; concluída se `quando`; `ultima` = última batida. */
async function progresso(criadorId: string, m: Membro, aulaId: string, seg: number, o: { quando?: Date; ultima?: Date } = {}) {
  const concluida = !!o.quando;
  await db.insert(s.produtos_modulos_aulas_progressos).values({
    criador_id: criadorId,
    membro_id: m.membro.id,
    aula_id: aulaId,
    segundos_bitmap: "1".repeat(seg).padEnd(100, "0"),
    segundos_assistidos: seg,
    percentual: seg,
    concluida,
    concluida_em: o.quando ?? null,
    concluida_por: concluida ? "ASSISTIU" : null,
    created_at: o.ultima ?? new Date(),
    updated_at: o.ultima ?? new Date(),
    modified_by: m.usuario.id,
  });
}

async function tentativa(criadorId: string, m: Membro, avaliacaoId: string, aprovada: boolean, nota: number, erradas: string[], certas: string[], quando = new Date()) {
  const n = (await db.select().from(s.produtos_avaliacoes_tentativas).where(eq(s.produtos_avaliacoes_tentativas.membro_id, m.membro.id))).length + 1;
  await db.insert(s.produtos_avaliacoes_tentativas).values({
    criador_id: criadorId,
    avaliacao_id: avaliacaoId,
    membro_id: m.membro.id,
    numero: n,
    iniciada_em: quando,
    finalizada_em: quando,
    finalizada_por: "ALUNO",
    ordem: [],
    nota,
    aprovada,
    correcao: [...erradas.map((q) => ({ q, correta: false, peso: 1 })), ...certas.map((q) => ({ q, correta: true, peso: 1 }))],
    modified_by: m.usuario.id,
  });
}

describe("Visão geral", () => {
  it("KPIs no período x anterior, com e sem filtro de curso; equipe fora; horas acumuladas", async () => {
    const cr = await novoCriador();
    const c1 = await cursoPronto(cr.id, { aulas: 2 });
    const c2 = await cursoPronto(cr.id, { aulas: 1 });
    const [a1, a2, a3] = [await membroCom(cr.id), await membroCom(cr.id), await membroCom(cr.id)];
    const admin = await membroCom(cr.id, "ADMIN");

    await atividade(cr.id, a1, 0, 2);
    await atividade(cr.id, a2, 1, 9);
    await atividade(cr.id, a3, 10);
    await atividade(cr.id, admin, 0);

    // Progresso: a1 concluiu a aula 1 de c1 hoje (100 s) e assistiu 30 s de c2; a2 tem 40 s em c1
    // com última batida há 9 dias (fora do período no filtro de curso); admin não conta.
    await progresso(cr.id, a1, c1.aulas[0].id, 100, { quando: new Date() });
    await progresso(cr.id, a1, c2.aulas[0].id, 30);
    await progresso(cr.id, a2, c1.aulas[1].id, 40, { ultima: em(9, "10:00") });
    await progresso(cr.id, a3, c1.aulas[1].id, 95, { quando: em(8, "10:00"), ultima: em(8, "10:00") });
    await progresso(cr.id, admin, c1.aulas[1].id, 100, { quando: new Date() });

    // Matrículas: a1 em c1 concluída hoje; a2 em c1 concluída no anterior; a3 em c2 valendo; admin fora.
    const m1 = await matricular(cr.id, a1.membro.id, c1.produto.id);
    await db.update(s.produtos_matriculas).set({ concluida_em: new Date() }).where(eq(s.produtos_matriculas.id, m1.id));
    const m2 = await matricular(cr.id, a2.membro.id, c1.produto.id);
    await db.update(s.produtos_matriculas).set({ concluida_em: em(9, "12:00") }).where(eq(s.produtos_matriculas.id, m2.id));
    await matricular(cr.id, a3.membro.id, c2.produto.id);
    await matricular(cr.id, admin.membro.id, c1.produto.id);

    // Avaliação de c1: a1 reprova e depois aprova (1 aprovado); a2 reprova; no anterior a3 aprova.
    const av = await avaliacaoPronta(cr.id, c1.produto.id);
    const [q1, q2, q3] = av.questoes.map((q) => q.id);
    await tentativa(cr.id, a1, av.avaliacao.id, false, 50, [q2], [q1, q3]);
    await tentativa(cr.id, a1, av.avaliacao.id, true, 100, [], [q1, q2, q3]);
    await tentativa(cr.id, a2, av.avaliacao.id, false, 25, [q1, q2], [q3]);
    await tentativa(cr.id, a3, av.avaliacao.id, true, 75, [q2], [q1, q3], em(9, "12:00"));
    await tentativa(cr.id, admin, av.avaliacao.id, false, 0, [q1, q2, q3], []);

    expect(await c.kpisAnalytics(cr.id, u(7), null)).toEqual({
      ativos: 2, ativosAnt: 2, aulas: 1, aulasAnt: 1,
      validas: 3, validasConcluidas: 2, cursosConcluidos: 1, cursosConcluidosAnt: 1,
      avaliados: 2, aprovados: 1, avaliadosAnt: 1, aprovadosAnt: 1,
    });
    // Curso c1: ativo = batida no curso no período (só a1); anterior indisponível (nulo).
    const k1 = await c.kpisAnalytics(cr.id, u(7), c1.produto.id);
    expect([k1.ativos, k1.ativosAnt, k1.aulas, k1.aulasAnt, k1.validas, k1.avaliados]).toEqual([1, null, 1, 1, 2, 2]);
    const k2 = await c.kpisAnalytics(cr.id, u(7), c2.produto.id);
    expect([k2.ativos, k2.aulas, k2.validas, k2.validasConcluidas, k2.avaliados]).toEqual([1, 0, 1, 0, 0]);

    // Horas sem curso: segundos novos por dia no período x anterior (a2 dia 9 e a3 dia 10 no anterior); equipe fora.
    const segundosNoDia = (m: Membro, n: number, segundos: number) =>
      db.update(s.criadores_membros_atividades).set({ segundos }).where(and(eq(s.criadores_membros_atividades.membro_id, m.membro.id), eq(s.criadores_membros_atividades.dia, diaSP(n))));
    await segundosNoDia(a1, 0, 600);
    await segundosNoDia(a1, 2, 120);
    await segundosNoDia(a2, 9, 300);
    await segundosNoDia(a3, 10, 50);
    await segundosNoDia(admin, 0, 999);
    expect(await c.horasAssistidas(cr.id, u(7), null)).toEqual({ segundos: 720, segundosAnt: 350, recorte: "periodo" });
    // Com curso: acumulado do bitmap nas aulas do curso, sem comparação.
    expect(await c.horasAssistidas(cr.id, u(7), c1.produto.id)).toEqual({ segundos: 100 + 40 + 95, segundosAnt: null, recorte: "acumulado" });
    expect((await c.horasAssistidas(cr.id, u(7), c2.produto.id)).segundos).toBe(30);
  });

  it("série diária: N dias terminando hoje, alunos de todos os cursos e visualizações do curso", async () => {
    const cr = await novoCriador();
    const c1 = await cursoPronto(cr.id, { aulas: 1 });
    const c2 = await cursoPronto(cr.id, { aulas: 1 });
    const a = await membroCom(cr.id);
    await atividade(cr.id, a, 0, 6, 7);
    const vis = (aulaId: string, n: number, v: number) => db.insert(s.produtos_modulos_aulas_visualizacoes).values({ criador_id: cr.id, aula_id: aulaId, dia: diaSP(n), visualizacoes: v, modified_by: cr.id });
    await vis(c1.aulas[0].id, 0, 3);
    await vis(c2.aulas[0].id, 0, 2);
    await vis(c1.aulas[0].id, 6, 1);

    const todos = await c.serieDiaria(cr.id, u(7), null);
    expect(todos).toHaveLength(7);
    expect(todos[0].dia).toBe(diaSP(6));
    expect(todos.map((d) => d.alunos)).toEqual([1, 0, 0, 0, 0, 0, 1]);
    expect(todos.map((d) => d.visualizacoes)).toEqual([1, 0, 0, 0, 0, 0, 5]);
    const soC2 = await c.serieDiaria(cr.id, u(7), c2.produto.id);
    expect(soC2.map((d) => d.visualizacoes)).toEqual([0, 0, 0, 0, 0, 0, 2]);
    expect(soC2.map((d) => d.alunos)).toEqual(todos.map((d) => d.alunos)); // não separa por curso
    expect(await c.serieDiaria(cr.id, u(90), null)).toHaveLength(90);
    expect(await c.serieDiaria(cr.id, u(92), null)).toHaveLength(92);
  });

  it("intervalo no passado: série e KPIs só até `ate` (nada depois conta); > 92 dias agrupa por semana", async () => {
    const cr = await novoCriador();
    const curso = await cursoPronto(cr.id, { aulas: 2 });
    const [a1, a2] = [await membroCom(cr.id), await membroCom(cr.id)];
    await atividade(cr.id, a1, 0, 3, 9);
    await atividade(cr.id, a2, 2, 13); // 13 = período anterior
    await db.insert(s.produtos_modulos_aulas_visualizacoes).values([
      { criador_id: cr.id, aula_id: curso.aulas[0].id, dia: diaSP(8), visualizacoes: 4, modified_by: cr.id },
      { criador_id: cr.id, aula_id: curso.aulas[0].id, dia: diaSP(1), visualizacoes: 50, modified_by: cr.id },
    ]);
    await progresso(cr.id, a1, curso.aulas[0].id, 100, { quando: em(5, "23:30") }); // último dia do período, 23:30 de Brasília
    await progresso(cr.id, a2, curso.aulas[1].id, 100, { quando: em(4, "00:30") }); // dia seguinte ao `ate`: fora

    const p = intervalo(diaSP(9), diaSP(5)); // 5 dias; anterior = 14..10 dias atrás
    const serie = await c.serieDiaria(cr.id, p, null);
    expect(serie.map((d) => d.dia)).toEqual([9, 8, 7, 6, 5].map(diaSP));
    expect(serie.map((d) => d.alunos)).toEqual([1, 0, 0, 0, 0]);
    expect(serie.map((d) => d.visualizacoes)).toEqual([0, 4, 0, 0, 0]);
    const k = await c.kpisAnalytics(cr.id, p, null);
    expect([k.ativos, k.ativosAnt, k.aulas, k.aulasAnt]).toEqual([1, 1, 1, 0]);

    const longo = await c.serieDiaria(cr.id, intervalo(diaSP(199), diaSP(0)), null);
    expect(longo[0].dia).toBe(diaSP(199));
    expect(longo.length).toBeGreaterThanOrEqual(29);
    expect(longo.length).toBeLessThanOrEqual(30);
    expect(longo.reduce((t, d) => t + d.visualizacoes, 0)).toBe(54);
  });
});

describe("Conteúdo", () => {
  it("por aula: começaram, concluíram, abandono (< 90%) e tempo médio; maior queda; módulo rascunho e equipe fora", async () => {
    const cr = await novoCriador();
    const curso = await cursoPronto(cr.id, { aulas: 3 });
    const rascunho = await novoModulo(cr.id, curso.produto.id, 2, "RASCUNHO");
    const escondida = await novaAula(cr.id, rascunho.id, 1);
    const [x, y, z] = curso.aulas;
    const [a1, a2, a3] = [await membroCom(cr.id), await membroCom(cr.id), await membroCom(cr.id)];
    const dono = await membroCom(cr.id, "DONO");

    await progresso(cr.id, a1, x.id, 100, { quando: new Date() });
    await progresso(cr.id, a2, x.id, 100, { quando: new Date() });
    await progresso(cr.id, a3, x.id, 40);
    await progresso(cr.id, a1, y.id, 20);
    await progresso(cr.id, a2, y.id, 60);
    await progresso(cr.id, a1, escondida.id, 10);
    await progresso(cr.id, dono, z.id, 5);
    const m = await matricular(cr.id, a1.membro.id, curso.produto.id);
    await db.update(s.produtos_matriculas).set({ concluida_em: new Date() }).where(eq(s.produtos_matriculas.id, m.id));

    const { cursos, aulas } = await c.conteudo(cr.id, null);
    expect(aulas.map((a) => a.aulaId).sort()).toEqual([x.id, y.id, z.id].sort());
    const por = new Map(aulas.map((a) => [a.aulaId, a]));
    expect(por.get(x.id)).toMatchObject({ numero: "1.1", iniciaram: 3, concluiram: 2, pararam: 1, tempoMedioSeg: 80 });
    expect(por.get(y.id)).toMatchObject({ numero: "1.2", iniciaram: 2, concluiram: 0, pararam: 2, tempoMedioSeg: 40 });
    expect(por.get(z.id)).toMatchObject({ iniciaram: 0, pararam: 0 });
    expect(regras.maiorQueda(aulas)?.aulaId).toBe(y.id);
    expect(regras.ordenarAulas(aulas, "abandono").map((a) => a.aulaId)).toEqual([y.id, x.id, z.id]);
    expect(regras.ordenarAulas(aulas, "estrutura").map((a) => a.aulaId)).toEqual([x.id, y.id, z.id]);

    // Curso: 3 alunos começaram; o tempo da aula do módulo rascunho não entra (como na tabela).
    expect(cursos).toHaveLength(1);
    expect(cursos[0]).toMatchObject({ produtoId: curso.produto.id, iniciaram: 3, concluiram: 1 });
    expect(cursos[0].tempoMedioSeg).toBeCloseTo((100 + 100 + 40 + 20 + 60) / 3, 5);
  });
});

describe("Retenção (coortes)", () => {
  it("coorte pela semana da PRIMEIRA matrícula; atividade por semana seguinte; semanas futuras nulas", async () => {
    const cr = await novoCriador();
    const c1 = await cursoPronto(cr.id);
    const c2 = await cursoPronto(cr.id);
    const off = desdeSegunda();
    const segunda = (semanasAtras: number) => off + 7 * semanasAtras; // dias atrás
    const [a1, a2, a3, a4] = [await membroCom(cr.id), await membroCom(cr.id), await membroCom(cr.id), await membroCom(cr.id)];
    const entrar = async (m: Membro, produtoId: string, semanasAtras: number) => {
      const mt = await matricular(cr.id, m.membro.id, produtoId);
      await db.update(s.produtos_matriculas).set({ iniciada_em: em(segunda(semanasAtras), "12:00") }).where(eq(s.produtos_matriculas.id, mt.id));
    };
    await entrar(a1, c1.produto.id, 2);
    await entrar(a2, c1.produto.id, 2);
    await entrar(a3, c2.produto.id, 0);
    await entrar(a4, c1.produto.id, 10); // fora das 8 semanas...
    await entrar(a4, c2.produto.id, 1); // ...e a 1ª matrícula manda: não entra em coorte nenhuma
    await atividade(cr.id, a1, segunda(2), segunda(2) - 1, segunda(1));
    await atividade(cr.id, a2, segunda(2));
    await atividade(cr.id, a4, segunda(1));

    const linhas = await c.coortes(cr.id, null);
    expect(linhas).toHaveLength(8);
    expect(linhas[7].semana).toBe(diaSP(segunda(0)));
    const coortes = regras.montarCoortes(linhas);
    const s2 = coortes[5];
    expect(s2).toMatchObject({ semana: diaSP(segunda(2)), tamanho: 2, pequena: true });
    expect(s2.celulas.slice(0, 3)).toEqual([{ ativos: 2, taxa: 1 }, { ativos: 1, taxa: 0.5 }, { ativos: 0, taxa: 0 }]);
    expect(s2.celulas.slice(3)).toEqual([null, null, null, null, null]);
    expect(coortes[7]).toMatchObject({ tamanho: 1 });
    expect(coortes[6].tamanho).toBe(0);
    // Filtro de curso: c2 = a3 (semana atual) e a4 (1ª matrícula EM c2 foi semana passada).
    const soC2 = regras.montarCoortes(await c.coortes(cr.id, c2.produto.id));
    expect([soC2[6].tamanho, soC2[7].tamanho, soC2[5].tamanho]).toEqual([1, 1, 0]);
    expect(soC2[6].celulas[0]).toEqual({ ativos: 1, taxa: 1 });
  });
});

describe("Avaliações", () => {
  it("tentativas, alunos, aprovação por aluno, nota média e top 3 questões com erro no período", async () => {
    const cr = await novoCriador();
    const curso = await cursoPronto(cr.id);
    const av = await avaliacaoPronta(cr.id, curso.produto.id);
    const vazia = await avaliacaoPronta(cr.id, curso.produto.id);
    await avaliacaoPronta(cr.id, curso.produto.id, { status: "RASCUNHO" }); // rascunho sem tentativa: fora
    const [q1, q2, q3] = av.questoes.map((q) => q.id);
    const [a1, a2] = [await membroCom(cr.id), await membroCom(cr.id)];
    const admin = await membroCom(cr.id, "ADMIN");
    await tentativa(cr.id, a1, av.avaliacao.id, false, 25, [q2, q3], [q1]);
    await tentativa(cr.id, a1, av.avaliacao.id, true, 75, [q2], [q1, q3]);
    await tentativa(cr.id, a2, av.avaliacao.id, false, 50, [q2, q3, q1], []);
    await tentativa(cr.id, a2, av.avaliacao.id, true, 100, [q1, q2, q3], [], em(20, "10:00")); // fora do período
    await tentativa(cr.id, admin, av.avaliacao.id, false, 0, [q1, q2, q3], []);
    // q3 removida depois: continua contando, aparece como removida.
    await db.update(s.produtos_avaliacoes_questoes).set({ is_deleted: true, deleted_at: new Date() }).where(eq(s.produtos_avaliacoes_questoes.id, q3));

    const r = await ca.avaliacoesAnalytics(cr.id, u(7), null);
    expect(r.map((a) => a.avaliacaoId)).toEqual([av.avaliacao.id, vazia.avaliacao.id]);
    expect(r[0]).toMatchObject({ tentativas: 3, alunos: 2, aprovados: 1, notaMedia: 50, notaMinima: 70 });
    expect(r[0].questoes.map((q) => [q.questaoId, q.erros, q.respostas, q.enunciado === null])).toEqual([
      [q2, 3, 3, false],
      [q3, 2, 3, true],
      [q1, 1, 3, false],
    ]);
    expect(r[1]).toMatchObject({ tentativas: 0, alunos: 0, notaMedia: null, questoes: [] });
    expect((await ca.avaliacoesAnalytics(cr.id, u(30), null))[0]).toMatchObject({ tentativas: 4, alunos: 2, aprovados: 2 });
  });
});

describe("Isolamento A x B e CSV", () => {
  it("nada de B aparece em A, nem passando o curso de B no filtro", async () => {
    const [A, B] = [await novoCriador(), await novoCriador()];
    const cursoB = await cursoPronto(B.id);
    const alunoB = await membroCom(B.id);
    await matricular(B.id, alunoB.membro.id, cursoB.produto.id);
    await progresso(B.id, alunoB, cursoB.aulas[0].id, 100, { quando: new Date() });
    await atividade(B.id, alunoB, 0);
    await avaliacaoPronta(B.id, cursoB.produto.id);

    for (const curso of [null, cursoB.produto.id]) {
      const k = await c.kpisAnalytics(A.id, u(90), curso);
      expect(Object.values(k).every((v) => v === 0 || v === null)).toBe(true);
      expect((await c.horasAssistidas(A.id, u(90), curso)).segundos).toBe(0);
      expect((await c.serieDiaria(A.id, u(7), curso)).every((d) => d.alunos === 0 && d.visualizacoes === 0)).toBe(true);
      expect(await c.conteudo(A.id, curso)).toEqual({ cursos: [], aulas: [] });
      expect((await c.coortes(A.id, curso)).every((l) => l.tamanho === 0)).toBe(true);
      expect(await ca.avaliacoesAnalytics(A.id, u(90), curso)).toEqual([]);
    }
    expect(await c.cursosDoCriador(A.id)).toEqual([]);
  });

  it("CSV: 401 sem sessão, 403 para ALUNO (na trilha), 200 para DONO/ADMIN com só agregados", async () => {
    const cr = await novoCriador();
    const curso = await cursoPronto(cr.id, { aulas: 2 });
    const dono = await membroCom(cr.id, "DONO");
    const admin = await membroCom(cr.id, "ADMIN");
    const aluno = await membroCom(cr.id, "ALUNO");
    const nome = `Zélia ${randomUUID().slice(0, 6)}`;
    await db.update(s.usuarios).set({ nome }).where(eq(s.usuarios.id, aluno.usuario.id));
    await matricular(cr.id, aluno.membro.id, curso.produto.id);
    await progresso(cr.id, aluno, curso.aulas[0].id, 50);
    await atividade(cr.id, aluno, 0);
    const av = await avaliacaoPronta(cr.id, curso.produto.id);
    await tentativa(cr.id, aluno, av.avaliacao.id, true, 75, [av.questoes[1].id], [av.questoes[0].id]);

    const url = (h: Headers, q: string) => new Request(`http://${h.get("host")}/admin/analytics/exportar?${q}`, { headers: h });
    const semSessao = cabecalhos(cr.slug);
    expect((await exportar.atenderExportacao(url(semSessao, "aba=conteudo"))).status).toBe(401);

    const hAluno = await cabecalhosLogados(aluno.usuario.email, cr.slug);
    expect((await exportar.atenderExportacao(url(hAluno, "aba=conteudo"))).status).toBe(403);
    expect((await trilhaDe(aluno.usuario.id)).some((t) => t.acao === "acesso_negado")).toBe(true);

    const hDono = await cabecalhosLogados(dono.usuario.email, cr.slug);
    const hAdmin = await cabecalhosLogados(admin.usuario.email, cr.slug);
    const textos: string[] = [];
    for (const [h, aba] of [[hDono, "visao-geral"], [hAdmin, "conteudo"], [hDono, "retencao"], [hAdmin, "avaliacoes"]] as const) {
      const r = await exportar.atenderExportacao(url(h, `aba=${aba}&periodo=30&curso=${curso.produto.id}`));
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("text/csv");
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(r.headers.get("content-disposition")).toMatch(new RegExp(`attachment; filename="analytics-${aba}`));
      textos.push(await r.text());
    }
    const tudo = textos.join("\n");
    expect(tudo).not.toContain(nome);
    expect(tudo).not.toContain("@");
    expect(tudo).not.toContain(aluno.membro.id);
    expect(tudo).not.toContain(aluno.usuario.id);
    expect(textos[1]).toContain(`aula;${curso.produto.id};${curso.produto.titulo};${curso.aulas[0].id};1.1;`);
    expect(textos[3]).toContain(av.avaliacao.titulo);
    // de/ate na URL: mesma leitura da tela; o nome do arquivo leva o intervalo.
    const r = await exportar.atenderExportacao(url(hDono, `aba=visao-geral&de=${diaSP(9)}&ate=${diaSP(3)}`));
    expect(r.headers.get("content-disposition")).toContain(`analytics-visao-geral-${diaSP(9)}-a-${diaSP(3)}.csv`);
    expect((await r.text()).split(/\r?\n/).filter((l) => /^\d{4}-\d{2}-\d{2};/.test(l))).toHaveLength(7);
    // Cookie de outro criador não vale aqui (sessão por host).
    const outro = await novoCriador();
    const hFora = await cabecalhosLogados(dono.usuario.email, cr.slug);
    hFora.set("host", `${outro.slug}.localhost:3011`);
    expect((await exportar.atenderExportacao(url(hFora, "aba=conteudo"))).status).toBe(401);
  });
});
