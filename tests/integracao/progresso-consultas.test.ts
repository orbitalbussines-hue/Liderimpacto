/**
 * Consultas das telas do aluno (passo 5) no PostgreSQL real: fileiras CONTINUAR, TOP 10,
 * NOVIDADES, LISTA e MENTORIAS, página do curso, player, perfil — cada uma com os filtros
 * (rascunho, módulo oculto, não liberada, matrícula vencida somem) e isolamento A x B. Actions de
 * favoritos, anotações e preferências com sessão, permissão e trava.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador, vincular } from "./_apoio";
import { ok, versaoDe } from "./_catalogo";
import { alunoMatriculado, cursoPronto, envelhecer, matricular, membroCom, novaAula, novoModulo, quem } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let c: typeof import("@/lib/progresso/consultas");
let reg: typeof import("@/lib/progresso/registrar");
let favs: typeof import("@/lib/actions/favoritos");
let notas: typeof import("@/lib/actions/anotacoes");
let prefs: typeof import("@/lib/actions/preferencias");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  c = await import("@/lib/progresso/consultas");
  reg = await import("@/lib/progresso/registrar");
  favs = await import("@/lib/actions/favoritos");
  notas = await import("@/lib/actions/anotacoes");
  prefs = await import("@/lib/actions/preferencias");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const DIA = 86_400_000;
type Aluno = Awaited<ReturnType<typeof alunoMatriculado>>;

/** Assiste `seg` segundos da aula (em batidas de 15 s, "com tempo real passando"). */
async function assistir(criadorId: string, a: Aluno, aulaId: string, seg: number, duracao = 100) {
  for (let ini = 0; ini < seg; ini += 15) {
    await envelhecer(a.membro.id, aulaId, 10);
    await reg.registrarProgresso({ criadorId, membroId: a.membro.id, usuarioId: a.usuario.id, aulaId, intervalos: [[ini, Math.min(ini + 15, seg)]], posicao: Math.min(ini + 15, seg), duracaoSeg: duracao });
  }
}

const ids = (itens: { id: string }[]) => itens.map((i) => i.id);

describe("fileiras da vitrine", () => {
  it("CONTINUAR: 1–94%, mais recente primeiro; some 0%, ≥95%, concluída pelo botão, matrícula vencida, rascunho, não liberada e outro criador", async () => {
    const cr = await novoCriador();
    const curso = await cursoPronto(cr.id, { aulas: 6 });
    const al = await alunoMatriculado(cr.id, curso.produto.id);
    const q = quem(cr.id, al);
    const [a0, a1, a2, a3, a4, a5] = curso.aulas;
    await assistir(cr.id, al, a0.id, 30);
    await assistir(cr.id, al, a1.id, 96); // 96%: fora
    await reg.registrarProgresso({ criadorId: cr.id, membroId: al.membro.id, usuarioId: al.usuario.id, aulaId: a2.id, intervalos: [], posicao: 40, duracaoSeg: 100 }); // 0%: fora
    await assistir(cr.id, al, a3.id, 15);
    await reg.concluirManualmente({ criadorId: cr.id, membroId: al.membro.id, usuarioId: al.usuario.id, aulaId: a3.id }); // botão: fora
    await assistir(cr.id, al, a4.id, 45);
    await assistir(cr.id, al, a5.id, 15);
    await db.update(s.produtos_modulos_aulas).set({ libera_em: new Date(Date.now() + DIA) }).where(eq(s.produtos_modulos_aulas.id, a5.id)); // não liberada: fora
    const lista = await c.continuarAssistindo(q);
    expect(ids(lista)).toEqual([a4.id, a0.id]);
    expect(lista[0]).toMatchObject({ tipo: "AULA", progresso: 45, subtitulo: "Módulo 1 · Aula 5", href: `/aula/${a4.id}`, produtoTitulo: curso.produto.titulo });
    // Matrícula vencida: tudo some. Equipe (sem matrícula) não tem progresso próprio aqui.
    await db.update(s.produtos_matriculas).set({ expira_em: new Date(Date.now() - 1000) }).where(eq(s.produtos_matriculas.membro_id, al.membro.id));
    expect(await c.continuarAssistindo(q)).toEqual([]);
    await db.update(s.produtos_matriculas).set({ expira_em: null }).where(eq(s.produtos_matriculas.membro_id, al.membro.id));
    await db.update(s.produtos).set({ status: "RASCUNHO" }).where(eq(s.produtos.id, curso.produto.id));
    expect(await c.continuarAssistindo(q)).toEqual([]);
    // Isolamento: no criador B o membro de A não tem progresso nenhum.
    const b = await novoCriador();
    expect(await c.continuarAssistindo({ ...q, criador: { id: b.id } })).toEqual([]);
  });

  it("TOP 10: soma dos últimos 7 dias (hoje incluso), só catálogo PUBLICADO e liberado, ranking 1..N, por criador", async () => {
    const cr = await novoCriador();
    const curso = await cursoPronto(cr.id, { aulas: 4 });
    const naoListado = await cursoPronto(cr.id, { aulas: 1, status: "NAO_LISTADO" });
    const [a0, a1, a2, a3] = curso.aulas;
    const agora = new Date();
    const dia = (n: number) => new Date(agora.getTime() - n * DIA - 3 * 3_600_000).toISOString().slice(0, 10); // calendário de Brasília (UTC-3)
    const vis = (aulaId: string, d: string, n: number) =>
      db.insert(s.produtos_modulos_aulas_visualizacoes).values({ criador_id: cr.id, aula_id: aulaId, dia: d, visualizacoes: n, modified_by: cr.id });
    await vis(a0.id, dia(0), 3);
    await vis(a0.id, dia(6), 2); // 6 dias atrás: entra (5)
    await vis(a1.id, dia(1), 7);
    await vis(a2.id, dia(7), 50); // 7 dias atrás: fora
    await vis(a3.id, dia(2), 9);
    await db.update(s.produtos_modulos_aulas).set({ libera_em: new Date(agora.getTime() + DIA) }).where(eq(s.produtos_modulos_aulas.id, a3.id)); // não liberada
    await vis(naoListado.aulas[0].id, dia(0), 99); // fora da vitrine
    const b = await novoCriador();
    const cursoB = await cursoPronto(b.id, { aulas: 1 });
    await db.insert(s.produtos_modulos_aulas_visualizacoes).values({ criador_id: b.id, aula_id: cursoB.aulas[0].id, dia: dia(0), visualizacoes: 100, modified_by: b.id });
    const top = await c.top10Agora(cr.id, 10, agora);
    expect(top.map((t) => [t.id, t.posicao, t.visualizacoes])).toEqual([
      [a1.id, 1, 7],
      [a0.id, 2, 5],
    ]);
    expect(top[0].href).toBe(`/aula/${a1.id}`);
    expect(await c.top10Agora(cr.id, 1, agora)).toHaveLength(1);
  });

  it("NOVIDADES: curso publicado há < 30 dias (todos veem) + aula nova em curso antigo (só quem está matriculado)", async () => {
    const cr = await novoCriador();
    const novo = await cursoPronto(cr.id, { publicadoEm: new Date(Date.now() - 5 * DIA) });
    const antigo = await cursoPronto(cr.id, { publicadoEm: new Date(Date.now() - 40 * DIA) });
    await db.update(s.produtos_modulos_aulas).set({ created_at: new Date(Date.now() - 41 * DIA) }).where(eq(s.produtos_modulos_aulas.modulo_id, antigo.modulo.id));
    const aulaNova = await novaAula(cr.id, antigo.modulo.id, 9);
    await cursoPronto(cr.id, { status: "RASCUNHO" });
    const matriculado = await alunoMatriculado(cr.id, antigo.produto.id);
    const semMatricula = await membroCom(cr.id);
    expect(ids(await c.novidades(quem(cr.id, matriculado)))).toEqual([aulaNova.id, novo.produto.id]);
    const item = (await c.novidades(quem(cr.id, matriculado)))[1];
    expect(item).toMatchObject({ tipo: "PRODUTO", href: `/cursos/${novo.produto.slug}`, subtitulo: "Curso online" });
    expect(ids(await c.novidades(quem(cr.id, semMatricula)))).toEqual([novo.produto.id]);
  });

  it("MENTORIAS: só tipo MENTORIA publicado, com 'matriculado'", async () => {
    const cr = await novoCriador();
    const m1 = await cursoPronto(cr.id, { tipo: "MENTORIA" });
    await cursoPronto(cr.id, { tipo: "MENTORIA", status: "RASCUNHO" });
    await cursoPronto(cr.id, { tipo: "CURSO" });
    const al = await alunoMatriculado(cr.id, m1.produto.id);
    expect((await c.mentorias(quem(cr.id, al))).map((m) => [m.id, m.matriculado])).toEqual([[m1.produto.id, true]]);
    const outro = await membroCom(cr.id);
    expect((await c.mentorias(quem(cr.id, outro)))[0].matriculado).toBe(false);
  });
});

describe("página do curso, player e perfil", () => {
  /** Curso com 2 módulos: m1 (a1, a2 com pré-requisito a1), m2 (a3 liberada amanhã) e um módulo oculto. */
  async function cursoCompleto() {
    const cr = await novoCriador();
    const curso = await cursoPronto(cr.id, { aulas: 2 });
    const [a1, a2] = curso.aulas;
    await db.update(s.produtos_modulos_aulas).set({ pre_requisito_aula_id: a1.id }).where(eq(s.produtos_modulos_aulas.id, a2.id));
    const m2 = await novoModulo(cr.id, curso.produto.id, 2);
    const a3 = await novaAula(cr.id, m2.id, 1);
    await db.update(s.produtos_modulos_aulas).set({ libera_em: new Date(Date.now() + DIA) }).where(eq(s.produtos_modulos_aulas.id, a3.id));
    const oculto = await novoModulo(cr.id, curso.produto.id, 3, "RASCUNHO");
    const aOculta = await novaAula(cr.id, oculto.id, 1);
    const al = await alunoMatriculado(cr.id, curso.produto.id);
    return { cr, curso, a1, a2, a3, aOculta, al };
  }

  it("cursoDoAluno: estados, motivos, progresso, próxima; sem matrícula tudo trava por MATRICULA; rascunho some para o aluno", async () => {
    const { cr, curso, a1, a2, a3, al } = await cursoCompleto();
    const q = quem(cr.id, al);
    let r = (await c.cursoDoAluno(q, curso.produto.slug))!;
    expect(r.modulos.map((m) => [m.numero, m.totalAulas])).toEqual([["01", 2], ["02", 1]]); // módulo oculto não aparece
    expect(r.modulos[0].aulas.map((a) => [a.numero, a.estado, a.motivoBloqueio])).toEqual([["1.1", "atual", null], ["1.2", "bloqueada", "PRE_REQUISITO"]]);
    expect(r.modulos[0].aulas[1].preRequisito).toEqual({ id: a1.id, numero: "1.1", titulo: a1.titulo });
    expect(r.modulos[1]).toMatchObject({ estado: "bloqueado", aulas: [{ id: a3.id, motivoBloqueio: "LIBERACAO" }] });
    expect(r.proxima).toMatchObject({ aulaId: a1.id, rotulo: "Começar · Aula 1.1", retomarEm: 0 });
    expect(r).toMatchObject({ matriculado: true, favorito: false, progresso: { concluidas: 0, total: 3, percentual: 0 }, totais: { aulas: 3, duracaoSeg: 300, materiais: 0 } });

    await assistir(cr.id, al, a1.id, 90);
    await assistir(cr.id, al, a2.id, 30);
    r = (await c.cursoDoAluno(q, curso.produto.slug))!;
    expect(r.modulos[0].aulas.map((a) => a.estado)).toEqual(["concluida", "atual"]);
    expect(r.proxima).toMatchObject({ aulaId: a2.id, rotulo: "Continuar · Aula 1.2", retomarEm: 30 });
    expect(r.progresso).toEqual({ concluidas: 1, total: 3, percentual: 33 });

    const semMatricula = await membroCom(cr.id);
    const r2 = (await c.cursoDoAluno(quem(cr.id, semMatricula), curso.produto.slug))!;
    expect(r2.matriculado).toBe(false);
    expect(r2.modulos.flatMap((m) => m.aulas.map((a) => a.motivoBloqueio))).toEqual(["MATRICULA", "MATRICULA", "MATRICULA"]);
    expect(r2.proxima).toBeNull();

    const admin = await membroCom(cr.id, "ADMIN");
    await db.update(s.produtos).set({ status: "RASCUNHO" }).where(eq(s.produtos.id, curso.produto.id));
    expect(await c.cursoDoAluno(q, curso.produto.slug)).toBeNull();
    const prev = (await c.cursoDoAluno(quem(cr.id, admin), curso.produto.slug))!;
    expect(prev.modulos).toHaveLength(3); // equipe vê o módulo oculto, tudo liberado
    expect(prev.modulos.flatMap((m) => m.aulas.map((a) => a.motivoBloqueio)).every((m) => m === null)).toBe(true);
    // Isolamento: o slug de A não existe em B.
    const b = await novoCriador();
    expect(await c.cursoDoAluno({ ...q, criador: { id: b.id } }, curso.produto.slug)).toBeNull();
  });

  it("aulaParaPlayer: anterior/próxima LIBERADAS, playlist, materiais só com acesso, anotações só do dono, autoplay da preferência, retomar", async () => {
    const { cr, curso, a1, a2, aOculta, al } = await cursoCompleto();
    const q = quem(cr.id, al);
    await db.insert(s.produtos_modulos_aulas_materiais).values([
      { criador_id: cr.id, aula_id: a1.id, nome: "Site", tipo: "LINK", url: "https://exemplo.com.br", modified_by: cr.id },
      { criador_id: cr.id, aula_id: a2.id, nome: "Planilha", tipo: "LINK", url: "https://exemplo.com.br/p", modified_by: cr.id },
    ]);
    let p = (await c.aulaParaPlayer(q, a1.id))!;
    expect(p).toMatchObject({ pode: true, motivoBloqueio: null, video: null, anterior: null, proxima: null, retomarEm: 0, concluirManual: true, favorito: false });
    expect(p.aula).toMatchObject({ numero: "1.1", duracaoSeg: 100, capitulos: [] });
    expect(p.materiais.map((m) => m.nome)).toEqual(["Site"]);
    expect(p.playlist.map((m) => m.aulas.length)).toEqual([2, 1]);
    expect(p.flags).toMatchObject({ autoplay: true, playlist: true, abas: { comentarios: true }, aulasParaCertificado: null });

    const bloqueada = (await c.aulaParaPlayer(q, a2.id))!;
    expect(bloqueada).toMatchObject({ pode: false, motivoBloqueio: "PRE_REQUISITO", materiais: [], anterior: { id: a1.id } });
    expect(await c.aulaParaPlayer(q, aOculta.id)).toBeNull(); // módulo oculto: 404 para o aluno

    await assistir(cr.id, al, a1.id, 45);
    req.h = await cabecalhosLogados(al.usuario.email, cr.slug);
    ok(await prefs.acaoSalvarPreferencias({ reproducaoAutomatica: false }));
    const n = ok(await notas.acaoCriarAnotacao({ aulaId: a1.id, tempoSeg: 12.7, texto: "  ponto <importante>  " }));
    const outro = await alunoMatriculado(cr.id, curso.produto.id);
    req.h = await cabecalhosLogados(outro.usuario.email, cr.slug);
    ok(await notas.acaoCriarAnotacao({ aulaId: a1.id, tempoSeg: 3, texto: "do outro" }));
    p = (await c.aulaParaPlayer(q, a1.id))!;
    expect(p.retomarEm).toBe(45);
    expect(p.flags.autoplay).toBe(false);
    expect(p.anotacoes).toEqual([{ id: n.id, tempoSeg: 12, texto: "ponto <importante>", versao: n.versao }]);
    expect(p.progresso).toMatchObject({ percentual: 45, concluida: false });
    await assistir(cr.id, al, a1.id, 90);
    p = (await c.aulaParaPlayer(q, a1.id))!;
    expect(p.proxima).toMatchObject({ id: a2.id, numero: "1.2" }); // pré-requisito cumprido: a2 abriu (a3 segue travada)
    expect((await c.aulaParaPlayer(q, a2.id))!.proxima).toBeNull();
  });

  it("progresso dos cursos e números do perfil", async () => {
    const { cr, curso, a1, al } = await cursoCompleto();
    const q = quem(cr.id, al);
    await assistir(cr.id, al, a1.id, 90);
    expect((await c.progressoDosCursos(q, [curso.produto.id])).get(curso.produto.id)).toEqual({ concluidas: 1, total: 3, percentual: 33 });
    expect(await c.progressoDoCurso(q, curso.produto.id)).toEqual({ concluidas: 1, total: 3, percentual: 33 });
    expect(await c.numerosDoPerfil(q)).toEqual({ aulasConcluidas: 1, segundosAssistidos: 90, cursosConcluidos: 0, certificados: 0, pontos: 0 });
    const b = await novoCriador();
    expect(await c.numerosDoPerfil({ ...q, criador: { id: b.id } })).toMatchObject({ aulasConcluidas: 0 });
  });
});

describe("actions: favoritos, anotações e preferências", () => {
  it("favoritar é idempotente; desfavoritar = soft delete; refavoritar REATIVA a mesma linha; rascunho e outro criador não", async () => {
    const cr = await novoCriador();
    const curso = await cursoPronto(cr.id);
    const rascunho = await cursoPronto(cr.id, { status: "RASCUNHO" });
    const b = await novoCriador();
    const cursoB = await cursoPronto(b.id);
    const al = await membroCom(cr.id);
    req.h = await cabecalhosLogados(al.usuario.email, cr.slug);
    expect(ok(await favs.acaoFavoritar({ produtoId: curso.produto.id }))).toEqual({ favorito: true });
    expect(ok(await favs.acaoFavoritar({ produtoId: curso.produto.id }))).toEqual({ favorito: true });
    ok(await favs.acaoFavoritar({ aulaId: curso.aulas[1].id }));
    const linhas = () => db.select().from(s.criadores_membros_favoritos).where(eq(s.criadores_membros_favoritos.membro_id, al.membro.id));
    expect(await linhas()).toHaveLength(2);
    const lista = await c.minhaLista(quem(cr.id, al));
    expect(lista.map((i) => i.tipo)).toEqual(["AULA", "PRODUTO"]); // último favoritado primeiro
    expect(await c.estaNaLista(quem(cr.id, al), { produtoId: curso.produto.id })).toBe(true);

    ok(await favs.acaoDesfavoritar({ produtoId: curso.produto.id }));
    expect(await c.estaNaLista(quem(cr.id, al), { produtoId: curso.produto.id })).toBe(false);
    const idOriginal = (await linhas()).find((l) => l.produto_id)!.id;
    ok(await favs.acaoFavoritar({ produtoId: curso.produto.id }));
    expect(await linhas()).toHaveLength(2);
    expect((await linhas()).find((l) => l.produto_id)).toMatchObject({ id: idOriginal, is_deleted: false, deleted_at: null });

    expect(await favs.acaoFavoritar({ produtoId: rascunho.produto.id })).toEqual({ ok: false, erro: "Curso ou aula não encontrado." });
    expect(await favs.acaoFavoritar({ produtoId: cursoB.produto.id })).toEqual({ ok: false, erro: "Curso ou aula não encontrado." });
    expect((await favs.acaoFavoritar({ produtoId: curso.produto.id, membroId: al.membro.id })).ok).toBe(false); // strictObject
    // Curso foi para rascunho depois de favoritado: some da lista.
    await db.update(s.produtos).set({ status: "RASCUNHO" }).where(eq(s.produtos.id, curso.produto.id));
    expect(await c.minhaLista(quem(cr.id, al))).toEqual([]);
  });

  it("anotações: só quem assiste cria; editar/remover só as próprias, com trava de colisão", async () => {
    const cr = await novoCriador();
    const curso = await cursoPronto(cr.id);
    const al = await alunoMatriculado(cr.id, curso.produto.id);
    const intruso = await alunoMatriculado(cr.id, curso.produto.id);
    const semMatricula = await membroCom(cr.id);
    const aula = curso.aulas[0];

    req.h = await cabecalhosLogados(semMatricula.usuario.email, cr.slug);
    expect(await notas.acaoCriarAnotacao({ aulaId: aula.id, tempoSeg: 1, texto: "x" })).toEqual({ ok: false, erro: "Sem permissão para esta ação." });

    req.h = await cabecalhosLogados(al.usuario.email, cr.slug);
    expect((await notas.acaoCriarAnotacao({ aulaId: aula.id, tempoSeg: 1, texto: "   " })).ok).toBe(false);
    expect((await notas.acaoCriarAnotacao({ aulaId: aula.id, tempoSeg: 1, texto: "a".repeat(2001) })).ok).toBe(false);
    const n = ok(await notas.acaoCriarAnotacao({ aulaId: aula.id, tempoSeg: 10, texto: "primeira" }));
    const v2 = ok(await notas.acaoEditarAnotacao({ anotacaoId: n.id, versao: n.versao, texto: "editada", tempoSeg: 11 }));
    // Versão velha (outra aba): colisão.
    expect(await notas.acaoEditarAnotacao({ anotacaoId: n.id, versao: n.versao, texto: "velha" })).toEqual({ ok: false, erro: "Registro alterado por outro usuario. Recarregue e tente novamente." });

    req.h = await cabecalhosLogados(intruso.usuario.email, cr.slug);
    expect((await notas.acaoEditarAnotacao({ anotacaoId: n.id, versao: v2.versao, texto: "invadi" })).ok).toBe(false);
    expect((await notas.acaoRemoverAnotacao({ anotacaoId: n.id, versao: v2.versao })).ok).toBe(false);

    req.h = await cabecalhosLogados(al.usuario.email, cr.slug);
    expect(await versaoDe(s.produtos_modulos_aulas_anotacoes, n.id)).toBe(v2.versao);
    ok(await notas.acaoRemoverAnotacao({ anotacaoId: n.id, versao: v2.versao }));
    const [linha] = await db.select().from(s.produtos_modulos_aulas_anotacoes).where(eq(s.produtos_modulos_aulas_anotacoes.id, n.id));
    expect(linha).toMatchObject({ is_deleted: true, texto: "editada", tempo_seg: 11 });
    expect((await c.aulaParaPlayer(quem(cr.id, al), aula.id))!.anotacoes).toEqual([]);
    const trilha = await db.select().from(s.auditoria).where(eq(s.auditoria.registro_id, n.id));
    expect(trilha.map((t) => t.acao).sort()).toEqual(["atualizar", "criar", "excluir"]);
  });

  it("preferências: da sessão (nunca de id no corpo), valem em qualquer criador, com trilha", async () => {
    const cr = await novoCriador();
    const al = await membroCom(cr.id);
    expect(await c.preferenciasDoAluno(al.usuario.id)).toEqual({ reproducaoAutomatica: true, lembretes: true, aparecerNoRanking: true });
    req.h = await cabecalhosLogados(al.usuario.email, cr.slug);
    expect(ok(await prefs.acaoSalvarPreferencias({ lembretes: false }))).toEqual({ reproducaoAutomatica: true, lembretes: false, aparecerNoRanking: true });
    expect((await prefs.acaoSalvarPreferencias({ lembretes: true, usuarioId: al.usuario.id })).ok).toBe(false);
    expect((await prefs.acaoSalvarPreferencias({})).ok).toBe(false);
    // Sair do ranking (RN-146) é preferência da pessoa, como "Lembretes".
    expect(ok(await prefs.acaoSalvarPreferencias({ aparecerNoRanking: false }))).toEqual({ reproducaoAutomatica: true, lembretes: false, aparecerNoRanking: false });
    expect(await c.preferenciasDoAluno(al.usuario.id)).toEqual({ reproducaoAutomatica: true, lembretes: false, aparecerNoRanking: false });
    // Outro criador, mesma pessoa: mesma preferência.
    const b = await novoCriador();
    await matricular(b.id, (await vincular(b.id, al.usuario.id, "ALUNO")).id, (await cursoPronto(b.id)).produto.id);
    req.h = await cabecalhosLogados(al.usuario.email, b.slug);
    expect(ok(await prefs.acaoSalvarPreferencias({ reproducaoAutomatica: false }))).toEqual({ reproducaoAutomatica: false, lembretes: false, aparecerNoRanking: false });
  });
});

