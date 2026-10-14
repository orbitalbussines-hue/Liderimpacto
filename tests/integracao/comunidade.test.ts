/**
 * Comunidade (passo 8, RN-130 a RN-133) no PostgreSQL real: visibilidade por acesso do canal
 * (todos, grupo, produto, equipe), canal de avisos, texto puro, anexos pela allowlist, enquete,
 * curtida toggle e contadores, feed paginado, comentários de 1 nível, comentários da aula só para
 * quem assiste, editar/remover com trava e isolamento A×B.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { novoCriador } from "./_apoio";
import { anexoPronto, canal, grupoCom, participante } from "./_comunidade";
import { concluirAulas } from "./_passo7";
import { cursoPronto, matricular, membroCom, quem } from "./_progresso";

let can: typeof import("@/lib/comunidade/canais");
let con: typeof import("@/lib/comunidade/consultas");
let pub: typeof import("@/lib/comunidade/publicacoes");
let com: typeof import("@/lib/comunidade/comentarios");
let anx: typeof import("@/lib/comunidade/anexos");
let mod: typeof import("@/lib/comunidade/moderacao");
let regras: typeof import("@/lib/comunidade/regras");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  can = await import("@/lib/comunidade/canais");
  con = await import("@/lib/comunidade/consultas");
  pub = await import("@/lib/comunidade/publicacoes");
  com = await import("@/lib/comunidade/comentarios");
  anx = await import("@/lib/comunidade/anexos");
  mod = await import("@/lib/comunidade/moderacao");
  regras = await import("@/lib/comunidade/regras");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const post = (canalId: string, texto = "Olá, comunidade!", extra: Partial<import("@/lib/comunidade/publicacoes").NovaPublicacao> = {}) => ({
  canalId,
  texto,
  aulaId: null,
  anexoIds: [],
  enquete: null,
  ...extra,
});

async function cenario() {
  const cr = await novoCriador();
  const curso = await cursoPronto(cr.id, { aulas: 2 });
  const dono = await membroCom(cr.id, "DONO");
  const aluno = await membroCom(cr.id, "ALUNO");
  await can.garantirCanalGeral(db, cr.id, cr.id);
  const [geral] = await db.select().from(s.criadores_canais).where(and(eq(s.criadores_canais.criador_id, cr.id), eq(s.criadores_canais.padrao, true)));
  return { cr, curso, dono, aluno, geral, pDono: participante(cr.id, dono), pAluno: participante(cr.id, aluno) };
}

describe("canais e visibilidade", () => {
  it("Geral idempotente; aluno vê TODOS, GRUPO (se está no grupo), PRODUTO (matrícula valendo) e nunca EQUIPE; equipe vê todos", async () => {
    const cr = await novoCriador();
    await can.garantirCanalGeral(db, cr.id, cr.id);
    await can.garantirCanalGeral(db, cr.id, cr.id);
    const curso = await cursoPronto(cr.id);
    const dono = await membroCom(cr.id, "DONO");
    const [livre, doGrupo, comMatricula, expirado] = await Promise.all([membroCom(cr.id), membroCom(cr.id), membroCom(cr.id), membroCom(cr.id)]);
    await matricular(cr.id, comMatricula.membro.id, curso.produto.id);
    await matricular(cr.id, expirado.membro.id, curso.produto.id, new Date(Date.now() - 60_000));
    const g = await grupoCom(cr.id, [doGrupo.membro.id]);
    const cGrupo = await canal(cr.id, { nome: "Turma A", acesso: "GRUPO", grupoId: g.id });
    const cCurso = await canal(cr.id, { nome: "Alunos do curso", acesso: "PRODUTO", produtoId: curso.produto.id });
    const cEquipe = await canal(cr.id, { nome: "Bastidores", acesso: "EQUIPE" });
    const nomes = async (p: { usuario: { id: string }; membro: { id: string; papel: "DONO" | "ADMIN" | "ALUNO" } }) =>
      (await can.canaisDoMembro(quem(cr.id, p))).map((c) => c.nome).sort();

    expect(await nomes(livre)).toEqual(["Geral"]);
    expect(await nomes(doGrupo)).toEqual(["Geral", "Turma A"]);
    expect(await nomes(comMatricula)).toEqual(["Alunos do curso", "Geral"]);
    expect(await nomes(expirado)).toEqual(["Geral"]);
    expect(await nomes(dono)).toEqual(["Alunos do curso", "Bastidores", "Geral", "Turma A"]);

    // Post no canal da equipe: invisível no feed geral do aluno e o canal dá 404 (null).
    await pub.publicar(participante(cr.id, dono), post(cEquipe.id, "Só equipe"));
    await pub.publicar(participante(cr.id, doGrupo), post(cGrupo.id, "Da turma"));
    expect((await con.feedDaComunidade(quem(cr.id, livre)))!.itens.map((p) => p.texto)).toEqual([]);
    expect(await con.feedDaComunidade(quem(cr.id, livre), { canalId: cEquipe.id })).toBeNull();
    expect(await con.feedDaComunidade(quem(cr.id, comMatricula), { canalId: cGrupo.id })).toBeNull();
    expect((await con.feedDaComunidade(quem(cr.id, dono)))!.itens.map((p) => p.texto).sort()).toEqual(["Da turma", "Só equipe"]);
    // Aluno fora do grupo nem publica lá.
    await expect(pub.publicar(participante(cr.id, livre), post(cGrupo.id))).rejects.toThrow("Canal não encontrado.");
    await expect(pub.publicar(participante(cr.id, comMatricula), post(cCurso.id, "Oi turma do curso"))).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("canal de avisos: só a equipe publica; o Geral não sai e é sempre de todos", async () => {
    const x = await cenario();
    const avisos = await canal(x.cr.id, { nome: "Avisos", quemPosta: "EQUIPE" });
    await expect(pub.publicar(x.pAluno, post(avisos.id))).rejects.toThrow("Só a equipe publica neste canal.");
    await expect(pub.publicar(x.pDono, post(avisos.id, "Mentoria terça às 20h"))).resolves.toBeTruthy();
    const lista = await can.canaisDoMembro(quem(x.cr.id, x.aluno));
    expect(lista.find((c) => c.nome === "Avisos")).toMatchObject({ podePublicar: false });

    const eq_ = { criadorId: x.cr.id, usuarioId: x.dono.usuario.id };
    const [geralPadrao] = (await can.canaisParaEditar(x.cr.id)).filter((c) => c.padrao);
    await expect(can.removerCanal(eq_, geralPadrao.id, new Date(geralPadrao.versao))).rejects.toThrow("não pode ser removido");
    const dados = { nome: "Geral", descricao: "", ordem: 1, acesso: "EQUIPE" as const, grupoId: null, produtoId: null, quemPosta: "TODOS" as const };
    await expect(can.salvarCanal(eq_, geralPadrao.id, new Date(geralPadrao.versao), dados)).rejects.toThrow("sempre de todos");
    await expect(can.criarCanal(eq_, { ...dados, nome: "avisos", acesso: "TODOS" })).rejects.toThrow("Já existe um canal com este nome.");
  });
});

describe("publicações", () => {
  it("texto puro: HTML fica literal no banco e no feed; links saem de segmentosDeTexto", async () => {
    const x = await cenario();
    const texto = '<img src=x onerror="alert(1)"> veja https://liderdeimpacto.com.br/aula.';
    const { id } = await pub.publicar(x.pAluno, post(x.geral.id, texto));
    const [l] = await db.select().from(s.criadores_canais_posts).where(eq(s.criadores_canais_posts.id, id));
    expect(l.texto).toBe(texto);
    const [p] = (await con.feedDaComunidade(quem(x.cr.id, x.aluno)))!.itens;
    expect(p).toMatchObject({ texto, autor: { iniciais: "PT", equipe: false }, podeEditar: true, podeRemover: true, podeModerar: false });
    expect(regras.segmentosDeTexto(p.texto).filter((g) => g.tipo === "link")).toEqual([
      { tipo: "link", valor: "https://liderdeimpacto.com.br/aula", href: "https://liderdeimpacto.com.br/aula" },
    ]);
  });

  it("anexos pela allowlist: tipo/tamanho no envio; arquivo do catálogo, de outra pessoa ou acima do limite recusado", async () => {
    const x = await cenario();
    await expect(anx.iniciarEnvioDeAnexo(x.pAluno, { nome: "a.svg", mime: "image/svg+xml", tamanho: 100 })).rejects.toThrow("Tipo de arquivo não aceito");
    await expect(anx.iniciarEnvioDeAnexo(x.pAluno, { nome: "a.exe", mime: "application/x-msdownload", tamanho: 100 })).rejects.toThrow("Tipo de arquivo não aceito");
    await expect(anx.iniciarEnvioDeAnexo(x.pAluno, { nome: "a.png", mime: "image/png", tamanho: 6 * 1024 * 1024 })).rejects.toThrow("grande demais");
    await expect(anx.iniciarEnvioDeAnexo(x.pAluno, { nome: "a.pdf", mime: "application/pdf", tamanho: 21 * 1024 * 1024 })).rejects.toThrow("grande demais");
    const ok = await anx.iniciarEnvioDeAnexo(x.pAluno, { nome: "foto.jpg", mime: "image/jpeg", tamanho: 1000 });
    expect(ok.envio.url).toContain("/comunidade/");

    const catalogo = await anexoPronto(x.cr.id, x.aluno.usuario.id, "CATALOGO");
    const deOutro = await anexoPronto(x.cr.id, x.dono.usuario.id, "IMAGEM");
    await expect(pub.publicar(x.pAluno, post(x.geral.id, "a", { anexoIds: [catalogo.id] }))).rejects.toThrow("Arquivo inválido");
    await expect(pub.publicar(x.pAluno, post(x.geral.id, "a", { anexoIds: [deOutro.id] }))).rejects.toThrow("Arquivo inválido");
    const cinco = await Promise.all(Array.from({ length: 5 }, () => anexoPronto(x.cr.id, x.aluno.usuario.id, "IMAGEM")));
    await expect(pub.publicar(x.pAluno, post(x.geral.id, "a", { anexoIds: cinco.map((a) => a.id) }))).rejects.toThrow("4 imagens");
    const tresPdf = await Promise.all(Array.from({ length: 3 }, () => anexoPronto(x.cr.id, x.aluno.usuario.id, "PDF")));
    await expect(pub.publicar(x.pAluno, post(x.geral.id, "a", { anexoIds: tresPdf.map((a) => a.id) }))).rejects.toThrow("2 PDFs");

    const { id } = await pub.publicar(x.pAluno, post(x.geral.id, "Com anexos", { anexoIds: [cinco[0].id, tresPdf[0].id] }));
    // O mesmo arquivo não serve a dois posts.
    await expect(pub.publicar(x.pAluno, post(x.geral.id, "b", { anexoIds: [cinco[0].id] }))).rejects.toThrow("Arquivo inválido");
    const r = await con.postDaComunidade(quem(x.cr.id, x.aluno), id);
    expect(r!.post.anexos.map((a) => [a.tipo, a.nome])).toEqual([
      ["IMAGEM", "anexo.png"],
      ["PDF", "anexo.pdf"],
    ]);
    const pdf = r!.post.anexos[1];
    expect(pdf.url).toBeNull();
    expect(await anx.linkDoAnexo(quem(x.cr.id, x.dono), pdf.id)).toContain("anexo.pdf");
    // Remover o post descarta os arquivos.
    await pub.removerPublicacao({ criadorId: x.cr.id, usuarioId: x.aluno.usuario.id, membroId: x.aluno.membro.id, equipe: false }, id, new Date(r!.post.versao));
    expect(await anx.linkDoAnexo(quem(x.cr.id, x.dono), pdf.id)).toBeNull();
    const [arq] = await db.select().from(s.arquivos).where(eq(s.arquivos.id, cinco[0].id));
    expect(arq.is_deleted).toBe(true);
  });

  it("enquete: voto único, troca até encerrar, opção inválida recusada; contagem e meu voto no feed", async () => {
    const x = await cenario();
    const outro = participante(x.cr.id, await membroCom(x.cr.id));
    const { id } = await pub.publicar(x.pDono, post(x.geral.id, "Qual horário?", { enquete: { pergunta: "Melhor horário?", opcoes: ["Manhã", "Noite"], encerraEm: null } }));
    await pub.votarNaEnquete(x.pAluno, id, 0);
    await pub.votarNaEnquete(x.pAluno, id, 1); // troca
    await pub.votarNaEnquete(outro, id, 1);
    await expect(pub.votarNaEnquete(x.pAluno, id, 2)).rejects.toThrow("Opção inválida.");
    const r = await con.postDaComunidade(quem(x.cr.id, x.aluno), id);
    expect(r!.post.enquete).toMatchObject({
      pergunta: "Melhor horário?",
      opcoes: [
        { indice: 0, texto: "Manhã", votos: 0 },
        { indice: 1, texto: "Noite", votos: 2 },
      ],
      totalVotos: 2,
      meuVoto: 1,
      aberta: true,
    });
    await db.update(s.criadores_canais_posts).set({ enquete_encerra_em: new Date(Date.now() - 1000) }).where(eq(s.criadores_canais_posts.id, id));
    await expect(pub.votarNaEnquete(x.pAluno, id, 0)).rejects.toThrow("encerrada");
    const semEnquete = await pub.publicar(x.pDono, post(x.geral.id));
    await expect(pub.votarNaEnquete(x.pAluno, semEnquete.id, 0)).rejects.toThrow("não tem enquete");
    await expect(pub.publicar(x.pDono, post(x.geral.id, "x", { enquete: { pergunta: "?", opcoes: ["a", "b"], encerraEm: new Date(Date.now() - 1) } }))).rejects.toThrow("no futuro");
  });

  it("curtida: toggle, uma por membro, contadores do post e do comentário", async () => {
    const x = await cenario();
    const outro = participante(x.cr.id, await membroCom(x.cr.id));
    const { id } = await pub.publicar(x.pDono, post(x.geral.id));
    expect(await pub.alternarCurtida(x.pAluno, { postId: id })).toEqual({ curtiu: true, curtidas: 1 });
    expect(await pub.alternarCurtida(outro, { postId: id })).toEqual({ curtiu: true, curtidas: 2 });
    expect(await pub.alternarCurtida(x.pAluno, { postId: id })).toEqual({ curtiu: false, curtidas: 1 });
    expect(await pub.alternarCurtida(x.pAluno, { postId: id })).toEqual({ curtiu: true, curtidas: 2 });
    const linhas = await db.select().from(s.criadores_curtidas).where(eq(s.criadores_curtidas.post_id, id));
    expect(linhas).toHaveLength(2); // a mesma linha é reativada
    const c = await com.comentar(x.pAluno, { postId: id }, "Concordo", null);
    expect(await pub.alternarCurtida(x.pDono, { comentarioId: c.id })).toEqual({ curtiu: true, curtidas: 1 });
    const r = await con.postDaComunidade(quem(x.cr.id, x.aluno), id);
    expect(r!.post).toMatchObject({ curtidas: 2, curtiu: true, comentarios: 1 });
    expect(r!.comentarios[0]).toMatchObject({ curtidas: 1, curtiu: false });
  });

  it("feed: Recentes e Mais curtidos, paginados por cursor; total de publicações", async () => {
    const x = await cenario();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await pub.publicar(i % 2 ? x.pAluno : x.pDono, post(x.geral.id, `Post ${i}`))).id);
    await pub.alternarCurtida(x.pAluno, { postId: ids[1] });
    await pub.alternarCurtida(x.pDono, { postId: ids[1] });
    await pub.alternarCurtida(x.pAluno, { postId: ids[3] });
    const q = quem(x.cr.id, x.aluno);
    const p1 = (await con.feedDaComunidade(q, { canalId: x.geral.id, limite: 2 }))!;
    const p2 = (await con.feedDaComunidade(q, { canalId: x.geral.id, limite: 2, cursor: p1.proximoCursor }))!;
    const p3 = (await con.feedDaComunidade(q, { canalId: x.geral.id, limite: 2, cursor: p2.proximoCursor }))!;
    expect([...p1.itens, ...p2.itens, ...p3.itens].map((p) => p.texto)).toEqual(["Post 4", "Post 3", "Post 2", "Post 1", "Post 0"]);
    expect(p3.proximoCursor).toBeNull();
    const c1 = (await con.feedDaComunidade(q, { canalId: x.geral.id, ordem: "CURTIDOS", limite: 2 }))!;
    const c2 = (await con.feedDaComunidade(q, { canalId: x.geral.id, ordem: "CURTIDOS", limite: 10, cursor: c1.proximoCursor }))!;
    expect([...c1.itens, ...c2.itens].map((p) => p.texto)).toEqual(["Post 1", "Post 3", "Post 4", "Post 2", "Post 0"]);
    expect(await con.totalDePublicacoes(q, x.geral.id)).toBe(5);
    // Cursor inválido: volta ao começo (sem erro).
    expect((await con.feedDaComunidade(q, { canalId: x.geral.id, limite: 1, cursor: "lixo" }))!.itens[0].texto).toBe("Post 4");
  });

  it("editar/remover: só o autor edita (trava + editado_em); equipe remove de outro; aluno não", async () => {
    const x = await cenario();
    const outro = participante(x.cr.id, await membroCom(x.cr.id));
    const { id, versao } = await pub.publicar(x.pAluno, post(x.geral.id, "Primeira versão"));
    await expect(pub.editarPublicacao(outro, id, new Date(versao), "invasão")).rejects.toThrow("Registro alterado");
    const v2 = await pub.editarPublicacao(x.pAluno, id, new Date(versao), "Segunda versão");
    await expect(pub.editarPublicacao(x.pAluno, id, new Date(versao), "velha")).rejects.toThrow("Registro alterado");
    const r = await con.postDaComunidade(quem(x.cr.id, x.aluno), id);
    expect(r!.post).toMatchObject({ texto: "Segunda versão", editadoEm: expect.any(Date) });
    await expect(pub.removerPublicacao({ criadorId: x.cr.id, usuarioId: outro.usuarioId, membroId: outro.membroId, equipe: false }, id, new Date(v2.versao))).rejects.toThrow("Registro alterado");
    await pub.removerPublicacao({ criadorId: x.cr.id, usuarioId: x.dono.usuario.id, membroId: x.dono.membro.id, equipe: true }, id, new Date(v2.versao));
    expect(await con.postDaComunidade(quem(x.cr.id, x.dono), id)).toBeNull();
    const trilha = await db.select().from(s.auditoria).where(eq(s.auditoria.registro_id, id));
    expect(trilha.map((t) => t.acao).sort()).toEqual(["atualizar", "criar", "excluir"]);
  });
});

describe("comentários", () => {
  it("1 nível: responder uma resposta pendura no principal; remover o principal leva as respostas e desconta", async () => {
    const x = await cenario();
    const { id } = await pub.publicar(x.pDono, post(x.geral.id));
    const c1 = await com.comentar(x.pAluno, { postId: id }, "Pergunta", null);
    const r1 = await com.comentar(x.pDono, { postId: id }, "Resposta", c1.id);
    const r2 = await com.comentar(x.pAluno, { postId: id }, "Réplica", r1.id);
    const [l2] = await db.select().from(s.criadores_comentarios).where(eq(s.criadores_comentarios.id, r2.id));
    expect(l2.pai_id).toBe(c1.id);
    let r = await con.postDaComunidade(quem(x.cr.id, x.aluno), id);
    expect(r!.comentarios.map((c) => [c.texto, c.respostas.map((y) => y.texto)])).toEqual([["Pergunta", ["Resposta", "Réplica"]]]);
    expect(r!.post.comentarios).toBe(3);
    // Pai de outro post: recusado.
    const outroPost = await pub.publicar(x.pDono, post(x.geral.id, "Outro"));
    await expect(com.comentar(x.pAluno, { postId: outroPost.id }, "x", c1.id)).rejects.toThrow("Comentário não encontrado.");
    await com.removerComentario({ criadorId: x.cr.id, usuarioId: x.aluno.usuario.id, membroId: x.aluno.membro.id, equipe: false }, c1.id, new Date(c1.versao));
    r = await con.postDaComunidade(quem(x.cr.id, x.aluno), id);
    expect(r!.comentarios).toEqual([]);
    expect(r!.post.comentarios).toBe(0);
  });

  it("comentários da aula: só quem pode assistir lê e comenta", async () => {
    const x = await cenario();
    const aula = x.curso.aulas[0];
    const semMatricula = participante(x.cr.id, await membroCom(x.cr.id));
    await expect(com.comentar(x.pAluno, { aulaId: aula.id }, "Oi", null)).rejects.toThrow("Aula não encontrada.");
    expect(await con.comentariosDaAula(quem(x.cr.id, x.aluno), aula.id)).toBeNull();
    await matricular(x.cr.id, x.aluno.membro.id, x.curso.produto.id);
    const c = await com.comentar(x.pAluno, { aulaId: aula.id }, "Ótima aula", null);
    await com.comentar(x.pDono, { aulaId: aula.id }, "Obrigado!", c.id);
    const lista = await con.comentariosDaAula(quem(x.cr.id, x.aluno), aula.id);
    expect(lista!.map((y) => [y.texto, y.respostas.map((z) => z.texto)])).toEqual([["Ótima aula", ["Obrigado!"]]]);
    expect(await con.comentariosDaAula(quem(x.cr.id, { usuario: { id: semMatricula.usuarioId }, membro: { id: semMatricula.membroId, papel: "ALUNO" } }), aula.id)).toBeNull();
    await expect(pub.alternarCurtida(semMatricula, { comentarioId: c.id })).rejects.toThrow("Comentário não encontrado.");
  });
});

describe("aulas para relacionar ('em <aula>')", () => {
  it("aluno: só aulas com progresso que ainda pode assistir; equipe: as visíveis; publicar recusa aula fora do alcance; A×B", async () => {
    const x = await cenario();
    const outro = await cursoPronto(x.cr.id, { aulas: 1 });
    await matricular(x.cr.id, x.aluno.membro.id, x.curso.produto.id);
    const exp = await matricular(x.cr.id, x.aluno.membro.id, outro.produto.id);
    await concluirAulas(x.cr.id, x.aluno, [x.curso.aulas[0], outro.aulas[0]]);
    // A matrícula do outro curso expira: a aula dele sai da lista.
    await db.update(s.produtos_matriculas).set({ expira_em: new Date(Date.now() - 1000) }).where(eq(s.produtos_matriculas.id, exp.id));
    const q = quem(x.cr.id, x.aluno);
    expect(await con.aulasParaRelacionar(q)).toEqual([{ id: x.curso.aulas[0].id, titulo: "Aula 1", produtoTitulo: x.curso.produto.titulo }]);
    expect((await con.aulasParaRelacionar(quem(x.cr.id, x.dono))).map((a) => a.id)).toEqual(expect.arrayContaining([x.curso.aulas[0].id, x.curso.aulas[1].id, outro.aulas[0].id]));
    // Publicar com aula que não pode assistir (matrícula expirada) é recusado; com a liberada, vale.
    await expect(pub.publicar(x.pAluno, post(x.geral.id, "x", { aulaId: outro.aulas[0].id }))).rejects.toThrow("Aula não encontrada.");
    const ok = await pub.publicar(x.pAluno, post(x.geral.id, "Sobre a aula", { aulaId: x.curso.aulas[0].id }));
    expect((await con.postDaComunidade(q, ok.id))!.post.aula).toEqual({ id: x.curso.aulas[0].id, titulo: "Aula 1" });
    // Outro criador: nada de A aparece, e aula de A no post de B é recusada.
    const b = await cenario();
    expect(await con.aulasParaRelacionar(quem(b.cr.id, b.dono))).toEqual(expect.not.arrayContaining([expect.objectContaining({ id: x.curso.aulas[0].id })]));
    expect(await con.aulasParaRelacionar(quem(b.cr.id, b.aluno))).toEqual([]);
    await expect(pub.publicar(b.pDono, post(b.geral.id, "x", { aulaId: x.curso.aulas[0].id }))).rejects.toThrow("Aula não encontrada.");
  });
});

describe("isolamento A×B", () => {
  it("membro de B não vê, não comenta, não curte, não vota nem denuncia em A; FK composta recusa mistura", async () => {
    const a = await cenario();
    const b = await cenario();
    const { id } = await pub.publicar(a.pAluno, post(a.geral.id, "De A"));
    const deB = { ...b.pAluno, criadorId: b.cr.id };
    expect(await con.feedDaComunidade(quem(b.cr.id, b.aluno), { canalId: a.geral.id })).toBeNull();
    expect(await con.postDaComunidade(quem(b.cr.id, b.aluno), id)).toBeNull();
    await expect(pub.alternarCurtida(deB, { postId: id })).rejects.toThrow("Publicação não encontrada.");
    await expect(com.comentar(deB, { postId: id }, "x", null)).rejects.toThrow("Publicação não encontrada.");
    await expect(pub.votarNaEnquete(deB, id, 0)).rejects.toThrow("Publicação não encontrada.");
    await expect(mod.denunciar(deB, { postId: id }, "spam")).rejects.toThrow("Publicação não encontrada.");
    await expect(pub.publicar(deB, post(a.geral.id))).rejects.toThrow("Canal não encontrado.");
    const m = { criadorId: b.cr.id, usuarioId: b.dono.usuario.id, membroId: b.dono.membro.id, nome: "Dono B" };
    await expect(mod.fixarPublicacao(m, id, new Date(), true)).rejects.toThrow("Registro alterado");
    // O banco recusa post de A no canal de B mesmo que o serviço errasse.
    await expect(
      db.insert(s.criadores_canais_posts).values({ criador_id: a.cr.id, canal_id: b.geral.id, autor_membro_id: a.aluno.membro.id, texto: "x", modified_by: a.cr.id }),
    ).rejects.toThrow();
  });
});
