/**
 * Painel do admin (passo 6) no PostgreSQL real: cada KPI no período e no anterior, borda de fuso
 * (23:30 em Brasília conta no dia de Brasília), série de 14 dias com zeros, mais assistidas,
 * saúde dos produtos, "Acontecendo agora" só do criador e sem dado sensível, ALUNO recusado na
 * página e isolamento A x B. Cada teste monta o PRÓPRIO criador (nada depende do banco global).
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador, trilhaDe } from "./_apoio";
import { cursoPronto, envelhecer, matricular, membroCom } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let c: typeof import("@/lib/painel/consultas");
let regras: typeof import("@/lib/painel/regras");
let reg: typeof import("@/lib/progresso/registrar");
let servico: typeof import("@/lib/matriculas/servico");
let audit: typeof import("@/lib/audit/registrar");
let guarda: typeof import("@/lib/auth/guarda");
let EQUIPE: typeof import("@/lib/auth/permissoes").EQUIPE;
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  c = await import("@/lib/painel/consultas");
  regras = await import("@/lib/painel/regras");
  reg = await import("@/lib/progresso/registrar");
  servico = await import("@/lib/matriculas/servico");
  audit = await import("@/lib/audit/registrar");
  guarda = await import("@/lib/auth/guarda");
  EQUIPE = (await import("@/lib/auth/permissoes")).EQUIPE;
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
/** Dia de Brasília `n` dias atrás (AAAA-MM-DD). Brasília é UTC−3 fixo desde 2019. */
const diaSP = (n: number) => SP.format(new Date(Date.now() - n * 86_400_000));
/** Instante `hh:mm` de Brasília do dia `n` dias atrás. */
const em = (n: number, hhmm: string) => new Date(`${diaSP(n)}T${hhmm}:00-03:00`);
const umaHoraAtras = () => new Date(Date.now() - 3_600_000);

type Membro = Awaited<ReturnType<typeof membroCom>>;

async function atividade(criadorId: string, m: Membro, ...diasAtras: number[]) {
  for (const n of diasAtras) {
    await db.insert(s.criadores_membros_atividades).values({ criador_id: criadorId, membro_id: m.membro.id, dia: diaSP(n), modified_by: m.usuario.id });
  }
}

async function concluida(criadorId: string, m: Membro, aulaId: string, quando: Date) {
  await db.insert(s.produtos_modulos_aulas_progressos).values({
    criador_id: criadorId,
    membro_id: m.membro.id,
    aula_id: aulaId,
    segundos_bitmap: "1".repeat(100),
    segundos_assistidos: 100,
    percentual: 100,
    concluida: true,
    concluida_em: quando,
    concluida_por: "ASSISTIU",
    modified_by: m.usuario.id,
  });
}

async function visualizacoes(criadorId: string, aulaId: string, diasAtras: number, n: number) {
  await db.insert(s.produtos_modulos_aulas_visualizacoes).values({ criador_id: criadorId, aula_id: aulaId, dia: diaSP(diasAtras), visualizacoes: n, modified_by: criadorId });
}

describe("KPIs (período de 7 dias x 7 anteriores)", () => {
  it("alunos ativos, novos alunos, matrículas + conclusão e aulas concluídas; equipe fora; borda de fuso", async () => {
    const cr = await novoCriador();
    const curso = await cursoPronto(cr.id, { aulas: 3 });
    const [a1, a2, a3] = [await membroCom(cr.id), await membroCom(cr.id), await membroCom(cr.id)];
    const admin = await membroCom(cr.id, "ADMIN");

    // Ativos: a1 e a2 no período; a2 e a3 no anterior; 14 dias atrás não entra; equipe não conta.
    await atividade(cr.id, a1, 0, 2);
    await atividade(cr.id, a2, 0, 3, 10);
    await atividade(cr.id, a3, 8, 14);
    await atividade(cr.id, admin, 0, 1);

    // Novos: a1 agora; a2 às 00:30 do 1º dia do período (conta); a3 às 23:30 da véspera do
    // período — em UTC já é o 1º dia, em Brasília é o período anterior.
    await db.update(s.criadores_membros).set({ created_at: em(6, "00:30") }).where(eq(s.criadores_membros.id, a2.membro.id));
    await db.update(s.criadores_membros).set({ created_at: em(7, "23:30") }).where(eq(s.criadores_membros.id, a3.membro.id));

    // Matrículas: a1 agora (concluída), a3 agora mas expirada (conta como criada, não vale);
    // a2 iniciada no período anterior (vale, não concluída); a do admin não conta.
    const m1 = await matricular(cr.id, a1.membro.id, curso.produto.id);
    await db.update(s.produtos_matriculas).set({ concluida_em: new Date() }).where(eq(s.produtos_matriculas.id, m1.id));
    const m2 = await matricular(cr.id, a2.membro.id, curso.produto.id);
    await db.update(s.produtos_matriculas).set({ iniciada_em: em(8, "12:00") }).where(eq(s.produtos_matriculas.id, m2.id));
    const m3 = await matricular(cr.id, a3.membro.id, curso.produto.id);
    await db.update(s.produtos_matriculas).set({ expira_em: new Date(Date.now() - 60_000) }).where(eq(s.produtos_matriculas.id, m3.id));
    await matricular(cr.id, admin.membro.id, curso.produto.id);

    // Aulas concluídas: 2 no período (uma às 23:30 do último dia anterior NÃO), 1 no anterior.
    await concluida(cr.id, a1, curso.aulas[0].id, umaHoraAtras());
    await concluida(cr.id, a2, curso.aulas[1].id, em(6, "00:30"));
    await concluida(cr.id, a3, curso.aulas[0].id, em(7, "23:30"));
    await concluida(cr.id, admin, curso.aulas[2].id, umaHoraAtras());

    expect(await c.kpisDoPainel(cr.id, 7)).toEqual({
      ativos: 2,
      ativosAnt: 2,
      novos: 2,
      novosAnt: 1,
      matriculas: 2,
      matriculasAnt: 1,
      validas: 2,
      validasConcluidas: 1,
      aulas: 2,
      aulasAnt: 1,
    });
    // 30 dias: tudo é período atual (o dia 14 inclusive), nada no anterior.
    const k30 = await c.kpisDoPainel(cr.id, 30);
    expect([k30.ativos, k30.ativosAnt, k30.novos, k30.novosAnt, k30.aulas, k30.aulasAnt]).toEqual([3, 0, 3, 0, 3, 0]);
  });

  it("criador novo: tudo zero (sem erro, sem divisão por zero)", async () => {
    const cr = await novoCriador();
    const k = await c.kpisDoPainel(cr.id, 90);
    expect(Object.values(k).every((v) => v === 0)).toBe(true);
    expect(await c.saudeDosProdutos(cr.id)).toEqual({ publicados: 0, taxaMedia: null, alunosComMatricula: 0 });
    expect(await c.maisAssistidas(cr.id, 90)).toEqual([]);
    expect(await c.acontecendoAgora(cr.id)).toEqual([]);
  });
});

describe("Acessos por dia (14 dias)", () => {
  it("sempre 14 dias terminando hoje, alunos distintos por dia, zeros nos dias vazios, equipe fora", async () => {
    const cr = await novoCriador();
    const [a1, a2] = [await membroCom(cr.id), await membroCom(cr.id)];
    const admin = await membroCom(cr.id, "DONO");
    await atividade(cr.id, a1, 0, 5, 13, 14);
    await atividade(cr.id, a2, 0);
    await atividade(cr.id, admin, 0, 1);

    const serie = await c.acessosPorDia(cr.id);
    expect(serie).toHaveLength(14);
    expect(serie[0].dia).toBe(diaSP(13));
    expect(serie[13].dia).toBe(diaSP(0));
    expect(serie.map((d) => d.alunos)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2]);
  });

  it("a batida do player marca o dia de BRASÍLIA (uma linha por aluno/dia, mesmo em 2 aulas)", async () => {
    const cr = await novoCriador();
    const curso = await cursoPronto(cr.id, { aulas: 2 });
    const a = await membroCom(cr.id);
    await matricular(cr.id, a.membro.id, curso.produto.id);
    for (const aula of curso.aulas) {
      await reg.registrarProgresso({ criadorId: cr.id, membroId: a.membro.id, usuarioId: a.usuario.id, aulaId: aula.id, intervalos: [[0, 10]], posicao: 10, duracaoSeg: 100 });
      await envelhecer(a.membro.id, aula.id, 10);
    }
    const linhas = await db.select().from(s.criadores_membros_atividades).where(eq(s.criadores_membros_atividades.membro_id, a.membro.id));
    expect(linhas.map((l) => l.dia)).toEqual([diaSP(0)]);
    expect((await c.acessosPorDia(cr.id)).at(-1)?.alunos).toBe(1);
  });
});

describe("Conteúdos mais assistidos e saúde dos produtos", () => {
  it("soma as visualizações do período, ordena e respeita o período escolhido", async () => {
    const cr = await novoCriador();
    const curso = await cursoPronto(cr.id, { aulas: 3 });
    const [x, y, z] = curso.aulas;
    await visualizacoes(cr.id, x.id, 0, 5);
    await visualizacoes(cr.id, x.id, 3, 2);
    await visualizacoes(cr.id, y.id, 1, 3);
    await visualizacoes(cr.id, z.id, 8, 50);

    expect((await c.maisAssistidas(cr.id, 7)).map((l) => [l.titulo, l.curso, l.visualizacoes])).toEqual([
      [x.titulo, curso.produto.titulo, 7],
      [y.titulo, curso.produto.titulo, 3],
    ]);
    expect((await c.maisAssistidas(cr.id, 30))[0]).toMatchObject({ aulaId: z.id, visualizacoes: 50 });
  });

  it("publicados, taxa média de conclusão por produto publicado e alunos com matrícula valendo", async () => {
    const cr = await novoCriador();
    const p1 = await cursoPronto(cr.id);
    const p2 = await cursoPronto(cr.id);
    const rascunho = await cursoPronto(cr.id, { status: "RASCUNHO" });
    const [a1, a2, a3] = [await membroCom(cr.id), await membroCom(cr.id), await membroCom(cr.id)];
    const concluir = async (id: string) => db.update(s.produtos_matriculas).set({ concluida_em: new Date() }).where(eq(s.produtos_matriculas.id, id));
    await concluir((await matricular(cr.id, a1.membro.id, p1.produto.id)).id);
    await matricular(cr.id, a2.membro.id, p1.produto.id); // p1: 1/2
    await concluir((await matricular(cr.id, a1.membro.id, p2.produto.id)).id); // p2: 1/1
    await matricular(cr.id, a2.membro.id, rascunho.produto.id); // rascunho fora da média
    await matricular(cr.id, a3.membro.id, p2.produto.id, new Date(Date.now() - 1000)); // expirada: não vale

    const saude = await c.saudeDosProdutos(cr.id);
    expect(saude.publicados).toBe(2);
    expect(saude.taxaMedia).toBeCloseTo(0.75, 5);
    expect(saude.alunosComMatricula).toBe(2);
  });
});

describe("Acontecendo agora", () => {
  it("frases da trilha e do progresso, mais recentes primeiro, só do criador e sem dado sensível", async () => {
    const [A, B] = [await novoCriador(), await novoCriador()];
    const cursoA = await cursoPronto(A.id, { aulas: 2 });
    const cursoB = await cursoPronto(B.id);
    const dono = await membroCom(A.id, "DONO");
    const nomeAluna = `Ana ${randomUUID().slice(0, 6)}`;

    // Membro cadastrado + matrícula pelo serviço real (trilha na transação).
    const { vincularPessoa } = await import("@/lib/membros/vinculos");
    const emailAluna = `ana-${randomUUID().slice(0, 6)}@teste.local`;
    const vinculo = await db.transaction((tx) => vincularPessoa(tx, { criadorId: A.id, autorId: dono.usuario.id, nome: nomeAluna, email: emailAluna, papel: "ALUNO" }));
    await db.transaction((tx) => servico.matricular(tx, { criadorId: A.id, membroId: vinculo.membroId, produtoId: cursoA.produto.id, origem: "MANUAL", autor: dono.usuario.id }));
    // Produto publicado (mesmo formato da action) e vídeo pronto (mesmo formato do worker).
    await audit.registrarAuditoria(db, { userId: dono.usuario.id, criadorId: A.id, acao: "publicar", tabela: "produtos", registroId: cursoA.produto.id, detalhes: "x", dadosNovos: { status: "PUBLICADO" } });
    const [video] = await db
      .insert(s.produtos_modulos_aulas_videos)
      .values({ criador_id: A.id, aula_id: cursoA.aulas[0].id, situacao: "PRONTO", nome_original: "a.mp4", mime: "video/mp4", tamanho_bytes: 1, chave_origem: `criadores/${A.id}/videos/x/original.mp4`, chave_cifrada: "c", modified_by: A.id })
      .returning();
    await audit.registrarAuditoria(db, { userId: null, criadorId: A.id, acao: "atualizar", tabela: "produtos_modulos_aulas_videos", registroId: video.id, detalhes: "x", dadosNovos: { situacao: "PRONTO" } });
    // Conclusão (a mais recente) da aula 1.2.
    const aluna = { usuario: { id: vinculo.usuarioId }, membro: { id: vinculo.membroId } } as Membro;
    await concluida(A.id, aluna, cursoA.aulas[1].id, new Date(Date.now() + 1000));
    // Ruído em B.
    const alunoB = await membroCom(B.id);
    await matricular(B.id, alunoB.membro.id, cursoB.produto.id);
    await concluida(B.id, alunoB, cursoB.aulas[0].id, new Date());

    const eventos = await c.acontecendoAgora(A.id);
    const frases = eventos.map((e) => regras.fraseDoEvento(e));
    expect(eventos.map((e) => e.tipo)).toEqual(["conclusao", "video", "publicacao", "matricula", "membro"]);
    expect(frases[0]).toEqual({ pessoa: nomeAluna, destaque: nomeAluna, texto: `concluiu a aula 1.2 · ${cursoA.aulas[1].titulo}` });
    expect(frases[1]).toEqual({ pessoa: null, destaque: "Vídeo pronto", texto: `na aula ${cursoA.aulas[0].titulo}` });
    expect(frases[2].texto).toBe(`publicou ${cursoA.produto.titulo}`);
    expect(frases[3]).toMatchObject({ pessoa: nomeAluna, texto: `recebeu matrícula em ${cursoA.produto.titulo}` });
    expect(frases[4]).toMatchObject({ pessoa: nomeAluna, texto: "entrou na área de membros" });

    const tudo = JSON.stringify(eventos);
    expect(tudo).not.toContain("@");
    expect(tudo).not.toContain(cursoB.produto.titulo);
    expect((await c.acontecendoAgora(B.id)).every((e) => e.tipo !== "publicacao" && e.tipo !== "video")).toBe(true);
  });
});

describe("Página /admin (guarda)", () => {
  it("DONO e ADMIN entram com o criador do host; ALUNO é recusado e vai para a trilha", async () => {
    const cr = await novoCriador();
    const dono = await membroCom(cr.id, "DONO");
    const admin = await membroCom(cr.id, "ADMIN");
    const aluno = await membroCom(cr.id, "ALUNO");

    for (const m of [dono, admin]) {
      req.h = await cabecalhosLogados(m.usuario.email, cr.slug);
      expect((await guarda.membroDaPagina(EQUIPE)).criador.id).toBe(cr.id);
    }
    req.h = await cabecalhosLogados(aluno.usuario.email, cr.slug);
    await expect(guarda.membroDaPagina(EQUIPE)).rejects.toThrow();
    expect((await trilhaDe(aluno.usuario.id)).some((t) => t.acao === "acesso_negado")).toBe(true);
  });
});
