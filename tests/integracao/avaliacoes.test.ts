/**
 * Avaliações (passo 7, RN-123 a RN-125) no PostgreSQL real: correção no servidor (UNICA, MULTIPLA,
 * V/F, pesos), gabarito nunca exposto antes da correção, tempo limite no servidor, uma tentativa
 * aberta por vez, limite + concessão, melhor nota, liberação do próximo módulo (motivoDoBloqueio
 * AVALIACAO no player e no curso), disponibilidade, CRUD da equipe pelas actions, isolamento A×B e
 * ALUNO recusado nas actions da equipe.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador } from "./_apoio";
import { ok } from "./_catalogo";
import { avaliacaoPronta, concluirAulas, respostasCertas, respostasMetade } from "./_passo7";
import { alunoMatriculado, cursoPronto, membroCom, novaAula, novoModulo, quem } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let t: typeof import("@/lib/avaliacoes/tentativas");
let c: typeof import("@/lib/avaliacoes/consultas");
let sit: typeof import("@/lib/avaliacoes/situacao");
let adm: typeof import("@/lib/avaliacoes/admin");
let acoes: typeof import("@/lib/actions/avaliacoes");
let acoesAluno: typeof import("@/lib/actions/avaliacoes-aluno");
let acesso: typeof import("@/lib/video/acesso-aula");
let curso: typeof import("@/lib/progresso/consultas-curso");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  t = await import("@/lib/avaliacoes/tentativas");
  c = await import("@/lib/avaliacoes/consultas");
  sit = await import("@/lib/avaliacoes/situacao");
  adm = await import("@/lib/avaliacoes/admin");
  acoes = await import("@/lib/actions/avaliacoes");
  acoesAluno = await import("@/lib/actions/avaliacoes-aluno");
  acesso = await import("@/lib/video/acesso-aula");
  curso = await import("@/lib/progresso/consultas-curso");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

type Aluno = Awaited<ReturnType<typeof alunoMatriculado>>;
const fazedor = (criadorId: string, a: Aluno) => ({ criadorId, membroId: a.membro.id, papel: "ALUNO" as const, usuarioId: a.usuario.id });

async function cenario(o: Parameters<typeof avaliacaoPronta>[2] = {}) {
  const cr = await novoCriador();
  const cu = await cursoPronto(cr.id, { aulas: 2 });
  const aluno = await alunoMatriculado(cr.id, cu.produto.id);
  const av = await avaliacaoPronta(cr.id, cu.produto.id, o);
  const f = fazedor(cr.id, aluno);
  const fazer = async (respostas: { questaoId: string; opcoes: string[] }[], agora = new Date()) => {
    const { tentativaId } = await t.iniciarTentativa(f, av.avaliacao.id, agora);
    for (const r of respostas) expect(await t.responder(f, { tentativaId, ...r }, agora)).toEqual({ situacao: "salva" });
    return t.finalizarTentativa(f, tentativaId, "ALUNO", agora);
  };
  return { cr, cu, aluno, av, f, fazer, q: quem(cr.id, aluno) };
}

describe("correção no servidor", () => {
  it("UNICA, MULTIPLA (conjunto exato) e V/F com pesos; 50 reprova, 100 aprova; trilha da correção", async () => {
    const x = await cenario({ notaMinima: 70 });
    expect(await x.fazer(respostasMetade(x.av.questoes))).toMatchObject({ nota: 50, aprovada: false, finalizadaPor: "ALUNO" });
    expect(await x.fazer(respostasCertas(x.av.questoes))).toMatchObject({ nota: 100, aprovada: true });
    // Sem order by: as duas finalizações podem cair no mesmo instante, então procura entre todas.
    const trilha = await db.select().from(s.auditoria).where(and(eq(s.auditoria.tabela, "produtos_avaliacoes_tentativas"), eq(s.auditoria.user_id, x.aluno.usuario.id), eq(s.auditoria.acao, "atualizar")));
    expect(trilha.map((tr) => tr.detalhes)).toContainEqual(expect.stringMatching(/nota 50 — reprovada/));
  });

  it("melhor nota vale; finalizar de novo é idempotente; opção fora da questão é recusada", async () => {
    const x = await cenario();
    await x.fazer(respostasCertas(x.av.questoes));
    const r = await x.fazer(respostasMetade(x.av.questoes));
    expect(r.nota).toBe(50);
    expect(await t.finalizarTentativa(x.f, r.tentativaId, "ALUNO")).toMatchObject({ nota: 50 });
    const [card] = await c.avaliacoesDoAluno(x.q);
    expect(card).toMatchObject({ aprovada: true, melhorNota: 100, rotulo: "Concluída · 100%", situacao: "CONCLUIDA", tentativasRestantes: 1 });
    const { tentativaId } = await t.iniciarTentativa(x.f, x.av.avaliacao.id);
    await expect(t.responder(x.f, { tentativaId, questaoId: x.av.questoes[0].id, opcoes: ["z"] })).rejects.toThrow(/Opção inválida/);
    await expect(t.responder(x.f, { tentativaId, questaoId: x.av.questoes[0].id, opcoes: ["a", "b"] })).rejects.toThrow(/só uma/);
  });
});

describe("gabarito nunca vai antes da correção", () => {
  it("responder: sem gabarito nem explicação; PROVA esconde no resultado enquanto houver tentativa", async () => {
    const x = await cenario({ tipo: "PROVA", tentativasMax: 2, embaralhar: true });
    const { tentativaId } = await t.iniciarTentativa(x.f, x.av.avaliacao.id);
    const tela = await c.tentativaParaResponder(x.q, tentativaId);
    if (tela?.situacao !== "aberta") throw new Error("esperava aberta");
    const json = JSON.stringify(tela);
    expect(json).not.toMatch(/gabarito|correta|explicac|Porque B/i);
    expect(tela.questoes).toHaveLength(3);
    expect(tela.questoes.flatMap((q) => q.opcoes.map((o) => Object.keys(o).sort().join()))).toEqual(Array(8).fill("id,texto"));
    await t.responder(x.f, { tentativaId, questaoId: x.av.questoes[0].id, opcoes: ["a"] });
    expect((await c.tentativaParaResponder(x.q, tentativaId)) as { questoes: { id: string; resposta: string[] }[] }).toMatchObject({
      questoes: expect.arrayContaining([expect.objectContaining({ id: x.av.questoes[0].id, resposta: ["a"] })]),
    });
    await t.finalizarTentativa(x.f, tentativaId, "ALUNO");
    const r1 = await c.resultadoDaTentativa(x.q, tentativaId);
    expect(r1?.revelaGabarito).toBe(false);
    expect(r1?.questoes.every((q) => q.explicacao === null && q.opcoes.every((o) => o.correta === null))).toBe(true);
    expect(r1?.questoes.find((q) => q.id === x.av.questoes[0].id)?.correta).toBe(false);
    // Última tentativa usada sem aprovar: agora revela.
    const r2 = await x.fazer(respostasMetade(x.av.questoes));
    const res = await c.resultadoDaTentativa(x.q, r2.tentativaId);
    expect(res?.revelaGabarito).toBe(true);
    expect(res?.questoes.find((q) => q.id === x.av.questoes[0].id)).toMatchObject({ explicacao: "Porque B.", opcoes: expect.arrayContaining([expect.objectContaining({ id: "b", correta: true })]) });
  });

  it("QUIZ revela logo; resultado de outro aluno = null", async () => {
    const x = await cenario({ tipo: "QUIZ" });
    const r = await x.fazer(respostasMetade(x.av.questoes));
    expect((await c.resultadoDaTentativa(x.q, r.tentativaId))?.revelaGabarito).toBe(true);
    const outro = await alunoMatriculado(x.cr.id, x.cu.produto.id);
    expect(await c.resultadoDaTentativa(quem(x.cr.id, outro), r.tentativaId)).toBeNull();
    expect(await c.tentativaParaResponder(quem(x.cr.id, outro), r.tentativaId)).toBeNull();
  });
});

describe("tempo limite, uma aberta por vez, tentativas e concessão", () => {
  it("resposta depois do prazo não grava e a tentativa fecha (TEMPO) com o que tinha", async () => {
    const x = await cenario({ tempoLimiteMin: 10 });
    const inicio = new Date();
    const { tentativaId } = await t.iniciarTentativa(x.f, x.av.avaliacao.id, inicio);
    const depois = (min: number) => new Date(inicio.getTime() + min * 60_000);
    await t.responder(x.f, { tentativaId, questaoId: x.av.questoes[0].id, opcoes: ["b"] }, depois(5));
    const tela = await c.tentativaParaResponder(x.q, tentativaId, depois(5));
    expect(tela).toMatchObject({ situacao: "aberta", tentativa: { segundosRestantes: 300 } });
    expect(await t.responder(x.f, { tentativaId, questaoId: x.av.questoes[2].id, opcoes: ["a"] }, depois(11))).toEqual({ situacao: "encerrada", tentativaId });
    const [l] = await db.select().from(s.produtos_avaliacoes_tentativas).where(eq(s.produtos_avaliacoes_tentativas.id, tentativaId));
    expect(l).toMatchObject({ finalizada_por: "TEMPO", nota: 25, respostas: { [x.av.questoes[0].id]: ["b"] } });
    expect(l.finalizada_em).toEqual(depois(10));
    // "Finalizar" depois do prazo devolve o gravado (idempotente).
    expect(await t.finalizarTentativa(x.f, tentativaId, "ALUNO", depois(20))).toMatchObject({ nota: 25, finalizadaPor: "TEMPO" });
  });

  it("vencida sem ninguém tocar fecha na próxima leitura", async () => {
    const x = await cenario({ tempoLimiteMin: 1 });
    const inicio = new Date();
    const { tentativaId } = await t.iniciarTentativa(x.f, x.av.avaliacao.id, inicio);
    expect(await c.tentativaParaResponder(x.q, tentativaId, new Date(inicio.getTime() + 61_000))).toEqual({ situacao: "encerrada", tentativaId });
    await c.avaliacoesDoAluno(x.q, new Date(inicio.getTime() + 61_000));
    const [l] = await db.select().from(s.produtos_avaliacoes_tentativas).where(eq(s.produtos_avaliacoes_tentativas.id, tentativaId));
    expect(l.finalizada_por).toBe("TEMPO");
  });

  it("dois cliques simultâneos em Iniciar = UMA tentativa; o segundo retoma", async () => {
    const x = await cenario();
    const [a, b] = await Promise.all([t.iniciarTentativa(x.f, x.av.avaliacao.id), t.iniciarTentativa(x.f, x.av.avaliacao.id)]);
    expect(a.tentativaId).toBe(b.tentativaId);
    expect([a.retomada, b.retomada].sort()).toEqual([false, true]);
    const linhas = await db.select().from(s.produtos_avaliacoes_tentativas).where(eq(s.produtos_avaliacoes_tentativas.membro_id, x.aluno.membro.id));
    expect(linhas).toHaveLength(1);
  });

  it("esgotou sem aprovar: recusa; ADMIN concede +1 (trilha); ALUNO não concede", async () => {
    const x = await cenario({ tentativasMax: 1 });
    await x.fazer(respostasMetade(x.av.questoes));
    await expect(t.iniciarTentativa(x.f, x.av.avaliacao.id)).rejects.toThrow(/tentativas esgotadas/);
    expect((await adm.alunosDaAvaliacao(x.cr.id, x.av.avaliacao.id))?.[0]).toMatchObject({ podeConceder: true, tentativasRestantes: 0 });
    req.h = await cabecalhosLogados(x.aluno.usuario.email, x.cr.slug);
    expect(await acoes.acaoConcederTentativa({ avaliacaoId: x.av.avaliacao.id, membroId: x.aluno.membro.id, motivo: "por favor" })).toMatchObject({ ok: false, erro: "Sem permissão para esta ação." });
    const admin = await membroCom(x.cr.id, "ADMIN");
    req.h = await cabecalhosLogados(admin.usuario.email, x.cr.slug);
    ok(await acoes.acaoConcederTentativa({ avaliacaoId: x.av.avaliacao.id, membroId: x.aluno.membro.id, motivo: "Problema de conexão" }));
    expect((await x.fazer(respostasCertas(x.av.questoes))).aprovada).toBe(true);
    const [tr] = await db.select().from(s.auditoria).where(and(eq(s.auditoria.tabela, "produtos_avaliacoes_concessoes"), eq(s.auditoria.user_id, admin.usuario.id)));
    expect(tr.detalhes).toMatch(/Problema de conexão/);
  });
});

describe("disponibilidade e liberação do próximo módulo", () => {
  it("aulas pendentes, sem matrícula e rascunho viram motivo", async () => {
    const x = await cenario({ exigeAulas: true });
    const d = (q = x.f) => sit.disponibilidade(q, x.av.avaliacao.id);
    expect((await d())?.motivo).toBe("AULAS_PENDENTES");
    await concluirAulas(x.cr.id, x.aluno, x.cu.aulas);
    expect((await d())?.motivo).toBeNull();
    const semMatricula = await membroCom(x.cr.id, "ALUNO");
    expect((await d({ criadorId: x.cr.id, membroId: semMatricula.membro.id, papel: "ALUNO", usuarioId: semMatricula.usuario.id }))?.motivo).toBe("MATRICULA");
    await db.update(s.produtos_avaliacoes).set({ status: "RASCUNHO" }).where(eq(s.produtos_avaliacoes.id, x.av.avaliacao.id));
    expect((await d())?.motivo).toBe("INDISPONIVEL");
    expect(await c.avaliacoesDoAluno(x.q)).toHaveLength(0);
  });

  it("módulo 2 trava (AVALIACAO) até aprovar a avaliação do módulo 1: acessoDaAula, curso e player", async () => {
    const cr = await novoCriador();
    const cu = await cursoPronto(cr.id, { aulas: 1 });
    const m2 = await novoModulo(cr.id, cu.produto.id, 2);
    const aula2 = await novaAula(cr.id, m2.id, 1);
    const aluno = await alunoMatriculado(cr.id, cu.produto.id);
    const av = await avaliacaoPronta(cr.id, cu.produto.id, { moduloId: cu.modulo.id, liberaProximo: true });
    const pedir = () => acesso.acessoDaAula(cr.id, aula2.id, { papel: "ALUNO", membroId: aluno.membro.id });
    expect(await pedir()).toMatchObject({ pode: false, motivo: "AVALIACAO" });
    expect(await acesso.acessoDaAula(cr.id, cu.aulas[0].id, { papel: "ALUNO", membroId: aluno.membro.id })).toMatchObject({ pode: true });
    const q = quem(cr.id, aluno);
    const pagina = await curso.cursoDoAluno(q, cu.produto.slug);
    const a2 = pagina!.modulos[1].aulas[0];
    expect(a2).toMatchObject({ motivoBloqueio: "AVALIACAO", estado: "bloqueada", avaliacaoPendente: { id: av.avaliacao.id, titulo: av.avaliacao.titulo } });
    expect(pagina!.modulos[0].avaliacoes).toEqual([expect.objectContaining({ id: av.avaliacao.id, aprovada: false, liberaProximoModulo: true, href: `/avaliacoes/${av.avaliacao.id}` })]);
    expect((await curso.aulaParaPlayer(q, aula2.id))?.motivoBloqueio).toBe("AVALIACAO");
    // Equipe nunca é travada.
    expect(await acesso.acessoDaAula(cr.id, aula2.id, { papel: "ADMIN", membroId: null })).toMatchObject({ pode: true });
    const f = fazedor(cr.id, aluno);
    const { tentativaId } = await t.iniciarTentativa(f, av.avaliacao.id);
    for (const r of respostasCertas(av.questoes)) await t.responder(f, { tentativaId, ...r });
    await t.finalizarTentativa(f, tentativaId, "ALUNO");
    expect(await pedir()).toMatchObject({ pode: true, motivo: null });
    expect((await curso.cursoDoAluno(q, cu.produto.slug))!.modulos[1].aulas[0].motivoBloqueio).toBeNull();
  });
});

describe("actions da equipe, isolamento A×B e ALUNO recusado", () => {
  it("cria, questões (ordem 1..n), publicar exige questão, trava de colisão, reordena; ALUNO recusado", async () => {
    const cr = await novoCriador();
    const cu = await cursoPronto(cr.id);
    const admin = await membroCom(cr.id, "ADMIN");
    const aluno = await membroCom(cr.id, "ALUNO");
    req.h = await cabecalhosLogados(aluno.usuario.email, cr.slug);
    const campos = { titulo: "Quiz 1", tipo: "QUIZ", moduloId: cu.modulo.id };
    expect(await acoes.acaoCriarAvaliacao({ produtoId: cu.produto.id, campos })).toMatchObject({ ok: false, erro: "Sem permissão para esta ação." });
    req.h = await cabecalhosLogados(admin.usuario.email, cr.slug);
    const a = ok(await acoes.acaoCriarAvaliacao({ produtoId: cu.produto.id, campos }));
    expect(await acoes.acaoAlterarSituacaoAvaliacao({ avaliacaoId: a.id, versao: a.versao, status: "PUBLICADA" })).toMatchObject({ ok: false, erro: /ao menos 1 questão/ });
    const questao = (e: string) => ({ tipo: "UNICA", enunciado: e, opcoes: [{ texto: "Sim", correta: true }, { texto: "Não", correta: false }] });
    const q1 = ok(await acoes.acaoCriarQuestao({ avaliacaoId: a.id, questao: questao("Primeira") }));
    const q2 = ok(await acoes.acaoCriarQuestao({ avaliacaoId: a.id, questao: questao("Segunda") }));
    const ed = await adm.avaliacaoParaEditar(cr.id, a.id);
    expect(ed?.questoes.map((q) => [q.questao.enunciado, q.ordem])).toEqual([["Primeira", 1], ["Segunda", 2]]);
    expect(ed?.questoes[0].questao.opcoes).toEqual([{ texto: "Sim", correta: true }, { texto: "Não", correta: false }]);
    ok(await acoes.acaoReordenarQuestoes({ avaliacaoId: a.id, itens: [{ id: q2.id, versao: q2.versao }, { id: q1.id, versao: q1.versao }] }));
    expect((await adm.avaliacaoParaEditar(cr.id, a.id))?.questoes.map((q) => q.questao.enunciado)).toEqual(["Segunda", "Primeira"]);
    // Versão velha da questão = colisão.
    expect(await acoes.acaoSalvarQuestao({ questaoId: q1.id, versao: q1.versao, questao: questao("X") })).toMatchObject({ ok: false, erro: /alterado por outro/ });
    const v = ok(await acoes.acaoSalvarAvaliacao({ avaliacaoId: a.id, versao: a.versao, campos: { ...campos, notaMinima: 80, liberaProximoModulo: true } }));
    ok(await acoes.acaoAlterarSituacaoAvaliacao({ avaliacaoId: a.id, versao: v.versao, status: "PUBLICADA" }));
    const lista = await adm.avaliacoesDoAdmin(cr.id);
    expect(lista.linhas[0]).toMatchObject({ id: a.id, status: "PUBLICADA", questoes: 2, notaMinima: 80, liberaProximoModulo: true, tentativas: 0, taxaAprovacao: null });
    expect(await acoes.acaoSalvarAvaliacao({ avaliacaoId: a.id, versao: v.versao, campos: { ...campos, moduloId: null, liberaProximoModulo: true } })).toMatchObject({ ok: false });
  });

  it("aluno de A não inicia avaliação de B; admin de A não edita nem concede em B; módulo de outro curso recusado", async () => {
    const A = await novoCriador();
    const B = await novoCriador();
    const cuA = await cursoPronto(A.id);
    const cuB = await cursoPronto(B.id);
    const avB = await avaliacaoPronta(B.id, cuB.produto.id);
    const alunoA = await alunoMatriculado(A.id, cuA.produto.id);
    const adminA = await membroCom(A.id, "ADMIN");
    req.h = await cabecalhosLogados(alunoA.usuario.email, A.slug);
    expect(await acoesAluno.acaoIniciarTentativa({ avaliacaoId: avB.avaliacao.id })).toMatchObject({ ok: false, erro: "Avaliação não encontrada." });
    const alunoB = await alunoMatriculado(B.id, cuB.produto.id);
    const { tentativaId } = await t.iniciarTentativa(fazedor(B.id, alunoB), avB.avaliacao.id);
    expect(await acoesAluno.acaoResponder({ tentativaId, questaoId: avB.questoes[0].id, opcoes: ["b"] })).toMatchObject({ ok: false, erro: "Tentativa não encontrada." });
    expect(await acoesAluno.acaoFinalizarTentativa({ tentativaId })).toMatchObject({ ok: false, erro: "Tentativa não encontrada." });
    req.h = await cabecalhosLogados(adminA.usuario.email, A.slug);
    expect(await acoes.acaoSalvarAvaliacao({ avaliacaoId: avB.avaliacao.id, versao: avB.avaliacao.updated_at.toISOString(), campos: { titulo: "x de A", tipo: "QUIZ", moduloId: null } })).toMatchObject({
      ok: false,
      erro: /não encontrada/,
    });
    expect(await acoes.acaoConcederTentativa({ avaliacaoId: avB.avaliacao.id, membroId: alunoB.membro.id, motivo: "tentando" })).toMatchObject({ ok: false, erro: "Avaliação não encontrada." });
    const avA = await avaliacaoPronta(A.id, cuA.produto.id);
    expect(await acoes.acaoConcederTentativa({ avaliacaoId: avA.avaliacao.id, membroId: alunoB.membro.id, motivo: "tentando" })).toMatchObject({ ok: false, erro: "Membro não encontrado." });
    expect(await acoes.acaoCriarAvaliacao({ produtoId: cuA.produto.id, campos: { titulo: "Cruzada", tipo: "QUIZ", moduloId: cuB.modulo.id } })).toMatchObject({ ok: false, erro: /Módulo não encontrado/ });
    expect(await adm.avaliacaoParaEditar(A.id, avB.avaliacao.id)).toBeNull();
    expect((await c.avaliacoesDoAluno(quem(A.id, alunoA))).map((x) => x.id)).not.toContain(avB.avaliacao.id);
    // O banco recusa tentativa cruzada mesmo por fora do serviço (FK composta).
    await expect(
      db.insert(s.produtos_avaliacoes_tentativas).values({ criador_id: A.id, avaliacao_id: avB.avaliacao.id, membro_id: alunoA.membro.id, numero: 1, ordem: [], modified_by: A.id }),
    ).rejects.toThrow();
  });
});
