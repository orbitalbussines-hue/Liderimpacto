/**
 * Moderação da comunidade (passo 8, RN-132, RN-133) no PostgreSQL real: fixar, ocultar com motivo,
 * denúncia e fila, silenciar (o silenciado não publica nem comenta), limite de frequência, lateral
 * (fixados, membros ativos) e as actions: ALUNO recebe "Sem permissão" em toda action de moderação.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador } from "./_apoio";
import { ok } from "./_catalogo";
import { participante } from "./_comunidade";
import { membroCom, quem } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let can: typeof import("@/lib/comunidade/canais");
let con: typeof import("@/lib/comunidade/consultas");
let pub: typeof import("@/lib/comunidade/publicacoes");
let com: typeof import("@/lib/comunidade/comentarios");
let mod: typeof import("@/lib/comunidade/moderacao");
let acoes: typeof import("@/lib/actions/comunidade");
let acoesMod: typeof import("@/lib/actions/comunidade-moderacao");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  can = await import("@/lib/comunidade/canais");
  con = await import("@/lib/comunidade/consultas");
  pub = await import("@/lib/comunidade/publicacoes");
  com = await import("@/lib/comunidade/comentarios");
  mod = await import("@/lib/comunidade/moderacao");
  acoes = await import("@/lib/actions/comunidade");
  acoesMod = await import("@/lib/actions/comunidade-moderacao");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const post = (canalId: string, texto = "Olá!") => ({ canalId, texto, aulaId: null, anexoIds: [], enquete: null });

async function cenario() {
  const cr = await novoCriador();
  await can.garantirCanalGeral(db, cr.id, cr.id);
  const [geral] = await db.select().from(s.criadores_canais).where(and(eq(s.criadores_canais.criador_id, cr.id), eq(s.criadores_canais.padrao, true)));
  const admin = await membroCom(cr.id, "ADMIN");
  const aluno = await membroCom(cr.id, "ALUNO");
  const leitor = await membroCom(cr.id, "ALUNO");
  const m = { criadorId: cr.id, usuarioId: admin.usuario.id, membroId: admin.membro.id, nome: admin.usuario.nome };
  return { cr, geral, admin, aluno, leitor, m, pAluno: participante(cr.id, aluno), pAdmin: participante(cr.id, admin) };
}

describe("moderação", () => {
  it("fixar/desfixar com trava; fixado aparece na lateral", async () => {
    const x = await cenario();
    const p = await pub.publicar(x.pAluno, post(x.geral.id, "Regras da comunidade: respeito acima de tudo"));
    const v = await mod.fixarPublicacao(x.m, p.id, new Date(p.versao), true);
    await expect(mod.fixarPublicacao(x.m, p.id, new Date(p.versao), false)).rejects.toThrow("Registro alterado");
    const lateral = await con.lateralDaComunidade(quem(x.cr.id, x.leitor));
    expect(lateral.fixados).toEqual([{ id: p.id, canalId: x.geral.id, canalNome: "Geral", titulo: "Regras da comunidade: respeito acima de tudo" }]);
    expect(lateral.proximoEncontro).toBeNull();
    expect((await con.postDaComunidade(quem(x.cr.id, x.leitor), p.id))!.post.fixado).toBe(true);
    await mod.fixarPublicacao(x.m, p.id, new Date(v.versao), false);
    expect((await con.lateralDaComunidade(quem(x.cr.id, x.leitor))).fixados).toEqual([]);
  });

  it("ocultar com motivo: some para os alunos, o autor vê com o motivo, a equipe vê; reexibir volta", async () => {
    const x = await cenario();
    const p = await pub.publicar(x.pAluno, post(x.geral.id, "Compre meu curso!"));
    const c = await com.comentar(x.pAluno, { postId: p.id }, "link de venda", null);
    const v = await mod.ocultar(x.m, { postId: p.id }, new Date(p.versao), { ocultar: true, motivo: "Propaganda" });
    await mod.ocultar(x.m, { comentarioId: c.id }, new Date(c.versao), { ocultar: true, motivo: "Propaganda" });
    expect(await con.postDaComunidade(quem(x.cr.id, x.leitor), p.id)).toBeNull();
    expect((await con.feedDaComunidade(quem(x.cr.id, x.leitor)))!.itens).toEqual([]);
    await expect(pub.alternarCurtida(participante(x.cr.id, x.leitor), { postId: p.id })).rejects.toThrow("Publicação não encontrada.");
    const doAutor = await con.postDaComunidade(quem(x.cr.id, x.aluno), p.id);
    expect(doAutor!.post.oculto).toEqual({ motivo: "Propaganda" });
    expect(doAutor!.comentarios[0].oculto).toEqual({ motivo: "Propaganda" });
    expect((await con.postDaComunidade(quem(x.cr.id, x.admin), p.id))!.post.oculto).toEqual({ motivo: "Propaganda" });
    await mod.ocultar(x.m, { postId: p.id }, new Date(v.versao), { ocultar: false });
    expect((await con.postDaComunidade(quem(x.cr.id, x.leitor), p.id))!.comentarios).toEqual([]); // o comentário segue oculto
  });

  it("denúncia: qualquer membro, não a própria, uma por alvo; fila da equipe; resolver com trava", async () => {
    const x = await cenario();
    const p = await pub.publicar(x.pAluno, post(x.geral.id, "Texto ofensivo"));
    const pLeitor = participante(x.cr.id, x.leitor);
    await expect(mod.denunciar(x.pAluno, { postId: p.id }, "não gostei")).rejects.toThrow("você mesmo escreveu");
    const d = await mod.denunciar(pLeitor, { postId: p.id }, "Ofensivo");
    await expect(mod.denunciar(pLeitor, { postId: p.id }, "De novo")).rejects.toThrow("já denunciou");
    const fila = await mod.filaDeDenuncias(x.cr.id);
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({
      id: d.id,
      motivo: "Ofensivo",
      denunciante: { membroId: x.leitor.membro.id },
      alvo: { tipo: "POST", id: p.id, postId: p.id, autor: { membroId: x.aluno.membro.id, equipe: false }, trecho: "Texto ofensivo", oculto: false, removido: false, versao: p.versao },
    });
    // A versão do ALVO é a trava de ocultar (a da denúncia não serve).
    await mod.ocultar(x.m, { postId: p.id }, new Date(fila[0].alvo.versao), { ocultar: true, motivo: "Ofensivo" });
    const doAdmin = await pub.publicar(x.pAdmin, post(x.geral.id, "Post da equipe"));
    await mod.denunciar(pLeitor, { postId: doAdmin.id }, "Não gostei");
    const dois = await mod.filaDeDenuncias(x.cr.id);
    expect(dois.find((f) => f.alvo.id === doAdmin.id)!.alvo.autor.equipe).toBe(true);
    expect(dois.find((f) => f.alvo.id === p.id)!.alvo).toMatchObject({ oculto: true });
    await mod.resolverDenuncia(x.m, d.id, new Date(fila[0].versao), "RESOLVIDA", "Conversamos com o autor");
    await expect(mod.resolverDenuncia(x.m, d.id, new Date(fila[0].versao), "DESCARTADA", null)).rejects.toThrow("Registro alterado");
    expect((await mod.filaDeDenuncias(x.cr.id)).map((f) => f.alvo.id)).toEqual([doAdmin.id]);
    expect((await mod.filaDeDenuncias(x.cr.id, "RESOLVIDA"))[0]).toMatchObject({ situacao: "RESOLVIDA", decisao: "Conversamos com o autor" });
  });

  it("silenciar: só aluno; silenciado não publica, não comenta, não edita; dessilenciar devolve", async () => {
    const x = await cenario();
    const p = await pub.publicar(x.pAluno, post(x.geral.id));
    await expect(mod.silenciar(x.m, x.admin.membro.id, 3, "teste")).rejects.toThrow("Só alunos");
    const { ate } = await mod.silenciar(x.m, x.aluno.membro.id, 3, "Ofensas repetidas");
    expect(ate.getTime()).toBeGreaterThan(Date.now() + 2 * 86_400_000);
    await expect(pub.publicar(x.pAluno, post(x.geral.id))).rejects.toThrow("silenciado");
    await expect(com.comentar(x.pAluno, { postId: p.id }, "x", null)).rejects.toThrow("silenciado");
    await expect(pub.editarPublicacao(x.pAluno, p.id, new Date(p.versao), "y")).rejects.toThrow("silenciado");
    expect((await con.situacaoNaComunidade(quem(x.cr.id, x.aluno))).silenciadoAte).toEqual(ate);
    expect((await mod.membrosSilenciados(x.cr.id)).map((m) => m.membroId)).toEqual([x.aluno.membro.id]);
    await mod.silenciar(x.m, x.aluno.membro.id, 1, "Reduzido"); // refaz o prazo, uma linha viva
    await mod.dessilenciar(x.m, x.aluno.membro.id);
    await expect(mod.dessilenciar(x.m, x.aluno.membro.id)).rejects.toThrow("não está silenciado");
    await expect(pub.publicar(x.pAluno, post(x.geral.id))).resolves.toBeTruthy();
  });

  it("limite de frequência: 6º post em 10 min recusado (apagar não devolve a cota); 21º comentário recusado", async () => {
    const x = await cenario();
    const feitos = [];
    for (let i = 0; i < 5; i++) feitos.push(await pub.publicar(x.pAluno, post(x.geral.id, `P${i}`)));
    await pub.removerPublicacao({ criadorId: x.cr.id, usuarioId: x.aluno.usuario.id, membroId: x.aluno.membro.id, equipe: false }, feitos[0].id, new Date(feitos[0].versao));
    await expect(pub.publicar(x.pAluno, post(x.geral.id))).rejects.toThrow("muitas vezes em pouco tempo");
    // Outro membro não é afetado; passada a janela, volta.
    await expect(pub.publicar(x.pAdmin, post(x.geral.id))).resolves.toBeTruthy();
    await db
      .update(s.criadores_canais_posts)
      .set({ created_at: new Date(Date.now() - 11 * 60_000) })
      .where(eq(s.criadores_canais_posts.autor_membro_id, x.aluno.membro.id));
    await expect(pub.publicar(x.pAluno, post(x.geral.id))).resolves.toBeTruthy();

    const alvo = feitos[1].id;
    for (let i = 0; i < 20; i++) await com.comentar(x.pAluno, { postId: alvo }, `c${i}`, null);
    await expect(com.comentar(x.pAluno, { postId: alvo }, "c20", null)).rejects.toThrow("muitas vezes em pouco tempo");
  });

  it("lateral: membros ativos por publicações + comentários em 30 dias (pontos 0)", async () => {
    const x = await cenario();
    const p = await pub.publicar(x.pAluno, post(x.geral.id));
    await com.comentar(x.pAluno, { postId: p.id }, "a", null);
    await com.comentar(participante(x.cr.id, x.leitor), { postId: p.id }, "b", null);
    const velho = await pub.publicar(x.pAdmin, post(x.geral.id));
    await db.update(s.criadores_canais_posts).set({ created_at: new Date(Date.now() - 31 * 86_400_000) }).where(eq(s.criadores_canais_posts.id, velho.id));
    const { membrosAtivos } = await con.lateralDaComunidade(quem(x.cr.id, x.leitor));
    expect(membrosAtivos.map((m) => [m.membroId, m.interacoes, m.pontos])).toEqual([
      [x.aluno.membro.id, 2, 0],
      [x.leitor.membro.id, 1, 0],
    ]);
  });
});

describe("actions", () => {
  it("ALUNO: 'Sem permissão' em toda action de moderação e de canais; as do membro funcionam pela sessão", async () => {
    const x = await cenario();
    req.h = await cabecalhosLogados(x.aluno.usuario.email, x.cr.slug);
    const p = ok(await acoes.acaoPublicar({ canalId: x.geral.id, texto: "Pela action" }));
    ok(await acoes.acaoComentar({ postId: p.id, texto: "Comentário" }));
    expect(ok(await acoes.acaoCurtir({ postId: p.id }))).toEqual({ curtiu: true, curtidas: 1 });
    expect(await acoes.acaoPublicar({ canalId: x.geral.id, texto: "x", autorMembroId: x.admin.membro.id })).toMatchObject({ ok: false });
    const v = new Date().toISOString();
    const negado = { ok: false, erro: "Sem permissão para esta ação." };
    expect(await acoesMod.acaoFixarPublicacao({ postId: p.id, versao: p.versao, fixar: true })).toEqual(negado);
    expect(await acoesMod.acaoOcultar({ postId: p.id, versao: p.versao, ocultar: true, motivo: "abc" })).toEqual(negado);
    expect(await acoesMod.acaoResolverDenuncia({ denunciaId: p.id, versao: v, situacao: "RESOLVIDA" })).toEqual(negado);
    expect(await acoesMod.acaoSilenciarMembro({ membroId: x.leitor.membro.id, dias: 1, motivo: "abc" })).toEqual(negado);
    expect(await acoesMod.acaoDessilenciarMembro({ membroId: x.leitor.membro.id })).toEqual(negado);
    expect(await acoesMod.acaoCriarCanal({ nome: "Meu canal", acesso: "TODOS" })).toEqual(negado);
    expect(await acoesMod.acaoSalvarCanal({ canalId: x.geral.id, versao: v, dados: { nome: "X", acesso: "TODOS" } })).toEqual(negado);
    expect(await acoesMod.acaoRemoverCanal({ canalId: x.geral.id, versao: v })).toEqual(negado);
    // Remover post de outra pessoa: o aluno não consegue (só o autor ou a equipe).
    const doAdmin = await pub.publicar(x.pAdmin, post(x.geral.id));
    expect(await acoes.acaoRemoverPublicacao({ postId: doAdmin.id, versao: doAdmin.versao })).toMatchObject({ ok: false });

    req.h = await cabecalhosLogados(x.admin.usuario.email, x.cr.slug);
    const c = ok(await acoesMod.acaoCriarCanal({ nome: "Avisos", acesso: "TODOS", quemPosta: "EQUIPE" }));
    ok(await acoesMod.acaoSalvarCanal({ canalId: c.id, versao: c.versao, dados: { nome: "Avisos oficiais", acesso: "TODOS", quemPosta: "EQUIPE" } }));
    ok(await acoesMod.acaoFixarPublicacao({ postId: p.id, versao: p.versao, fixar: true }));
    expect((await can.canaisParaEditar(x.cr.id)).map((k) => k.nome)).toEqual(["Avisos oficiais", "Geral"]);
  });
});
