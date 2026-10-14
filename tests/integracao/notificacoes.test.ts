/**
 * Notificações (passo 8, RN-134) no PostgreSQL real: geradas nos eventos certos (comentário,
 * resposta, curtidas agregadas, aviso, fixado, aula nova, certificado, matrícula, denúncia), nunca
 * para quem causou, depois do commit e sem derrubar a ação; contador, lista paginada, marcar lidas,
 * retenção e a rota `GET /api/notificacoes/contagem` (401, isolamento, no-store).
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador } from "./_apoio";
import { ok } from "./_catalogo";
import { canal, grupoCom, notificacoesDe, participante } from "./_comunidade";
import { concluirAulas } from "./_passo7";
import { alunoMatriculado, cursoPronto, matricular, membroCom } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let can: typeof import("@/lib/comunidade/canais");
let pub: typeof import("@/lib/comunidade/publicacoes");
let com: typeof import("@/lib/comunidade/comentarios");
let mod: typeof import("@/lib/comunidade/moderacao");
let ger: typeof import("@/lib/notificacoes/gerar");
let con: typeof import("@/lib/notificacoes/consultas");
let rota: typeof import("@/lib/notificacoes/rota");
let acoesNot: typeof import("@/lib/actions/notificacoes");
let acoesMat: typeof import("@/lib/actions/matriculas");
let video: typeof import("@/lib/video/registro");
let em: typeof import("@/lib/certificados/emissao");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  can = await import("@/lib/comunidade/canais");
  pub = await import("@/lib/comunidade/publicacoes");
  com = await import("@/lib/comunidade/comentarios");
  mod = await import("@/lib/comunidade/moderacao");
  ger = await import("@/lib/notificacoes/gerar");
  con = await import("@/lib/notificacoes/consultas");
  rota = await import("@/lib/notificacoes/rota");
  acoesNot = await import("@/lib/actions/notificacoes");
  acoesMat = await import("@/lib/actions/matriculas");
  video = await import("@/lib/video/registro");
  em = await import("@/lib/certificados/emissao");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const post = (canalId: string, texto = "Olá!") => ({ canalId, texto, aulaId: null, anexoIds: [], enquete: null });
const tipos = async (membroId: string) => (await notificacoesDe(membroId)).map((n) => n.tipo).sort();

async function cenario() {
  const cr = await novoCriador();
  await can.garantirCanalGeral(db, cr.id, cr.id);
  const [geral] = await db.select().from(s.criadores_canais).where(and(eq(s.criadores_canais.criador_id, cr.id), eq(s.criadores_canais.padrao, true)));
  const dono = await membroCom(cr.id, "DONO");
  const ana = await membroCom(cr.id, "ALUNO");
  const bia = await membroCom(cr.id, "ALUNO");
  const caio = await membroCom(cr.id, "ALUNO");
  await db.update(s.usuarios).set({ nome: "Ana Souza" }).where(eq(s.usuarios.id, ana.usuario.id));
  return { cr, geral, dono, ana, bia, caio, p: { dono: participante(cr.id, dono), ana: { ...participante(cr.id, ana), nome: "Ana Souza" }, bia: participante(cr.id, bia), caio: participante(cr.id, caio) } };
}

describe("geração nos eventos da comunidade", () => {
  it("comentário no meu post e resposta ao meu comentário; nada para o próprio autor", async () => {
    const x = await cenario();
    const { id } = await pub.publicar(x.p.bia, post(x.geral.id));
    await com.comentar(x.p.bia, { postId: id }, "Eu mesma", null); // própria: nada
    const c = await com.comentar(x.p.ana, { postId: id }, "Boa!", null);
    await com.comentar(x.p.caio, { postId: id }, "Concordo com a Ana", c.id);
    expect(await tipos(x.bia.membro.id)).toEqual(["COMENTARIO_NO_POST", "COMENTARIO_NO_POST"]);
    expect(await tipos(x.ana.membro.id)).toEqual(["RESPOSTA_AO_COMENTARIO"]);
    expect(await tipos(x.caio.membro.id)).toEqual([]);
    const [primeira] = (await con.notificacoesDoMembro(x.cr.id, x.ana.membro.id)).itens;
    expect(primeira).toMatchObject({ tipo: "RESPOSTA_AO_COMENTARIO", texto: "Pessoa respondeu ao seu comentário.", href: `/comunidade?post=${id}`, lida: false });
    // Sem dado sensível no payload: só ids e o primeiro nome.
    const [bruta] = await notificacoesDe(x.ana.membro.id);
    expect(Object.keys(bruta.dados).sort()).toEqual(["atorNome", "comentarioId", "postId"]);
  });

  it("curtidas agregadas: uma por post por dia, 'Ana e mais 2', sem contar de novo quem já curtiu; volta a não lida", async () => {
    const x = await cenario();
    const { id } = await pub.publicar(x.p.dono, post(x.geral.id));
    await pub.alternarCurtida(x.p.bia, { postId: id });
    await pub.alternarCurtida(x.p.caio, { postId: id });
    await con.marcarLidas({ criadorId: x.cr.id, membroId: x.dono.membro.id, usuarioId: x.dono.usuario.id }, "todas");
    await pub.alternarCurtida(x.p.ana, { postId: id });
    await pub.alternarCurtida(x.p.ana, { postId: id }); // descurtiu
    await pub.alternarCurtida(x.p.ana, { postId: id }); // curtiu de novo: não soma
    await pub.alternarCurtida(x.p.dono, { postId: id }); // o próprio autor: nada
    const lista = await notificacoesDe(x.dono.membro.id);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ tipo: "CURTIDAS_NO_POST", total: 3, lida_em: null });
    expect((await con.notificacoesDoMembro(x.cr.id, x.dono.membro.id)).itens[0].texto).toBe("Ana e mais 2 curtiram sua publicação.");
    expect(await con.contarNaoLidas(x.cr.id, x.dono.membro.id)).toBe(1);
  });

  it("aviso no canal de avisos e post fixado: para quem vê o canal, menos o autor", async () => {
    const x = await cenario();
    const g = await grupoCom(x.cr.id, [x.ana.membro.id]);
    const avisos = await canal(x.cr.id, { nome: "Avisos da turma", acesso: "GRUPO", grupoId: g.id, quemPosta: "EQUIPE" });
    const admin = await membroCom(x.cr.id, "ADMIN");
    const a = await pub.publicar(x.p.dono, post(avisos.id, "Encontro amanhã"));
    expect(await tipos(x.ana.membro.id)).toEqual(["AVISO"]);
    expect(await tipos(x.bia.membro.id)).toEqual([]); // fora do grupo
    expect(await tipos(admin.membro.id)).toEqual(["AVISO"]); // equipe vê todos os canais
    expect(await tipos(x.dono.membro.id)).toEqual([]);
    expect((await con.notificacoesDoMembro(x.cr.id, x.ana.membro.id)).itens[0].texto).toBe("Pessoa publicou um aviso em #Avisos da turma.");
    const m = { criadorId: x.cr.id, usuarioId: x.dono.usuario.id, membroId: x.dono.membro.id, nome: "Dono" };
    const v = await mod.fixarPublicacao(m, a.id, new Date(a.versao), true);
    const v2 = await mod.fixarPublicacao(m, a.id, new Date(v.versao), false);
    await mod.fixarPublicacao(m, a.id, new Date(v2.versao), true); // fixar de novo: não duplica
    expect(await tipos(x.ana.membro.id)).toEqual(["AVISO", "POST_FIXADO"]);
  });

  it("denúncia nova: só a equipe é notificada", async () => {
    const x = await cenario();
    const admin = await membroCom(x.cr.id, "ADMIN");
    const { id } = await pub.publicar(x.p.bia, post(x.geral.id));
    await mod.denunciar(x.p.ana, { postId: id }, "Spam");
    expect(await tipos(admin.membro.id)).toEqual(["DENUNCIA_NOVA"]);
    expect(await tipos(x.dono.membro.id)).toEqual(["DENUNCIA_NOVA"]);
    expect(await tipos(x.bia.membro.id)).toEqual([]);
    expect(await tipos(x.ana.membro.id)).toEqual([]);
  });

  it("falha ao gerar não derruba nada: vira log", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(ger.notificarComentario("nao-e-uuid", "x", { usuarioId: "x", membroId: "x", nome: "x" })).resolves.toBeUndefined();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});

describe("geração nos eventos que já existiam", () => {
  it("aula nova quando o vídeo fica PRONTO: só matriculados; idempotente; curso em rascunho não notifica", async () => {
    const cr = await novoCriador();
    const curso = await cursoPronto(cr.id, { aulas: 1 });
    const matriculado = await alunoMatriculado(cr.id, curso.produto.id);
    const fora = await membroCom(cr.id, "ALUNO");
    const dono = await membroCom(cr.id, "DONO");
    const aula = curso.aulas[0];
    const pronto = async () => {
      const id = randomUUID();
      await db.update(s.produtos_modulos_aulas_videos).set({ is_deleted: true }).where(eq(s.produtos_modulos_aulas_videos.aula_id, aula.id));
      await db.insert(s.produtos_modulos_aulas_videos).values({
        id,
        criador_id: cr.id,
        aula_id: aula.id,
        situacao: "PROCESSANDO",
        nome_original: "aula.mp4",
        mime: "video/mp4",
        tamanho_bytes: 10,
        chave_origem: `criadores/${cr.id}/videos/${id}/original.mp4`,
        chave_cifrada: "x",
        modified_by: dono.usuario.id,
      });
      await video.aplicarEvento({ tipo: "video.processando", videoId: id, tentativa: 1 });
      const prefixo = `criadores/${cr.id}/videos/${id}`;
      return video.aplicarEvento({ tipo: "video.pronto", videoId: id, tentativa: 1, duracaoSeg: 100, resolucoes: ["720p"], prefixoHls: prefixo, thumbChave: `${prefixo}/thumb.jpg`, cpuSeg: null, log: "" });
    };
    expect(await pronto()).toBe(true);
    expect(await pronto()).toBe(true); // trocou o vídeo: não notifica de novo
    expect(await tipos(matriculado.membro.id)).toEqual(["AULA_NOVA"]);
    expect(await tipos(fora.membro.id)).toEqual([]);
    expect(await tipos(dono.membro.id)).toEqual([]);
    expect((await con.notificacoesDoMembro(cr.id, matriculado.membro.id)).itens[0]).toMatchObject({ texto: `Nova aula em "${curso.produto.titulo}": "Aula 1".`, href: `/aula/${aula.id}` });

    const rascunho = await cursoPronto(cr.id, { aulas: 1, status: "RASCUNHO" });
    await matricular(cr.id, fora.membro.id, rascunho.produto.id);
    await ger.notificarAulaNova(cr.id, rascunho.aulas[0].id, dono.usuario.id);
    expect(await tipos(fora.membro.id)).toEqual([]);
  });

  it("certificado emitido e matrícula nova (pela action) notificam a pessoa", async () => {
    const cr = await novoCriador();
    const curso = await cursoPronto(cr.id, { aulas: 1 });
    const aluno = await alunoMatriculado(cr.id, curso.produto.id);
    await concluirAulas(cr.id, aluno, curso.aulas);
    await em.emitir(cr.id, aluno.membro.id, curso.produto.id);
    expect(await tipos(aluno.membro.id)).toEqual(["CERTIFICADO_EMITIDO"]);

    const admin = await membroCom(cr.id, "ADMIN");
    const outro = await cursoPronto(cr.id, { aulas: 1 });
    req.h = await cabecalhosLogados(admin.usuario.email, cr.slug);
    ok(await acoesMat.acaoMatricular({ membroIds: [aluno.membro.id, admin.membro.id], produtoIds: [outro.produto.id] }));
    ok(await acoesMat.acaoMatricular({ membroIds: [aluno.membro.id], produtoIds: [outro.produto.id] })); // já existia: nada
    expect(await tipos(aluno.membro.id)).toEqual(["CERTIFICADO_EMITIDO", "MATRICULA_NOVA"]);
    expect(await tipos(admin.membro.id)).toEqual([]); // matriculou a si mesmo: nada
    const itens = (await con.notificacoesDoMembro(cr.id, aluno.membro.id)).itens;
    expect(itens.find((n) => n.tipo === "MATRICULA_NOVA")).toMatchObject({ href: `/cursos/${outro.produto.slug}` });
  });
});

describe("leitura, marcação, retenção e rota", () => {
  it("lista paginada, contador, marcar lidas (só as minhas), retenção arquiva", async () => {
    const x = await cenario();
    const { id } = await pub.publicar(x.p.bia, post(x.geral.id));
    for (let i = 0; i < 5; i++) await com.comentar(x.p.ana, { postId: id }, `c${i}`, null);
    const p1 = await con.notificacoesDoMembro(x.cr.id, x.bia.membro.id, { limite: 3 });
    const p2 = await con.notificacoesDoMembro(x.cr.id, x.bia.membro.id, { limite: 3, cursor: p1.proximoCursor });
    expect(p1.itens).toHaveLength(3);
    expect(p2.itens).toHaveLength(2);
    expect(p2.proximoCursor).toBeNull();
    expect(new Set([...p1.itens, ...p2.itens].map((n) => n.id)).size).toBe(5);
    expect(await con.contarNaoLidas(x.cr.id, x.bia.membro.id)).toBe(5);
    // Marcar ids de outra pessoa não faz nada.
    expect(await con.marcarLidas({ criadorId: x.cr.id, membroId: x.ana.membro.id, usuarioId: x.ana.usuario.id }, [p1.itens[0].id])).toBe(0);
    expect(await con.marcarLidas({ criadorId: x.cr.id, membroId: x.bia.membro.id, usuarioId: x.bia.usuario.id }, [p1.itens[0].id])).toBe(1);
    expect(await con.contarNaoLidas(x.cr.id, x.bia.membro.id)).toBe(4);
    // Retenção: a mais antiga (> 90 dias) some da lista e do contador, e o arquivamento a marca.
    await db.update(s.criadores_membros_notificacoes).set({ evento_em: new Date(Date.now() - 91 * 86_400_000) }).where(eq(s.criadores_membros_notificacoes.id, p2.itens[1].id));
    expect(await con.contarNaoLidas(x.cr.id, x.bia.membro.id)).toBe(3);
    expect(await ger.arquivarNotificacoesAntigas()).toBeGreaterThanOrEqual(1);
    const [arq] = await db.select().from(s.criadores_membros_notificacoes).where(eq(s.criadores_membros_notificacoes.id, p2.itens[1].id));
    expect(arq.arquivada_em).not.toBeNull();
    req.h = await cabecalhosLogados(x.bia.usuario.email, x.cr.slug);
    expect(ok(await acoesNot.acaoMarcarNotificacoesLidas({ todas: true }))).toEqual({ marcadas: 3 });
    expect(await con.contarNaoLidas(x.cr.id, x.bia.membro.id)).toBe(0);
  });

  it("GET /api/notificacoes/contagem: 401 sem sessão e com sessão de outro host; conta só as minhas; no-store", async () => {
    const a = await cenario();
    const b = await cenario();
    const { id } = await pub.publicar(a.p.bia, post(a.geral.id));
    await com.comentar(a.p.ana, { postId: id }, "oi", null);
    await com.comentar(a.p.caio, { postId: id }, "oi", null);
    const pedido = (h: Headers) => new Request(`http://${h.get("host")}/api/notificacoes/contagem`, { headers: h });
    const hBia = await cabecalhosLogados(a.bia.usuario.email, a.cr.slug);
    const r = await rota.atenderContagem(pedido(hBia));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ naoLidas: 2 });

    const semCookie = new Headers(hBia);
    semCookie.delete("cookie");
    expect((await rota.atenderContagem(pedido(semCookie))).status).toBe(401);
    // O cookie de A no host de B não vale.
    const noHostDeB = new Headers(hBia);
    noHostDeB.set("host", `${b.cr.slug}.localhost:3011`);
    expect((await rota.atenderContagem(pedido(noHostDeB))).status).toBe(401);
    // Ana (de A) só vê as dela (nenhuma).
    const hAna = await cabecalhosLogados(a.ana.usuario.email, a.cr.slug);
    expect(await (await rota.atenderContagem(pedido(hAna))).json()).toEqual({ naoLidas: 0 });
  });

  it("o polling do sino NÃO renova o uso da sessão: aba esquecida aberta expira por inatividade", async () => {
    const a = await cenario();
    const h = await cabecalhosLogados(a.bia.usuario.email, a.cr.slug);
    const pedido = new Request(`http://${h.get("host")}/api/notificacoes/contagem`, { headers: h });
    const [sessao] = await db
      .select({ id: s.usuarios_sessoes.id })
      .from(s.usuarios_sessoes)
      .where(eq(s.usuarios_sessoes.usuario_id, a.bia.usuario.id));
    const ociosaHa = (min: number) =>
      db.update(s.usuarios_sessoes).set({ updated_at: new Date(Date.now() - min * 60_000) }).where(eq(s.usuarios_sessoes.id, sessao.id));
    const ultimoUso = async () =>
      (await db.select({ u: s.usuarios_sessoes.updated_at }).from(s.usuarios_sessoes).where(eq(s.usuarios_sessoes.id, sessao.id)))[0].u.getTime();

    await ociosaHa(30);
    const antes = await ultimoUso();
    expect((await rota.atenderContagem(pedido)).status).toBe(200);
    expect(await ultimoUso()).toBe(antes); // a contagem leu, mas não carimbou o uso

    await ociosaHa(61);
    expect((await rota.atenderContagem(pedido)).status).toBe(401); // passou de 1 h ociosa: expira mesmo com o sino batendo
  });
});
