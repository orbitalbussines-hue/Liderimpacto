/**
 * Fase 3 (ADR-0020, RN-220 a RN-223, RN-227) no PostgreSQL real + Redis — campanhas: segmentação e
 * contagem, isolamento A×B, início idempotente, envio pelo provedor FALSO (nada sai de verdade),
 * cabeçalhos List-Unsubscribe, teto adiando, abertura/clique assinados (sem redirect aberto),
 * descadastro sem login (GET confirma, POST efetiva) e cancelamento.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novoCriador } from "./_apoio";
import { conteudo, grupoCom, hostDe, provedorFalso, tagCom } from "./_marketing";
import { cursoPronto, matricular, membroCom } from "./_progresso";

let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let camp: typeof import("@/lib/marketing/campanhas");
let envio: typeof import("@/lib/marketing/envio");
let publico: typeof import("@/lib/marketing/publico");
let rotas: typeof import("@/lib/marketing/rotas");
let tokens: typeof import("@/lib/marketing/tokens");
let provedor: typeof import("@/lib/marketing/provedor");
let consultas: typeof import("@/lib/marketing/consultas");
let descadastro: typeof import("@/lib/marketing/descadastro");

beforeAll(async () => {
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  camp = await import("@/lib/marketing/campanhas");
  envio = await import("@/lib/marketing/envio");
  publico = await import("@/lib/marketing/publico");
  rotas = await import("@/lib/marketing/rotas");
  tokens = await import("@/lib/marketing/tokens");
  provedor = await import("@/lib/marketing/provedor");
  consultas = await import("@/lib/marketing/consultas");
  descadastro = await import("@/lib/marketing/descadastro");
});

afterAll(async () => {
  provedor.usarProvedorEmail(provedor.provedorSmtp);
});

const TODOS = { grupoIds: [], tagIds: [], produtoIds: [], nuncaAcessou: false };
const semTeto = { espera: async () => 0 };
const envioDe = async (campanhaId: string, membroId: string) =>
  (await db.select().from(s.criadores_emails_envios).where(and(eq(s.criadores_emails_envios.campanha_id, campanhaId), eq(s.criadores_emails_envios.membro_id, membroId))))[0];

async function cenario() {
  const A = await novoCriador("Área A");
  const B = await novoCriador("Área B");
  const dono = await membroCom(A.id, "DONO");
  const ana = await membroCom(A.id);
  const beto = await membroCom(A.id);
  const admin = await membroCom(A.id, "ADMIN");
  const inativo = await membroCom(A.id);
  await db.update(s.criadores_membros).set({ status: "INATIVO" }).where(eq(s.criadores_membros.id, inativo.membro.id));
  const deB = await membroCom(B.id);
  await db.update(s.criadores_membros).set({ ultimo_acesso_em: new Date() }).where(eq(s.criadores_membros.id, ana.membro.id));
  const { produto } = await cursoPronto(A.id, { aulas: 1 });
  await matricular(A.id, ana.membro.id, produto.id);
  const grupo = await grupoCom(A.id, [ana.membro.id, admin.membro.id]);
  const tag = await tagCom(A.id, [beto.membro.id]);
  return { A, B, dono, ana, beto, admin, deB, produto, grupo, tag };
}

async function campanhaIniciada(criadorId: string, autor: string, p = TODOS) {
  const c = await db.transaction((tx) => camp.criarCampanha(tx, { criadorId, autor, nome: "Novidades", conteudo: conteudo(), publico: p }));
  await db.transaction((tx) => camp.agendarCampanha(tx, { criadorId, autor, campanhaId: c.id, versao: c.versao, quando: null }));
  const r = await camp.iniciarCampanha(c.id);
  if (r.r !== "iniciada") throw new Error(`campanha não iniciou: ${r.r}`);
  return { campanhaId: c.id, envioIds: r.envioIds };
}

describe("público e contagem", () => {
  it("só ALUNO ativo do criador; E entre critérios, OU dentro; ids de outro criador recusados", async () => {
    const { A, B, ana, beto, produto, grupo, tag, deB } = await cenario();
    expect(await publico.contarPublico(A.id, TODOS)).toEqual({ total: 2, descadastrados: 0, receberao: 2, membros: 2, leads: 0 });
    expect((await publico.pessoasDoPublico(A.id, { ...TODOS, grupoIds: [grupo.id] })).map((p) => p.membroId)).toEqual([ana.membro.id]);
    expect((await publico.pessoasDoPublico(A.id, { ...TODOS, tagIds: [tag.id] })).map((p) => p.membroId)).toEqual([beto.membro.id]);
    expect((await publico.pessoasDoPublico(A.id, { ...TODOS, produtoIds: [produto.id] })).map((p) => p.membroId)).toEqual([ana.membro.id]);
    expect((await publico.pessoasDoPublico(A.id, { ...TODOS, nuncaAcessou: true })).map((p) => p.membroId)).toEqual([beto.membro.id]);
    expect(await publico.pessoasDoPublico(A.id, { ...TODOS, grupoIds: [grupo.id], nuncaAcessou: true })).toEqual([]);
    expect((await publico.pessoasDoPublico(B.id, TODOS)).map((p) => p.membroId)).toEqual([deB.membro.id]);
    await expect(publico.contarPublico(B.id, { ...TODOS, grupoIds: [grupo.id] })).rejects.toThrow("Grupo não encontrado");
    await expect(publico.contarPublico(B.id, { ...TODOS, produtoIds: [produto.id] })).rejects.toThrow("Curso não encontrado");

    // Descadastrado sai da contagem de quem recebe.
    await descadastro.descadastrar(A.id, (await import("@/lib/email/disparos")).hashDoDestinatario(beto.usuario.email), "LINK");
    expect(await publico.contarPublico(A.id, TODOS)).toEqual({ total: 2, descadastrados: 1, receberao: 1, membros: 1, leads: 0 });
  });
});

describe("envio da campanha", () => {
  it("inicia idempotente, descadastrado fica IGNORADO, envia com List-Unsubscribe, reprocessar não duplica e conclui", async () => {
    const falso = provedorFalso();
    const { A, dono, ana, beto } = await cenario();
    await descadastro.descadastrar(A.id, (await import("@/lib/email/disparos")).hashDoDestinatario(beto.usuario.email), "UM_CLIQUE");
    const { campanhaId, envioIds } = await campanhaIniciada(A.id, dono.usuario.id);
    expect(envioIds).toHaveLength(1);
    expect((await envioDe(campanhaId, beto.membro.id)).situacao).toBe("IGNORADO");
    // Rodar o início de novo não cria outro envio.
    expect(await camp.iniciarCampanha(campanhaId)).toEqual({ r: "ignorada" });

    expect(await envio.processarEnvio(envioIds[0], 1, 5, semTeto)).toEqual({ r: "enviado" });
    expect(await envio.processarEnvio(envioIds[0], 2, 5, semTeto)).toEqual({ r: "ignorado", motivo: null });
    const [msg] = falso.para(ana.usuario.email);
    expect(falso.para(ana.usuario.email)).toHaveLength(1);
    expect(falso.para(beto.usuario.email)).toHaveLength(0);
    expect(msg.tipo).toBe("CAMPANHA");
    expect(msg.cabecalhos?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(msg.cabecalhos?.["List-Unsubscribe"]).toMatch(new RegExp(`^<http://${A.slug}\\.localhost:3011/api/email/descadastro\\?t=[0-9a-f]{64}\\.`));
    expect(msg.html).toContain(`http://${A.slug}.localhost:3011/api/email/clique?e=${envioIds[0]}`);
    expect(msg.html).toContain("/api/email/abertura?e=");

    const lista = await consultas.listarCampanhas(A.id);
    expect(lista[0]).toMatchObject({ id: campanhaId, situacao: "CONCLUIDA", total: 2, enviados: 1, ignorados: 1, pendentes: 0 });
    const dest = await consultas.destinatariosDaCampanha(A.id, campanhaId, { pagina: 1, porPagina: 10 });
    expect(dest?.total).toBe(2);
    expect(await consultas.destinatariosDaCampanha((await novoCriador()).id, campanhaId, { pagina: 1, porPagina: 10 })).toBeNull();
    // Registro de disparos com o tipo novo, sem o endereço em claro.
    const disparos = await db.select().from(s.emails_disparos).where(and(eq(s.emails_disparos.criador_id, A.id), eq(s.emails_disparos.tipo, "CAMPANHA")));
    expect(disparos).toHaveLength(1);
    expect(JSON.stringify(disparos)).not.toContain(ana.usuario.email);
  });

  it("teto atingido = adiado (nada sai, continua PENDENTE); a janela deslizante conta os disparos", async () => {
    const falso = provedorFalso();
    const { A, dono, ana } = await cenario();
    const { campanhaId, envioIds } = await campanhaIniciada(A.id, dono.usuario.id, { ...TODOS, nuncaAcessou: false });
    const r = await envio.processarEnvio(envioIds[0], 1, 5, { espera: async () => 60_000 });
    expect(r).toEqual({ r: "adiado", esperaMs: 60_000 });
    expect(falso.enviados).toHaveLength(0);
    expect((await envioDe(campanhaId, ana.membro.id)).situacao).toBe("PENDENTE");

    // Janela num instante só desta execução (futuro, aleatório): 3 disparos há 10 min com teto 3/h = espera ~50 min.
    const agora = new Date(Date.UTC(2101 + Math.floor(Math.random() * 500), 0, 1, 12));
    const linhas = [1, 2, 3].map((i) => ({ tipo: "CAMPANHA" as const, destinatario_mascarado: "x***@y***.com", destinatario_hash: "0".repeat(64), assunto: "t", situacao: "ENVIADO" as const, created_at: new Date(agora.getTime() - 10 * 60_000 - i) }));
    await db.insert(s.emails_disparos).values(linhas);
    const espera = await provedor.esperaParaEnviar(agora, { hora: 3, dia: 1000 });
    expect(espera).toBeGreaterThan(49 * 60_000);
    expect(espera).toBeLessThanOrEqual(50 * 60_000);
    expect(await provedor.esperaParaEnviar(agora, { hora: 4, dia: 1000 })).toBe(0);
    expect(await provedor.esperaParaEnviar(agora, { hora: 100, dia: 2 })).toBeGreaterThan(23 * 3_600_000);
  });

  it("falha do provedor: tenta de novo e na última vira FALHOU", async () => {
    const falso = provedorFalso();
    const { A, dono, ana } = await cenario();
    const { campanhaId, envioIds } = await campanhaIniciada(A.id, dono.usuario.id);
    falso.falharCom = "ETIMEDOUT";
    await expect(envio.processarEnvio(envioIds[0], 1, 2, semTeto)).rejects.toThrow("ETIMEDOUT");
    expect((await envioDe(campanhaId, ana.membro.id)).situacao).toBe("PENDENTE");
    await expect(envio.processarEnvio(envioIds[0], 2, 2, semTeto)).rejects.toThrow("ETIMEDOUT");
    expect(await envioDe(campanhaId, ana.membro.id)).toMatchObject({ situacao: "FALHOU", tentativas: 2, motivo: "ETIMEDOUT" });
  });
});

describe("abertura, clique e descadastro", () => {
  it("pixel e clique só com assinatura válida e no host da área; redirect só para a URL assinada", async () => {
    provedorFalso();
    const { A, B, dono, ana } = await cenario();
    const { campanhaId, envioIds } = await campanhaIniciada(A.id, dono.usuario.id);
    const id = envioIds[0];
    await envio.processarEnvio(id, 1, 5, semTeto);
    const base = `http://${A.slug}.localhost:3011`;
    const req = (caminho: string, h = hostDe(A.slug)) => new Request(`${base}${caminho}`, { headers: h });

    // Assinatura errada: devolve o GIF e não conta.
    expect((await rotas.atenderAbertura(req(`/api/email/abertura?e=${id}&s=errada`))).status).toBe(200);
    expect((await envioDe(campanhaId, ana.membro.id)).aberturas).toBe(0);
    await rotas.atenderAbertura(req(`/api/email/abertura?e=${id}&s=${tokens.assinaturaAbertura(id)}`));
    // No host de B, o envio de A não conta.
    await rotas.atenderAbertura(req(`/api/email/abertura?e=${id}&s=${tokens.assinaturaAbertura(id)}`, hostDe(B.slug)));
    expect((await envioDe(campanhaId, ana.membro.id)).aberturas).toBe(1);

    const url = "https://exemplo.com/aula-nova";
    const ok = await rotas.atenderClique(req(`/api/email/clique?e=${id}&u=${encodeURIComponent(url)}&s=${tokens.assinaturaClique(id, url)}`));
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toBe(url);
    // URL trocada (open redirect) com a assinatura de outra: 404.
    const outra = await rotas.atenderClique(req(`/api/email/clique?e=${id}&u=${encodeURIComponent("https://malicioso.exemplo")}&s=${tokens.assinaturaClique(id, url)}`));
    expect(outra.status).toBe(404);
    // Assinatura de um envio não serve para outro.
    expect((await rotas.atenderClique(req(`/api/email/clique?e=${crypto.randomUUID()}&u=${encodeURIComponent(url)}&s=${tokens.assinaturaClique(id, url)}`))).status).toBe(404);
    expect((await rotas.atenderClique(req(`/api/email/clique?e=${id}&u=${encodeURIComponent(url)}&s=${tokens.assinaturaClique(id, url)}`, hostDe(B.slug)))).status).toBe(404);
    const depois = await envioDe(campanhaId, ana.membro.id);
    expect(depois).toMatchObject({ cliques: 1, aberturas: 1 });
    expect(depois.clicado_em).toBeInstanceOf(Date);
    expect((await consultas.campanhaDoCriador(A.id, campanhaId))).toMatchObject({ aberturas: 1, cliques: 1, taxaAbertura: 100, taxaClique: 100 });
  });

  it("descadastro: GET só confirma, POST um-clique efetiva, token adulterado ou de outra área recusado; transacional continua", async () => {
    const falso = provedorFalso();
    const { A, B, dono, ana } = await cenario();
    const token = tokens.tokenDescadastro(A.id, ana.usuario.email);
    const url = `http://${A.slug}.localhost:3011/api/email/descadastro?t=${token}`;
    const get = await rotas.atenderDescadastro(new Request(url, { headers: hostDe(A.slug) }));
    expect(get.status).toBe(200);
    expect(await get.text()).toContain("Confirmar descadastro");
    expect(await descadastro.estaDescadastrado(A.id, ana.usuario.email)).toBe(false);

    const adulterado = token.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect((await rotas.atenderDescadastro(new Request(url.replace(token, adulterado), { method: "POST", headers: hostDe(A.slug) }))).status).toBe(404);
    expect((await rotas.atenderDescadastro(new Request(url, { method: "POST", headers: hostDe(B.slug) }))).status).toBe(404);
    expect(await descadastro.estaDescadastrado(A.id, ana.usuario.email)).toBe(false);

    const post = await rotas.atenderDescadastro(new Request(url, { method: "POST", headers: hostDe(A.slug), body: "List-Unsubscribe=One-Click" }));
    expect(post.status).toBe(200);
    expect(await descadastro.estaDescadastrado(A.id, ana.usuario.email)).toBe(true);
    expect(await descadastro.estaDescadastrado(B.id, ana.usuario.email)).toBe(false);
    // Duas vezes = uma linha só.
    await rotas.atenderDescadastro(new Request(url, { method: "POST", headers: hostDe(A.slug) }));
    const lista = await descadastro.listarDescadastros(A.id, { pagina: 1, porPagina: 10 });
    expect(lista.total).toBe(1);
    expect(lista.linhas[0]).toMatchObject({ origem: "UM_CLIQUE", destinatario: expect.stringContaining("***") });
    expect(JSON.stringify(lista)).not.toContain(ana.usuario.email);
    expect((await descadastro.listarDescadastros(A.id, { email: ana.usuario.email, pagina: 1, porPagina: 10 })).total).toBe(1);
    const trilha = await db.select().from(s.auditoria).where(eq(s.auditoria.tabela, "criadores_emails_descadastros"));
    expect(JSON.stringify(trilha)).not.toContain(ana.usuario.email);

    // Campanha nova: ana fica IGNORADA. Transacional (primeiro acesso em massa) ainda chega.
    const { campanhaId } = await campanhaIniciada(A.id, dono.usuario.id);
    expect((await envioDe(campanhaId, ana.membro.id)).situacao).toBe("IGNORADO");
    const [pa] = await db
      .insert(s.criadores_emails_envios)
      .values({ criador_id: A.id, membro_id: ana.membro.id, origem: "PRIMEIRO_ACESSO", chave: `primeiro-acesso:teste:${ana.membro.id}`, modified_by: dono.usuario.id })
      .returning();
    expect(await envio.processarEnvio(pa.id, 1, 5, semTeto)).toEqual({ r: "enviado" });
    expect(falso.para(ana.usuario.email).map((e) => e.tipo)).toEqual(["PRIMEIRO_ACESSO"]);
  });

  it("cancelar: agendada não começa; enviando tira da fila o que não saiu", async () => {
    provedorFalso();
    const { A, dono, ana } = await cenario();
    const c = await db.transaction((tx) => camp.criarCampanha(tx, { criadorId: A.id, autor: dono.usuario.id, nome: "Amanhã", conteudo: conteudo(), publico: TODOS }));
    const ag = await db.transaction((tx) => camp.agendarCampanha(tx, { criadorId: A.id, autor: dono.usuario.id, campanhaId: c.id, versao: c.versao, quando: new Date(Date.now() + 86_400_000) }));
    expect((await camp.iniciarCampanha(c.id)).r).toBe("cedo");
    await expect(db.transaction((tx) => camp.salvarCampanha(tx, { criadorId: A.id, autor: dono.usuario.id, campanhaId: c.id, versao: c.versao, nome: "X", conteudo: conteudo(), publico: TODOS }))).rejects.toThrow(/alterado/);
    await db.transaction((tx) => camp.cancelarCampanha(tx, { criadorId: A.id, autor: dono.usuario.id, campanhaId: c.id, versao: ag.versao }));
    expect(await camp.iniciarCampanha(c.id)).toEqual({ r: "ignorada" });

    const { campanhaId, envioIds } = await campanhaIniciada(A.id, dono.usuario.id);
    const [linha] = await db.select().from(s.criadores_campanhas).where(eq(s.criadores_campanhas.id, campanhaId));
    const r = await db.transaction((tx) => camp.cancelarCampanha(tx, { criadorId: A.id, autor: dono.usuario.id, campanhaId, versao: linha.updated_at }));
    expect(r.naoEnviados).toBe(envioIds.length);
    expect(await envio.processarEnvio(envioIds[0], 1, 5, semTeto)).toEqual({ r: "ignorado", motivo: null });
    expect((await envioDe(campanhaId, ana.membro.id)).situacao).toBe("IGNORADO");
    await expect(db.transaction((tx) => camp.excluirCampanha(tx, { criadorId: A.id, autor: dono.usuario.id, campanhaId, versao: r.versao }))).rejects.toThrow(/Só rascunho/);
  });
});
