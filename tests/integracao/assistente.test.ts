/**
 * Base de conhecimento + assistente do professor (ADR-0014, RN-190 a RN-197) no PostgreSQL REAL com
 * o cliente FALSO (nenhuma chamada à API da Anthropic): recuperação filtrada pelo acesso (curso não
 * comprado, rascunho, liberação futura, fonte desligada), A × B, o que chega ao modelo, resposta sem
 * base sem chamar o modelo, limite diário atômico (N+1 e concorrência) e teto do criador, rota
 * (401/403/503/streaming/aborto), reindexação idempotente, ALUNO recusado nas telas/actions da equipe
 * e trilha.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador, trilhaDe } from "./_apoio";
import { ok } from "./_catalogo";
import { cursoPronto, matricular, membroCom } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  forbidden: () => {
    throw new Error("403");
  },
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));

let busca: typeof import("@/lib/conhecimento/busca");
let idx: typeof import("@/lib/conhecimento/indexar");
let resp: typeof import("@/lib/assistente/responder");
let conv: typeof import("@/lib/assistente/conversas");
let rota: typeof import("@/lib/assistente/rota");
let rotaNext: typeof import("@/app/api/assistente/route");
let acoesBase: typeof import("@/lib/actions/conhecimento");
let acoesAssist: typeof import("@/lib/actions/assistente");
let guarda: typeof import("@/lib/auth/guarda");
let Falso: typeof import("@/lib/assistente/cliente-falso").ClienteFalso;
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  busca = await import("@/lib/conhecimento/busca");
  idx = await import("@/lib/conhecimento/indexar");
  resp = await import("@/lib/assistente/responder");
  conv = await import("@/lib/assistente/conversas");
  rota = await import("@/lib/assistente/rota");
  rotaNext = await import("@/app/api/assistente/route");
  acoesBase = await import("@/lib/actions/conhecimento");
  acoesAssist = await import("@/lib/actions/assistente");
  guarda = await import("@/lib/auth/guarda");
  Falso = (await import("@/lib/assistente/cliente-falso")).ClienteFalso;
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const OPCOES = { produtos: null, limite: 6, porDocumento: 3 };

/** Aula com descrição (palavra-chave única) indexada pelo caminho real. */
async function aulaComDescricao(criadorId: string, aulaId: string, descricao: string) {
  await db.update(s.produtos_modulos_aulas).set({ descricao }).where(eq(s.produtos_modulos_aulas.id, aulaId));
  return idx.sincronizarAula(criadorId, aulaId, criadorId);
}

/**
 * Criador com: curso PAGO (aluno matriculado) "girassol", curso NÃO comprado "orquidea", curso em
 * RASCUNHO "bromelia" (aluno matriculado), aula com liberação futura "samambaia" no curso pago,
 * texto geral "jabuticaba" e texto só do curso não comprado "pitanga". Dono e aluno logáveis.
 */
async function cenario(nome = "IA") {
  const c = await novoCriador(nome);
  const pago = await cursoPronto(c.id, { aulas: 2 });
  const outro = await cursoPronto(c.id, { aulas: 1 });
  const rascunho = await cursoPronto(c.id, { aulas: 1, status: "RASCUNHO" });
  const dono = await membroCom(c.id, "DONO");
  const aluno = await membroCom(c.id, "ALUNO");
  await matricular(c.id, aluno.membro.id, pago.produto.id);
  await matricular(c.id, aluno.membro.id, rascunho.produto.id);
  await aulaComDescricao(c.id, pago.aulas[0].id, "Liderança girassol: feedback que desenvolve a equipe com clareza.");
  await aulaComDescricao(c.id, outro.aulas[0].id, "Conteúdo pago orquidea sobre feedback avançado para gestores.");
  await aulaComDescricao(c.id, rascunho.aulas[0].id, "Rascunho bromelia sobre feedback em construção.");
  await db.update(s.produtos_modulos_aulas).set({ libera_em: new Date(Date.now() + 7 * 86_400_000) }).where(eq(s.produtos_modulos_aulas.id, pago.aulas[1].id));
  await aulaComDescricao(c.id, pago.aulas[1].id, "Aula futura samambaia sobre feedback contínuo.");
  req.h = await cabecalhosLogados(dono.usuario.email, c.slug);
  const geral = ok(await acoesBase.acaoCriarTexto({ titulo: "FAQ", texto: "Política jabuticaba: o feedback da equipe responde em dois dias úteis.", produtoId: null }));
  const doOutro = ok(await acoesBase.acaoCriarTexto({ titulo: "Mentoria", texto: "Exclusivo pitanga: horário das mentorias de feedback às quintas.", produtoId: outro.produto.id }));
  const hAluno = await cabecalhosLogados(aluno.usuario.email, c.slug);
  const hDono = req.h;
  return { c, pago, outro, rascunho, dono, aluno, geral, doOutro, hAluno, hDono };
}

const quemAluno = (x: Awaited<ReturnType<typeof cenario>>) => ({ papel: "ALUNO" as const, membroId: x.aluno.membro.id });
const palavras = (l: { texto: string }[]) => l.map((t) => t.texto).join(" ");
const perguntante = (x: Awaited<ReturnType<typeof cenario>>, quem: "aluno" | "dono" = "aluno") => ({
  criadorId: x.c.id,
  nomeArea: x.c.nome,
  usuarioId: x[quem].usuario.id,
  membroId: x[quem].membro.id,
  papel: x[quem].membro.papel,
});
const ligar = (criadorId: string, autor: string, limite = 20) =>
  db.insert(s.criadores_assistentes).values({ criador_id: criadorId, ligado: true, limite_diario: limite, modified_by: autor });
async function consumir(r: Awaited<ReturnType<typeof resp.prepararResposta>>, sinal = new AbortController().signal) {
  const eventos = [];
  for await (const e of r.eventos(sinal)) eventos.push(e);
  return eventos;
}

describe("recuperação filtrada pelo acesso", () => {
  it("aluno: só curso com matrícula valendo, publicado e aula liberada; texto geral sim, texto de curso não comprado não", async () => {
    const x = await cenario();
    const l = await busca.recuperarTrechos(x.c.id, quemAluno(x), "feedback girassol orquidea bromelia samambaia jabuticaba pitanga", OPCOES);
    const t = palavras(l);
    expect(t).toContain("girassol");
    expect(t).toContain("jabuticaba");
    for (const proibido of ["orquidea", "pitanga", "bromelia", "samambaia"]) expect(t).not.toContain(proibido);
    // Equipe vê tudo (até o rascunho e a aula futura).
    const daEquipe = palavras(await busca.recuperarTrechos(x.c.id, { papel: "DONO", membroId: x.dono.membro.id }, "feedback girassol orquidea bromelia samambaia pitanga", OPCOES));
    for (const p of ["girassol", "orquidea", "bromelia", "samambaia", "pitanga"]) expect(daEquipe).toContain(p);
    // Matrícula expirada = some na hora.
    await db.update(s.produtos_matriculas).set({ expira_em: new Date(Date.now() - 1000) }).where(eq_(s.produtos_matriculas.membro_id, x.aluno.membro.id));
    expect(palavras(await busca.recuperarTrechos(x.c.id, quemAluno(x), "girassol", OPCOES))).not.toContain("girassol");
  });

  it("fonte desligada e cursos fora do assistente não entram; sem vínculo, só texto geral", async () => {
    const x = await cenario();
    const [doc] = await db.select().from(s.criadores_conhecimento_documentos).where(eq_(s.criadores_conhecimento_documentos.id, x.geral.id));
    req.h = x.hDono;
    ok(await acoesBase.acaoIncluirDocumento({ documentoId: doc.id, versao: doc.updated_at.toISOString(), incluir: false }));
    expect(await busca.recuperarTrechos(x.c.id, quemAluno(x), "jabuticaba", OPCOES)).toEqual([]);
    const soOutro = await busca.recuperarTrechos(x.c.id, { papel: "DONO", membroId: null }, "girassol orquidea", { ...OPCOES, produtos: [x.outro.produto.id] });
    expect(palavras(soOutro)).not.toContain("girassol");
    expect(palavras(soOutro)).toContain("orquidea");
    expect(await busca.recuperarTrechos(x.c.id, { papel: null, membroId: null }, "girassol", OPCOES)).toEqual([]);
    expect((await trilhaDe(x.dono.usuario.id)).some((t) => t.tabela === "criadores_conhecimento_documentos" && /Tirou "FAQ"/.test(t.detalhes))).toBe(true);
  });

  it("A × B: a busca de A nunca devolve trecho de B", async () => {
    const a = await cenario("A");
    const b = await cenario("B");
    const l = await busca.recuperarTrechos(a.c.id, { papel: "DONO", membroId: a.dono.membro.id }, "girassol jabuticaba", OPCOES);
    const docsB = await db.select({ id: s.criadores_conhecimento_documentos.id }).from(s.criadores_conhecimento_documentos).where(eq_(s.criadores_conhecimento_documentos.criador_id, b.c.id));
    expect(l.length).toBeGreaterThan(0);
    expect(l.some((t) => docsB.some((d) => d.id === t.documentoId))).toBe(false);
  });
});

const eq_ = (col: Parameters<typeof eq>[0], v: string) => eq(col, v);

describe("resposta com o cliente falso", () => {
  it("o modelo só recebe trechos do que o aluno pode ver; resposta gravada com tokens e fontes citadas", async () => {
    const x = await cenario();
    await ligar(x.c.id, x.dono.usuario.id);
    const falso = new Falso();
    const r = await resp.prepararResposta(falso, perguntante(x), { pergunta: "Como dar feedback? girassol orquidea pitanga", conversaId: null, aulaId: null, teste: false });
    const ev = await consumir(r);
    // Só o bloco <trechos> (a pergunta do aluno, que cita as palavras, vem depois).
    const enviado = /<trechos>[\s\S]*<\/trechos>/.exec(falso.ultimoPedido!.mensagens.at(-1)!.texto)![0];
    expect(enviado).toContain("girassol");
    for (const p of ["orquidea", "pitanga"]) expect(enviado).not.toContain(p);
    expect(ev.at(-1)).toMatchObject({ tipo: "fim", semResposta: false, citadas: [1, 2] });
    const msgs = await db.select().from(s.criadores_assistentes_conversas_mensagens).where(eq_(s.criadores_assistentes_conversas_mensagens.conversa_id, r.conversaId));
    const a = msgs.find((m) => m.papel === "ASSISTENTE")!;
    expect(a).toMatchObject({ modelo: "claude-sonnet-5-5", sem_resposta: false, interrompida: false });
    expect(a.tokens_entrada).toBeGreaterThan(0);
    expect(a.tokens_saida).toBeGreaterThan(0);
    expect(a.fontes.map((f) => f.n)).toEqual([1, 2]);
  });

  it("pergunta em linguagem natural com palavras ausentes no texto ainda acha o trecho certo (OU + bônus do título), pela rota real", async () => {
    const x = await cenario();
    await ligar(x.c.id, x.dono.usuario.id);
    // Igual ao demo: a aula se chama "O que é cultura organizacional" e o texto não diz "prática".
    await db.update(s.produtos_modulos_aulas).set({ titulo: "O que é cultura organizacional" }).where(eq_(s.produtos_modulos_aulas.id, x.pago.aulas[0].id));
    await aulaComDescricao(x.c.id, x.pago.aulas[0].id, "Olá! Nesta aula falamos de cultura: o jeito como as coisas realmente acontecem na empresa, nas decisões do dia a dia.");
    const pergunta = "O que é cultura organizacional, na prática?";
    const l = await busca.recuperarTrechos(x.c.id, quemAluno(x), pergunta, OPCOES);
    expect(l[0]).toMatchObject({ titulo: "O que é cultura organizacional", aulaId: x.pago.aulas[0].id });
    // A rota da tela usa a mesma recuperação: o trecho chega ao modelo.
    const falso = new Falso();
    const cab = new Headers(x.hAluno);
    cab.set("content-type", "application/json");
    const r = await rota.responderPorRota(new Request("http://x/api/assistente", { method: "POST", headers: cab, body: JSON.stringify({ pergunta }) }), falso);
    expect(r.status).toBe(200);
    await r.text();
    expect(falso.ultimoPedido!.mensagens.at(-1)!.texto).toContain("o jeito como as coisas realmente acontecem");
  });

  it("chave sem workspace: a equipe vê como configurar; o aluno só a mensagem genérica; o cabeçalho sai da variável", async () => {
    const x = await cenario();
    await ligar(x.c.id, x.dono.usuario.id);
    const erroApi = '400 {"type":"error","error":{"type":"invalid_request_error","message":"This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header"}}';
    const doDono = await consumir(await resp.prepararResposta(new Falso({ falhar: erroApi }), perguntante(x, "dono"), { pergunta: "feedback girassol", conversaId: null, aulaId: null, teste: true }));
    expect(doDono.at(-1)).toEqual({ tipo: "erro", mensagem: resp.MSG_SEM_WORKSPACE });
    const doAluno = await consumir(await resp.prepararResposta(new Falso({ falhar: erroApi }), perguntante(x), { pergunta: "feedback girassol", conversaId: null, aulaId: null, teste: false }));
    expect(doAluno.at(-1)).toEqual({ tipo: "erro", mensagem: resp.MSG_FALHA_API });
    const cliente = await import("@/lib/assistente/cliente");
    expect(cliente.cabecalhosPadrao({ ANTHROPIC_WORKSPACE_ID: " wrkspc_123 " })).toEqual({ "anthropic-workspace-id": "wrkspc_123" });
    expect(cliente.cabecalhosPadrao({})).toEqual({});
  });

  it("sem trecho na base: resposta fixa, sem chamar o modelo, marcada sem resposta", async () => {
    const x = await cenario();
    await ligar(x.c.id, x.dono.usuario.id);
    const falso = new Falso();
    const ev = await consumir(await resp.prepararResposta(falso, perguntante(x), { pergunta: "Qual a cotação do dólar hoje?", conversaId: null, aulaId: null, teste: false }));
    expect(falso.chamadas).toBe(0);
    expect(ev.at(-1)).toMatchObject({ tipo: "fim", semResposta: true, citadas: [] });
    expect(ev.find((e) => e.tipo === "texto")).toMatchObject({ texto: expect.stringMatching(/Comunidade/) });
  });

  it("desligado recusa o aluno; sem chave recusa todos (IA não configurada)", async () => {
    const x = await cenario();
    await expect(resp.prepararResposta(new Falso(), perguntante(x), { pergunta: "feedback girassol", conversaId: null, aulaId: null, teste: false })).rejects.toThrow(resp.MSG_DESLIGADO);
    await expect(resp.prepararResposta(null, perguntante(x, "dono"), { pergunta: "feedback", conversaId: null, aulaId: null, teste: true })).rejects.toThrow(/IA não configurada/);
  });
});

describe("limites", () => {
  it("N+1 recusada; apagar a conversa não devolve a cota; concorrência não passa do limite", async () => {
    const x = await cenario();
    await ligar(x.c.id, x.dono.usuario.id, 2);
    const perguntar = () => resp.prepararResposta(new Falso(), perguntante(x), { pergunta: "feedback girassol", conversaId: null, aulaId: null, teste: false });
    const r1 = await perguntar();
    await consumir(r1);
    const [c1] = await db.select().from(s.criadores_assistentes_conversas).where(eq_(s.criadores_assistentes_conversas.id, r1.conversaId));
    await conv.apagarConversa({ criadorId: x.c.id, membroId: x.aluno.membro.id, usuarioId: x.aluno.usuario.id, conversaId: c1.id, versao: c1.updated_at });
    await perguntar();
    await expect(perguntar()).rejects.toBeInstanceOf(conv.ErroDeLimite);

    // Outro aluno, limite 2, 6 pedidos ao mesmo tempo: exatamente 2 passam.
    const outro = await membroCom(x.c.id, "ALUNO");
    await matricular(x.c.id, outro.membro.id, x.pago.produto.id);
    const r = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        resp.prepararResposta(new Falso(), { ...perguntante(x), usuarioId: outro.usuario.id, membroId: outro.membro.id }, { pergunta: "feedback", conversaId: null, aulaId: null, teste: false }),
      ),
    );
    expect(r.filter((p) => p.status === "fulfilled")).toHaveLength(2);
    expect(r.filter((p) => p.status === "rejected" && p.reason instanceof conv.ErroDeLimite)).toHaveLength(4);
  });

  it("teto do criador por variável de ambiente vale também para a equipe", async () => {
    const x = await cenario();
    await ligar(x.c.id, x.dono.usuario.id, 50);
    process.env.ASSISTENTE_TETO_DIARIO_CRIADOR = "2";
    try {
      const p = (quem: "aluno" | "dono") => resp.prepararResposta(new Falso(), perguntante(x, quem), { pergunta: "feedback", conversaId: null, aulaId: null, teste: quem === "dono" });
      await p("aluno");
      await p("dono");
      await expect(p("dono")).rejects.toMatchObject({ motivo: "TETO_CRIADOR" });
    } finally {
      delete process.env.ASSISTENTE_TETO_DIARIO_CRIADOR;
    }
  });
});

describe("rota POST /api/assistente", () => {
  const pedir = (h: Headers, corpo: unknown, sinal?: AbortSignal) => {
    const cab = new Headers(h);
    cab.set("content-type", "application/json");
    return new Request("http://x/api/assistente", { method: "POST", headers: cab, body: JSON.stringify(corpo), signal: sinal });
  };
  const linhas = async (r: Response) => (await r.text()).trim().split("\n").map((l) => JSON.parse(l) as { tipo: string });

  it("401 sem sessão, 403 para teste de ALUNO (na trilha), 503 sem chave, 403 de outro site", async () => {
    const x = await cenario();
    await ligar(x.c.id, x.dono.usuario.id);
    const semCookie = new Headers(x.hAluno);
    semCookie.delete("cookie");
    expect((await rota.responderPorRota(pedir(semCookie, { pergunta: "oi oi" }), new Falso())).status).toBe(401);
    expect((await rota.responderPorRota(pedir(x.hAluno, { pergunta: "feedback", teste: true }), new Falso())).status).toBe(403);
    expect((await trilhaDe(x.aluno.usuario.id)).some((t) => t.acao === "acesso_negado" && t.tabela === "criadores_assistentes_conversas")).toBe(true);
    const semChave = await rotaNext.POST(pedir(x.hAluno, { pergunta: "feedback girassol" }));
    expect(semChave.status).toBe(503);
    expect(await semChave.json()).toEqual({ erro: expect.stringMatching(/IA não configurada/) });
    const outroSite = pedir(x.hAluno, { pergunta: "feedback" });
    outroSite.headers.set("origin", "https://malicioso.example");
    expect((await rota.responderPorRota(outroSite, new Falso())).status).toBe(403);
    expect((await rota.responderPorRota(pedir(x.hAluno, { pergunta: "x".repeat(2000) }), new Falso())).status).toBe(400);
  });

  it("streaming NDJSON com o falso; aula sem acesso recusada; aborto grava a resposta interrompida", async () => {
    const x = await cenario();
    await ligar(x.c.id, x.dono.usuario.id);
    const r = await rota.responderPorRota(pedir(x.hAluno, { pergunta: "feedback girassol", aulaId: x.pago.aulas[0].id }), new Falso());
    expect(r.headers.get("content-type")).toMatch(/application\/x-ndjson/);
    const ev = await linhas(r);
    expect(ev[0].tipo).toBe("inicio");
    expect(ev.filter((e) => e.tipo === "texto").length).toBeGreaterThan(1);
    expect(ev.at(-1)?.tipo).toBe("fim");
    // Aula do curso não comprado: recusa antes do modelo.
    expect((await rota.responderPorRota(pedir(x.hAluno, { pergunta: "feedback", aulaId: x.outro.aulas[0].id }), new Falso())).status).toBe(400);

    const controle = new AbortController();
    const lento = new Falso({ atrasoMs: 30, resposta: "Uma resposta longa sobre feedback [1] ".repeat(10) });
    const aberta = await rota.responderPorRota(pedir(x.hAluno, { pergunta: "feedback girassol de novo" }, controle.signal), lento);
    const leitor = aberta.body!.getReader();
    await leitor.read();
    await leitor.read();
    controle.abort();
    await leitor.cancel().catch(() => {});
    await new Promise((ok) => setTimeout(ok, 400));
    const [ultima] = await db
      .select()
      .from(s.criadores_assistentes_conversas_mensagens)
      .where(and(eq(s.criadores_assistentes_conversas_mensagens.membro_id, x.aluno.membro.id), eq(s.criadores_assistentes_conversas_mensagens.papel, "ASSISTENTE")))
      .orderBy(s.criadores_assistentes_conversas_mensagens.created_at)
      .then((l) => l.slice(-1));
    expect(ultima).toMatchObject({ interrompida: true });
    expect(ultima.tokens_entrada).toBeGreaterThan(0);
  });
});

describe("reindexação e telas da equipe", () => {
  it("idempotente: de novo = igual (sem linhas novas); mudou = troca os trechos (os velhos ficam lógicos)", async () => {
    const x = await cenario();
    const aula = x.pago.aulas[0].id;
    const contar = async () => (await db.select().from(s.criadores_conhecimento_documentos_trechos).where(eq_(s.criadores_conhecimento_documentos_trechos.criador_id, x.c.id))).length;
    const antes = await contar();
    expect(await idx.sincronizarAula(x.c.id, aula, x.dono.usuario.id)).toEqual({ descricao: "igual", transcricao: "ausente" });
    const r = await idx.reindexarCriador(x.c.id, x.dono.usuario.id);
    expect(r.criado + r.atualizado + r.removido).toBe(0);
    expect(await contar()).toBe(antes);
    expect(await aulaComDescricao(x.c.id, aula, "Descrição nova cerejeira.")).toMatchObject({ descricao: "atualizado" });
    expect(palavras(await busca.recuperarTrechos(x.c.id, quemAluno(x), "girassol cerejeira", OPCOES))).toBe("Descrição nova cerejeira.");
    expect(await contar()).toBe(antes + 1);
    // Descrição apagada = documento sai.
    expect(await aulaComDescricao(x.c.id, aula, "")).toMatchObject({ descricao: "removido" });
  });

  it("transcrição: tempos relidos do .vtt no storage; sem o arquivo, o texto entra sem tempo", async () => {
    const x = await cenario();
    const aula = x.pago.aulas[0].id;
    const id = crypto.randomUUID();
    const chave = `criadores/${x.c.id}/legendas/${id}.vtt`;
    const falas = Array.from({ length: 40 }, (_, i) => `00:${String(Math.floor((i * 5) / 60)).padStart(2, "0")}:${String((i * 5) % 60).padStart(2, "0")}.000 --> 00:${String(Math.floor((i * 5 + 4) / 60)).padStart(2, "0")}:${String((i * 5 + 4) % 60).padStart(2, "0")}.000\nFala ${i} sobre feedback e cultura organizacional no dia a dia da equipe.\n`);
    const vtt = `WEBVTT\n\n${falas.join("\n")}`;
    const texto = Array.from({ length: 40 }, (_, i) => `Fala ${i} sobre feedback e cultura organizacional no dia a dia da equipe.`).join("\n");
    await db.insert(s.produtos_modulos_aulas_legendas).values({ id, criador_id: x.c.id, aula_id: aula, idioma: "pt-BR", rotulo: "Português", nome_original: "a.vtt", chave, texto, trechos: 40, duracao_seg: 200, enviado_por: x.dono.usuario.id, modified_by: x.dono.usuario.id });
    const cliente = await import("@/lib/armazenamento/cliente");
    const comStorage = await cliente
      .gravarObjeto({ bucket: "arquivos", criadorId: x.c.id, chave, corpo: Buffer.from(vtt), tamanho: Buffer.byteLength(vtt), mime: "text/vtt" })
      .then(() => true)
      .catch(() => false);
    expect(await idx.sincronizarAula(x.c.id, aula, x.dono.usuario.id)).toMatchObject({ transcricao: "criado" });
    const [doc] = await db
      .select()
      .from(s.criadores_conhecimento_documentos)
      .where(and(eq(s.criadores_conhecimento_documentos.aula_id, aula), eq(s.criadores_conhecimento_documentos.fonte, "AULA_TRANSCRICAO"), eq(s.criadores_conhecimento_documentos.is_deleted, false)));
    const trechos = await db
      .select()
      .from(s.criadores_conhecimento_documentos_trechos)
      .where(and(eq(s.criadores_conhecimento_documentos_trechos.documento_id, doc.id), eq(s.criadores_conhecimento_documentos_trechos.is_deleted, false)))
      .orderBy(s.criadores_conhecimento_documentos_trechos.ordem);
    expect(trechos.length).toBeGreaterThan(1);
    if (comStorage) {
      expect(trechos[0].inicio_seg).toBe(0);
      expect(trechos[1].inicio_seg).toBeGreaterThan(0);
    } else expect(trechos.every((t) => t.inicio_seg === null)).toBe(true);
    // Remover a legenda tira a transcrição da base.
    await db.update(s.produtos_modulos_aulas_legendas).set({ is_deleted: true, deleted_at: new Date() }).where(eq(s.produtos_modulos_aulas_legendas.id, id));
    expect(await idx.sincronizarAula(x.c.id, aula, x.dono.usuario.id)).toMatchObject({ transcricao: "removido" });
  });

  it("ALUNO: 403 nas telas da equipe e 'Sem permissão' nas actions; aluno apaga só a própria conversa", async () => {
    const x = await cenario();
    req.h = x.hAluno;
    await expect(guarda.membroDaPagina(["DONO", "ADMIN"])).rejects.toThrow("403");
    for (const r of [
      await acoesBase.acaoCriarTexto({ titulo: "X", texto: "conteúdo com mais de vinte caracteres", produtoId: null }),
      await acoesBase.acaoTestarBusca({ pergunta: "feedback" }),
      await acoesAssist.acaoSalvarConfigAssistente({ versao: null, ligado: true, nome: "Assistente", instrucoes: "", limiteDiario: 5, todosOsCursos: true, produtos: [] }),
    ])
      expect(r).toMatchObject({ ok: false, erro: "Sem permissão para esta ação." });

    // Configuração pela equipe: trava e trilha.
    req.h = x.hDono;
    const v1 = ok(await acoesAssist.acaoSalvarConfigAssistente({ versao: null, ligado: true, nome: "Prof", instrucoes: "Tom leve", limiteDiario: 5, todosOsCursos: false, produtos: [x.pago.produto.id] }));
    expect(await acoesAssist.acaoSalvarConfigAssistente({ versao: null, ligado: false, nome: "Prof", instrucoes: "", limiteDiario: 5, todosOsCursos: true, produtos: [] })).toMatchObject({ ok: false });
    ok(await acoesAssist.acaoSalvarConfigAssistente({ versao: v1.versao, ligado: true, nome: "Prof", instrucoes: "", limiteDiario: 5, todosOsCursos: true, produtos: [] }));
    expect((await trilhaDe(x.dono.usuario.id)).filter((t) => t.tabela === "criadores_assistentes")).toHaveLength(2);

    // Conversa do aluno: outro membro não apaga.
    const r = await resp.prepararResposta(new Falso(), perguntante(x), { pergunta: "feedback girassol", conversaId: null, aulaId: null, teste: false });
    await consumir(r);
    const [c] = await db.select().from(s.criadores_assistentes_conversas).where(eq_(s.criadores_assistentes_conversas.id, r.conversaId));
    expect(await acoesAssist.acaoApagarConversa({ conversaId: c.id, versao: c.updated_at.toISOString() })).toMatchObject({ ok: false });
    req.h = x.hAluno;
    ok(await acoesAssist.acaoApagarConversa({ conversaId: c.id, versao: c.updated_at.toISOString() }));
    expect((await conv.conversasDoMembro(x.c.id, x.aluno.membro.id)).map((k) => k.id)).not.toContain(c.id);
    const trilha = (await trilhaDe(x.aluno.usuario.id)).find((t) => t.tabela === "criadores_assistentes_conversas" && t.acao === "excluir");
    expect(trilha?.detalhes).not.toContain("girassol");
  });
});
