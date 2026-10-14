/**
 * Gamificação ligada ao sistema (telas, ADR-0012, RN-144 a RN-147) no PostgreSQL real: os 4 ganchos
 * concedem UMA vez (concluir a mesma aula de novo não duplica) e nada com ela desligada; actions com
 * papéis (ALUNO "Sem permissão", configuração só DONO), A × B, trava otimista, trilha, ajuste com
 * justificativa, recompensa entregue, ranking sem quem saiu e /conquistas nula (404) desligada.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador, trilhaDe } from "./_apoio";
import { canal, participante } from "./_comunidade";
import { desafio, ligarGamificacao, pessoa, quemE } from "./_engajamento";
import { avaliacaoPronta, respostasCertas } from "./_passo7";
import { alunoMatriculado, cursoPronto, membroCom } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let acoes: typeof import("@/lib/actions/gamificacao");
let reg: typeof import("@/lib/progresso/registrar");
let tent: typeof import("@/lib/avaliacoes/tentativas");
let pub: typeof import("@/lib/comunidade/publicacoes");
let rk: typeof import("@/lib/gamificacao/ranking");
let conq: typeof import("@/lib/gamificacao/conquistas");
let adm: typeof import("@/lib/gamificacao/admin");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  acoes = await import("@/lib/actions/gamificacao");
  reg = await import("@/lib/progresso/registrar");
  tent = await import("@/lib/avaliacoes/tentativas");
  pub = await import("@/lib/comunidade/publicacoes");
  rk = await import("@/lib/gamificacao/ranking");
  conq = await import("@/lib/gamificacao/conquistas");
  adm = await import("@/lib/gamificacao/admin");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const razao = (membroId: string) => db.select().from(s.criadores_membros_pontos).where(eq(s.criadores_membros_pontos.membro_id, membroId));
const motivos = async (membroId: string) => (await razao(membroId)).map((l) => l.motivo).sort();

const DIA = 86_400_000;
const camposDesafio = (o: Record<string, unknown> = {}) => ({
  titulo: "Maratona de outubro",
  descricao: "Conclua 2 aulas.",
  inicioEm: new Date(Date.now() - DIA).toISOString(),
  fimEm: new Date(Date.now() + 7 * DIA).toISOString(),
  metaTipo: "AULAS_CONCLUIDAS",
  metaQuantidade: 2,
  metaProdutoId: null,
  metaAvaliacaoId: null,
  pontosBonus: 40,
  recompensa: "Mentoria de 30 min",
  publico: "TODOS",
  grupoIds: [],
  ...o,
});

describe("ganchos (pontos de verdade)", () => {
  it("aula pelo player e pelo botão, curso e avaliação: uma vez só; desligada não concede", async () => {
    const cr = await novoCriador();
    const dono = await pessoa(cr.id, "DONO");
    const cu = await cursoPronto(cr.id, { aulas: 2, duracao: 30 });
    const ana = await alunoMatriculado(cr.id, cu.produto.id);
    const bia = await alunoMatriculado(cr.id, cu.produto.id);

    // Desligada: concluir não lança nada.
    await reg.concluirManualmente({ criadorId: cr.id, membroId: bia.membro.id, usuarioId: bia.usuario.id, aulaId: cu.aulas[0].id });
    expect(await razao(bia.membro.id)).toHaveLength(0);

    await ligarGamificacao(cr.id, dono.usuario.id);
    // Player: a 1ª batida que cruza 90% conclui (heartbeat seguinte não concede de novo).
    const batida = { criadorId: cr.id, membroId: ana.membro.id, usuarioId: ana.usuario.id, aulaId: cu.aulas[0].id, intervalos: [[0, 30]] as [number, number][], posicao: 30, duracaoSeg: 30 };
    expect((await reg.registrarProgresso(batida))?.concluiuAgora).toBe(true);
    expect((await reg.registrarProgresso({ ...batida, intervalos: [[0, 1]], posicao: 1 }))?.concluiuAgora ?? false).toBe(false);
    // Botão na mesma aula (já concluída) e na 2ª aula (fecha o curso).
    const manual = { criadorId: cr.id, membroId: ana.membro.id, usuarioId: ana.usuario.id };
    await reg.concluirManualmente({ ...manual, aulaId: cu.aulas[0].id });
    await reg.concluirManualmente({ ...manual, aulaId: cu.aulas[1].id });
    await reg.concluirManualmente({ ...manual, aulaId: cu.aulas[1].id });
    expect(await motivos(ana.membro.id)).toEqual(["AULA_CONCLUIDA", "AULA_CONCLUIDA", "CURSO_CONCLUIDO"]);

    // Avaliação aprovada: só a 1ª aprovação pontua.
    const av = await avaliacaoPronta(cr.id, cu.produto.id);
    const f = { criadorId: cr.id, membroId: ana.membro.id, papel: "ALUNO" as const, usuarioId: ana.usuario.id };
    for (let i = 0; i < 2; i++) {
      const { tentativaId } = await tent.iniciarTentativa(f, av.avaliacao.id);
      for (const r of respostasCertas(av.questoes)) await tent.responder(f, { tentativaId, ...r });
      expect((await tent.finalizarTentativa(f, tentativaId, "ALUNO")).aprovada).toBe(true);
    }
    expect((await razao(ana.membro.id)).filter((l) => l.motivo === "AVALIACAO_APROVADA").map((l) => [l.referencia, l.pontos])).toEqual([[av.avaliacao.id, 30]]);
    expect(await rk.saldosDosMembros(cr.id, [ana.membro.id])).toEqual(new Map([[ana.membro.id, 10 + 10 + 100 + 30]]));
  });

  it("publicação na comunidade: a 1ª do dia pontua; equipe não pontua", async () => {
    const cr = await novoCriador();
    const dono = await pessoa(cr.id, "DONO");
    const ana = await pessoa(cr.id);
    await ligarGamificacao(cr.id, dono.usuario.id);
    const c = await canal(cr.id);
    const post = { canalId: c.id, texto: "Oi!", aulaId: null, anexoIds: [], enquete: null };
    await pub.publicar(participante(cr.id, ana), post);
    await pub.publicar(participante(cr.id, ana), post);
    await pub.publicar(participante(cr.id, dono), post);
    expect((await razao(ana.membro.id)).map((l) => [l.motivo, l.pontos])).toEqual([["PUBLICACAO_COMUNIDADE", 2]]);
    expect(await razao(dono.membro.id)).toHaveLength(0);
  });
});

describe("actions da equipe", () => {
  it("configuração: só DONO; criar, trava otimista, ligar = recálculo retroativo, trilha", async () => {
    const cr = await novoCriador();
    const dono = await membroCom(cr.id, "DONO");
    const admin = await membroCom(cr.id, "ADMIN");
    const ana = await pessoa(cr.id);
    const cu = await cursoPronto(cr.id, { aulas: 1 });
    await reg.concluirManualmente({ criadorId: cr.id, membroId: ana.membro.id, usuarioId: ana.usuario.id, aulaId: cu.aulas[0].id });
    const base = { ligada: true, pontos: { aulaConcluida: 15, cursoConcluido: 100, avaliacaoAprovada: 30, publicacaoComunidade: 2 }, niveis: [{ nome: "Início", minimo: 0 }, { nome: "Topo", minimo: 50 }] };

    req.h = await cabecalhosLogados(admin.usuario.email, cr.slug);
    expect(await acoes.acaoSalvarConfigGamificacao({ ...base, versao: null })).toEqual({ ok: false, erro: "Sem permissão para esta ação." });

    req.h = await cabecalhosLogados(dono.usuario.email, cr.slug);
    expect(await acoes.acaoSalvarConfigGamificacao({ ...base, niveis: [{ nome: "Início", minimo: 5 }], versao: null })).toMatchObject({ ok: false, erro: "O primeiro nível começa em 0 ponto." });
    const r = await acoes.acaoSalvarConfigGamificacao({ ...base, versao: null });
    if (!r.ok) throw new Error(r.erro);
    expect(r.dados.recalculo).toMatchObject({ AULA_CONCLUIDA: 1 }); // retroativo: a aula de antes vale 15
    expect((await razao(ana.membro.id)).map((l) => l.pontos)).toEqual([15]);
    // Segunda criação (versão nula) e versão velha = colisão.
    expect(await acoes.acaoSalvarConfigGamificacao({ ...base, versao: null })).toMatchObject({ ok: false });
    const r2 = await acoes.acaoSalvarConfigGamificacao({ ...base, ligada: false, versao: r.dados.versao });
    expect(r2).toMatchObject({ ok: true, dados: { recalculo: null } });
    expect(await acoes.acaoSalvarConfigGamificacao({ ...base, versao: r.dados.versao })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro/) });
    const trilha = (await trilhaDe(dono.usuario.id)).filter((t) => t.tabela === "criadores_gamificacao").map((t) => t.detalhes);
    expect(trilha).toEqual(expect.arrayContaining(["Gamificação ligada", "Gamificação desligada"]));
  });

  it("desafio: criar, publicar, encerrar, excluir só rascunho; ALUNO recusado; A × B; trilha", async () => {
    const A = await novoCriador();
    const B = await novoCriador();
    const admin = await membroCom(A.id, "ADMIN");
    const aluno = await membroCom(A.id, "ALUNO");
    const adminB = await membroCom(B.id, "ADMIN");
    const grupoB = (await db.insert(s.criadores_grupos).values({ criador_id: B.id, nome: "Turma B", tipo: "TURMA", modified_by: B.id }).returning())[0];

    req.h = await cabecalhosLogados(aluno.usuario.email, A.slug);
    expect(await acoes.acaoSalvarDesafio({ desafioId: null, versao: null, campos: camposDesafio() })).toEqual({ ok: false, erro: "Sem permissão para esta ação." });

    req.h = await cabecalhosLogados(admin.usuario.email, A.slug);
    expect(await acoes.acaoSalvarDesafio({ desafioId: null, versao: null, campos: camposDesafio({ publico: "GRUPOS", grupoIds: [grupoB.id] }) })).toEqual({ ok: false, erro: "Grupo não encontrado." });
    expect(await acoes.acaoSalvarDesafio({ desafioId: null, versao: null, campos: camposDesafio({ metaTipo: "CURSO_CONCLUIDO" }) })).toMatchObject({ ok: false, erro: "Escolha o curso da meta." });
    const c = await acoes.acaoSalvarDesafio({ desafioId: null, versao: null, campos: camposDesafio() });
    if (!c.ok) throw new Error(c.erro);
    const ed = await acoes.acaoSalvarDesafio({ desafioId: c.dados.id, versao: c.dados.versao, campos: camposDesafio({ titulo: "Maratona de novembro" }) });
    if (!ed.ok) throw new Error(ed.erro);
    expect(await acoes.acaoPublicarDesafio({ desafioId: c.dados.id, versao: c.dados.versao })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro/) });

    // B não mexe no desafio de A (mesmo com a versão certa).
    req.h = await cabecalhosLogados(adminB.usuario.email, B.slug);
    expect(await acoes.acaoPublicarDesafio({ desafioId: c.dados.id, versao: ed.dados.versao })).toMatchObject({ ok: false });

    req.h = await cabecalhosLogados(admin.usuario.email, A.slug);
    const p = await acoes.acaoPublicarDesafio({ desafioId: c.dados.id, versao: ed.dados.versao });
    if (!p.ok) throw new Error(p.erro);
    expect(await acoes.acaoExcluirDesafio({ desafioId: c.dados.id, versao: p.dados.versao })).toEqual({ ok: false, erro: "Só rascunho pode ser excluído (publicado: encerre)." });
    const e = await acoes.acaoEncerrarDesafio({ desafioId: c.dados.id, versao: p.dados.versao });
    expect(e.ok).toBe(true);
    expect(await acoes.acaoSalvarDesafio({ desafioId: c.dados.id, versao: e.ok ? e.dados.versao : "", campos: camposDesafio() })).toEqual({ ok: false, erro: "Desafio encerrado não pode ser editado." });

    const rasc = await acoes.acaoSalvarDesafio({ desafioId: null, versao: null, campos: camposDesafio({ titulo: "Rascunho" }) });
    if (!rasc.ok) throw new Error(rasc.erro);
    expect((await acoes.acaoExcluirDesafio({ desafioId: rasc.dados.id, versao: rasc.dados.versao })).ok).toBe(true);
    const [apagado] = await db.select().from(s.criadores_desafios).where(eq(s.criadores_desafios.id, rasc.dados.id));
    expect(apagado).toMatchObject({ is_deleted: true }); // soft delete
    expect((await adm.desafiosDoAdmin(A.id, new Date())).map((d) => [d.titulo, d.situacao])).toEqual([["Maratona de novembro", "ENCERRADO"]]);
    expect((await adm.desafiosDoAdmin(B.id, new Date()))).toEqual([]);
    const trilha = (await trilhaDe(admin.usuario.id)).filter((t) => t.tabela === "criadores_desafios").map((t) => t.acao).sort();
    expect(trilha).toEqual(["atualizar", "atualizar", "criar", "criar", "excluir", "publicar"]);
  });

  it("ajuste manual: DONO/ADMIN, só ALUNO do criador, justificativa obrigatória, trilha; ALUNO recusado", async () => {
    const A = await novoCriador();
    const B = await novoCriador();
    const admin = await membroCom(A.id, "ADMIN");
    const dono = await pessoa(A.id, "DONO");
    const ana = await membroCom(A.id, "ALUNO");
    const deB = await pessoa(B.id);

    req.h = await cabecalhosLogados(admin.usuario.email, A.slug);
    expect(await acoes.acaoAjustarPontos({ membroId: ana.membro.id, pontos: 20, justificativa: "ok" })).toEqual({ ok: false, erro: "Explique o ajuste (5 a 500 caracteres)." });
    expect(await acoes.acaoAjustarPontos({ membroId: ana.membro.id, pontos: 0, justificativa: "Bônus por ajudar a turma" })).toEqual({ ok: false, erro: "Informe um ajuste diferente de zero." });
    expect(await acoes.acaoAjustarPontos({ membroId: dono.membro.id, pontos: 20, justificativa: "Bônus por ajudar a turma" })).toEqual({ ok: false, erro: "Aluno não encontrado nesta área." });
    expect(await acoes.acaoAjustarPontos({ membroId: deB.membro.id, pontos: 20, justificativa: "Bônus por ajudar a turma" })).toEqual({ ok: false, erro: "Aluno não encontrado nesta área." });
    const r = await acoes.acaoAjustarPontos({ membroId: ana.membro.id, pontos: -20, justificativa: "Pontos lançados em dobro" });
    expect(r.ok).toBe(true);
    expect((await razao(ana.membro.id)).map((l) => [l.motivo, l.pontos, l.justificativa, l.modified_by])).toEqual([["AJUSTE_MANUAL", -20, "Pontos lançados em dobro", admin.usuario.id]]);
    expect((await trilhaDe(admin.usuario.id)).some((t) => t.tabela === "criadores_membros_pontos" && t.detalhes.includes("Pontos lançados em dobro"))).toBe(true);
    const lista = await adm.alunosComPontos(A.id, { pagina: 1, porPagina: 20 });
    expect(lista.linhas.map((l) => [l.membroId, l.pontos])).toEqual([[ana.membro.id, -20]]);

    req.h = await cabecalhosLogados(ana.usuario.email, A.slug);
    expect(await acoes.acaoAjustarPontos({ membroId: ana.membro.id, pontos: 500, justificativa: "Eu mereço muito" })).toEqual({ ok: false, erro: "Sem permissão para esta ação." });
  });

  it("recompensa entregue: só concluída, uma vez, com trava e trilha", async () => {
    const cr = await novoCriador();
    const admin = await membroCom(cr.id, "ADMIN");
    const ana = await pessoa(cr.id);
    const cu = await cursoPronto(cr.id, { aulas: 2 });
    await ligarGamificacao(cr.id, admin.usuario.id);
    const d = await desafio(cr.id, admin.usuario.id, { recompensa: "Mentoria de 30 min" });
    await db.insert(s.criadores_desafios_participacoes).values({ criador_id: cr.id, desafio_id: d.id, membro_id: ana.membro.id, modified_by: ana.usuario.id });
    req.h = await cabecalhosLogados(admin.usuario.email, cr.slug);

    const [aberta] = await adm.recompensasDoAdmin(cr.id).then(() => db.select().from(s.criadores_desafios_participacoes).where(eq(s.criadores_desafios_participacoes.desafio_id, d.id)));
    expect(await acoes.acaoMarcarRecompensaEntregue({ participacaoId: aberta.id, versao: aberta.updated_at.toISOString() })).toEqual({ ok: false, erro: "Esta participação não tem recompensa a entregar." });

    for (const a of cu.aulas) await reg.concluirManualmente({ criadorId: cr.id, membroId: ana.membro.id, usuarioId: ana.usuario.id, aulaId: a.id });
    const [rec] = await adm.recompensasDoAdmin(cr.id);
    expect(rec).toMatchObject({ desafio: d.titulo, recompensa: "Mentoria de 30 min", entregueEm: null });
    expect((await razao(ana.membro.id)).filter((l) => l.motivo === "DESAFIO_CONCLUIDO")).toHaveLength(1);
    const versao = rec.versao.toISOString();
    expect((await acoes.acaoMarcarRecompensaEntregue({ participacaoId: rec.participacaoId, versao })).ok).toBe(true);
    expect(await acoes.acaoMarcarRecompensaEntregue({ participacaoId: rec.participacaoId, versao })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro/) });
    const [depois] = await adm.recompensasDoAdmin(cr.id);
    expect(depois.entreguePor).toBe(admin.usuario.nome);
    expect(depois.entregueEm).not.toBeNull();
    expect((await trilhaDe(admin.usuario.id)).filter((t) => t.tabela === "criadores_desafios_participacoes")).toHaveLength(1);
  });
});

describe("aluno", () => {
  it("participar e /conquistas: desligada = nula (404) e recusa; ligada = dados; ranking sem quem saiu", async () => {
    const cr = await novoCriador();
    const dono = await pessoa(cr.id, "DONO");
    const ana = await membroCom(cr.id, "ALUNO");
    const bia = await pessoa(cr.id);
    const caio = await pessoa(cr.id);
    const d = await desafio(cr.id, dono.usuario.id);
    const agora = new Date();

    expect(await conq.conquistasDoMembro(quemE(cr.id, ana), "semana", agora)).toBeNull();
    req.h = await cabecalhosLogados(ana.usuario.email, cr.slug);
    expect(await acoes.acaoParticiparDoDesafio({ desafioId: d.id })).toEqual({ ok: false, erro: "A gamificação está desligada nesta área." });

    await ligarGamificacao(cr.id, dono.usuario.id);
    expect(await acoes.acaoParticiparDoDesafio({ desafioId: d.id })).toEqual({ ok: true, dados: { entrou: true } });
    expect(await acoes.acaoParticiparDoDesafio({ desafioId: d.id, membroId: bia.membro.id })).toMatchObject({ ok: false }); // id de pessoa no corpo: recusado

    const dar = async (p: { membro: { id: string } }, pontos: number) =>
      db.transaction((tx) => import("@/lib/gamificacao/pontos").then((m) => m.ajustarPontos(tx, { criadorId: cr.id, membroId: p.membro.id, pontos, justificativa: "Carga do teste", autorUsuarioId: dono.usuario.id })));
    await dar(ana, 5);
    await dar(bia, 50);
    await dar(caio, 80);
    // Caio saiu da área (vínculo inativo): some do ranking.
    await db.update(s.criadores_membros).set({ status: "INATIVO" }).where(eq(s.criadores_membros.id, caio.membro.id));
    const c = await conq.conquistasDoMembro(quemE(cr.id, ana), "total", new Date());
    expect(c?.ranking.map((l) => [l.membroId, l.posicao])).toEqual([
      [bia.membro.id, 1],
      [ana.membro.id, 2],
    ]);
    expect(c?.desafios.emAndamento.map((x) => x.id)).toEqual([d.id]);
    expect(c?.resumo).toMatchObject({ total: 5, posicao: { total: 2 } });
    expect(c?.extrato.map((l) => l.pontos)).toEqual([5]);
    // Ana sai do ranking: continua vendo os próprios pontos, sem posição.
    await db.update(s.usuarios).set({ aparecer_no_ranking: false }).where(eq(s.usuarios.id, ana.usuario.id));
    const fora = await conq.conquistasDoMembro(quemE(cr.id, ana), "total", new Date());
    expect(fora?.ranking.map((l) => l.membroId)).toEqual([bia.membro.id]);
    expect(fora?.resumo).toMatchObject({ total: 5, aparecerNoRanking: false, posicao: { total: null } });
    expect(fora?.minhaForaDoTop).toBeNull();
    const participacoes = await db.select().from(s.criadores_desafios_participacoes).where(and(eq(s.criadores_desafios_participacoes.desafio_id, d.id)));
    expect(participacoes.map((p) => p.membro_id)).toEqual([ana.membro.id]);
  });
});
