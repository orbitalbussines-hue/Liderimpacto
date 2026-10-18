/**
 * Fase 1 (ADR-0018 item 5, RN-204) no PostgreSQL real — webhooks de saída: segredo mostrado uma vez
 * e guardado cifrado, teto por criador, eventos só para webhooks ATIVOS inscritos do MESMO criador,
 * gancho real (conclusão de aula), entrega assinada (POST falso: o teste nunca sai para a rede),
 * retentativa até FALHOU, reenviar com trava, trilha sem segredo e isolamento A×B.
 */
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novoCriador, novoUsuario } from "./_apoio";
import { concluirAulas } from "./_passo7";
import { alunoMatriculado, cursoPronto } from "./_progresso";

let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let serv: typeof import("@/lib/webhooks/servico");
let emitir: typeof import("@/lib/webhooks/emitir");
let entrega: typeof import("@/lib/webhooks/entrega");
let consultas: typeof import("@/lib/webhooks/consultas");
let segredo: typeof import("@/lib/webhooks/segredo");

beforeAll(async () => {
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  serv = await import("@/lib/webhooks/servico");
  emitir = await import("@/lib/webhooks/emitir");
  entrega = await import("@/lib/webhooks/entrega");
  consultas = await import("@/lib/webhooks/consultas");
  segredo = await import("@/lib/webhooks/segredo");
});

afterAll(async () => {
  await (await import("@/lib/webhooks/fila")).filaWebhooks().close();
});

const entregasDe = (webhookId: string) => db.select().from(s.criadores_webhooks_entregas).where(eq(s.criadores_webhooks_entregas.webhook_id, webhookId));

describe("webhooks de saída", () => {
  it("cria com segredo cifrado (uma vez), recusa http e o 11º, e a trilha não guarda o segredo", async () => {
    const A = await novoCriador();
    const dono = await novoUsuario();
    const w = await db.transaction((tx) => serv.criarWebhook(tx, { criadorId: A.id, autor: dono.id, nome: "CRM", url: "https://crm.exemplo.com/h", eventos: ["MATRICULA_CRIADA"] }));
    const [linha] = await db.select().from(s.criadores_webhooks).where(eq(s.criadores_webhooks.id, w.id));
    expect(linha.segredo_cifrado).not.toContain(w.segredo);
    expect(segredo.decifrarSegredo(linha.segredo_cifrado, w.id)).toBe(w.segredo);
    expect(linha.segredo_final).toBe(w.segredo.slice(-4));
    const trilha = await db.select().from(s.auditoria).where(eq(s.auditoria.registro_id, w.id));
    expect(JSON.stringify(trilha)).not.toContain(w.segredo);
    expect((await consultas.listarWebhooks(A.id))[0]).not.toHaveProperty("segredo_cifrado");

    await expect(db.transaction((tx) => serv.criarWebhook(tx, { criadorId: A.id, autor: dono.id, nome: "X", url: "http://crm.exemplo.com", eventos: ["MATRICULA_CRIADA"] }))).rejects.toThrow(/https/);
    await expect(db.transaction((tx) => serv.criarWebhook(tx, { criadorId: A.id, autor: dono.id, nome: "X", url: "https://localhost/x", eventos: ["MATRICULA_CRIADA"] }))).rejects.toThrow(/não permitido/);
    for (let i = 0; i < 9; i++) await db.transaction((tx) => serv.criarWebhook(tx, { criadorId: A.id, autor: dono.id, nome: `W${i}`, url: "https://x.exemplo.com", eventos: ["AULA_CONCLUIDA"] }));
    await expect(db.transaction((tx) => serv.criarWebhook(tx, { criadorId: A.id, autor: dono.id, nome: "W11", url: "https://x.exemplo.com", eventos: ["AULA_CONCLUIDA"] }))).rejects.toThrow(/Limite de 10/);

    const novo = await db.transaction((tx) => serv.rotacionarSegredo(tx, { criadorId: A.id, autor: dono.id, webhookId: w.id, versao: w.versao }));
    expect(novo.segredo).not.toBe(w.segredo);
    await expect(db.transaction((tx) => serv.rotacionarSegredo(tx, { criadorId: A.id, autor: dono.id, webhookId: w.id, versao: w.versao }))).rejects.toThrow(/alterado/);
  });

  it("evento só para webhook ATIVO inscrito do mesmo criador; gancho real; entrega assinada; falha até FALHOU; reenviar", async () => {
    const A = await novoCriador();
    const B = await novoCriador();
    const dono = await novoUsuario();
    const ativo = await db.transaction((tx) => serv.criarWebhook(tx, { criadorId: A.id, autor: dono.id, nome: "Ativo", url: "https://a.exemplo.com/h", eventos: ["MATRICULA_CRIADA", "AULA_CONCLUIDA"] }));
    const outroEvento = await db.transaction((tx) => serv.criarWebhook(tx, { criadorId: A.id, autor: dono.id, nome: "Outro", url: "https://b.exemplo.com/h", eventos: ["CERTIFICADO_EMITIDO"] }));
    const pausado = await db.transaction((tx) => serv.criarWebhook(tx, { criadorId: A.id, autor: dono.id, nome: "Pausado", url: "https://c.exemplo.com/h", eventos: ["MATRICULA_CRIADA"] }));
    await db.transaction((tx) => serv.mudarSituacaoWebhook(tx, { criadorId: A.id, autor: dono.id, webhookId: pausado.id, versao: pausado.versao, situacao: "PAUSADO" }));
    const deB = await db.transaction((tx) => serv.criarWebhook(tx, { criadorId: B.id, autor: dono.id, nome: "De B", url: "https://d.exemplo.com/h", eventos: ["MATRICULA_CRIADA"] }));

    const { produto, aulas } = await cursoPronto(A.id, { aulas: 2 });
    const ana = await alunoMatriculado(A.id, produto.id);
    const [m] = await db.select().from(s.produtos_matriculas).where(eq(s.produtos_matriculas.membro_id, ana.membro.id));
    expect(await emitir.webhookMatriculas(A.id, [m.id], "MATRICULA_CRIADA", dono.id)).toBe(1);
    expect(await entregasDe(outroEvento.id)).toHaveLength(0);
    expect(await entregasDe(pausado.id)).toHaveLength(0);
    expect(await entregasDe(deB.id)).toHaveLength(0);
    // Matrícula de A pedida para B: nada sai.
    expect(await emitir.webhookMatriculas(B.id, [m.id], "MATRICULA_CRIADA", dono.id)).toBe(0);

    // Gancho real: concluir a aula emite AULA_CONCLUIDA (depois do commit).
    await concluirAulas(A.id, ana, [aulas[0]]);
    const todas = await entregasDe(ativo.id);
    expect(todas.map((e) => e.evento).sort()).toEqual(["AULA_CONCLUIDA", "MATRICULA_CRIADA"]);
    const mat = todas.find((e) => e.evento === "MATRICULA_CRIADA")!;
    expect(mat.payload).toMatchObject({ evento: "MATRICULA_CRIADA", criador: { id: A.id, slug: A.slug }, dados: { membro: { id: ana.membro.id, email: ana.usuario.email }, produto: { id: produto.id } } });

    // Entrega com POST falso: cabeçalhos assinados com o segredo em claro.
    const chamadas: { url: string; corpo: string; cab: Record<string, string> }[] = [];
    const r = await entrega.processarEntrega(mat.id, 1, 8, async (url, corpo, cab) => {
      chamadas.push({ url, corpo, cab });
      return { status: 204 };
    });
    expect(r).toBe("entregue");
    const [{ url, corpo, cab }] = chamadas;
    expect(url).toBe("https://a.exemplo.com/h");
    expect(JSON.parse(corpo)).toEqual(mat.payload);
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(cab["X-Lider-Assinatura"])!;
    expect(v1).toBe(createHmac("sha256", ativo.segredo).update(`${t}.${corpo}`).digest("hex"));
    expect(cab).toMatchObject({ "X-Lider-Evento": "MATRICULA_CRIADA", "X-Lider-Entrega": mat.id });
    const [ok] = await db.select().from(s.criadores_webhooks_entregas).where(eq(s.criadores_webhooks_entregas.id, mat.id));
    expect(ok).toMatchObject({ situacao: "ENTREGUE", tentativas: 1, status_http: 204, erro: null });
    // Repetir o job não reenvia.
    expect(await entrega.processarEntrega(mat.id, 2, 8, async () => ({ status: 204 }))).toBe("ignorada");

    // Falha: tenta de novo (PENDENTE + próxima), na última vira FALHOU.
    const aula = todas.find((e) => e.evento === "AULA_CONCLUIDA")!;
    await expect(entrega.processarEntrega(aula.id, 1, 2, async () => ({ status: 500 }))).rejects.toThrow("HTTP 500");
    const [p1] = await db.select().from(s.criadores_webhooks_entregas).where(eq(s.criadores_webhooks_entregas.id, aula.id));
    expect(p1).toMatchObject({ situacao: "PENDENTE", tentativas: 1, status_http: 500 });
    expect(p1.proxima_tentativa_em).toBeInstanceOf(Date);
    await expect(entrega.processarEntrega(aula.id, 2, 2, async () => { throw new Error("ECONNREFUSED"); })).rejects.toThrow("ECONNREFUSED");
    const [p2] = await db.select().from(s.criadores_webhooks_entregas).where(eq(s.criadores_webhooks_entregas.id, aula.id));
    expect(p2).toMatchObject({ situacao: "FALHOU", tentativas: 2, status_http: null, erro: "ECONNREFUSED", proxima_tentativa_em: null });
    expect(await entrega.entregasPendentes()).not.toContain(aula.id);

    // Reenviar: volta a PENDENTE com a trava; versão velha = colisão; webhook de outro criador = colisão.
    await expect(db.transaction((tx) => serv.reenviarEntrega(tx, { criadorId: B.id, autor: dono.id, entregaId: aula.id, versao: p2.updated_at }))).rejects.toThrow(/alterado/);
    await db.transaction((tx) => serv.reenviarEntrega(tx, { criadorId: A.id, autor: dono.id, entregaId: aula.id, versao: p2.updated_at }));
    expect(await entrega.entregasPendentes()).toContain(aula.id);
    await expect(db.transaction((tx) => serv.reenviarEntrega(tx, { criadorId: A.id, autor: dono.id, entregaId: aula.id, versao: p2.updated_at }))).rejects.toThrow(/alterado/);

    // Pausar depois do evento: a entrega pendente é cancelada ao sair da fila (sem POST).
    const [w] = await db.select().from(s.criadores_webhooks).where(eq(s.criadores_webhooks.id, ativo.id));
    await db.transaction((tx) => serv.mudarSituacaoWebhook(tx, { criadorId: A.id, autor: dono.id, webhookId: ativo.id, versao: w.updated_at, situacao: "PAUSADO" }));
    let postou = false;
    expect(await entrega.processarEntrega(aula.id, 1, 8, async () => { postou = true; return { status: 200 }; })).toBe("cancelada");
    expect(postou).toBe(false);

    expect((await consultas.entregasDoWebhook(A.id, ativo.id))?.length).toBe(2);
    expect(await consultas.entregasDoWebhook(B.id, ativo.id)).toBeNull();
    // A FK composta recusa entrega de A apontando para webhook de B.
    await expect(db.insert(s.criadores_webhooks_entregas).values({ criador_id: A.id, webhook_id: deB.id, evento: "MATRICULA_CRIADA", payload: mat.payload, modified_by: dono.id })).rejects.toThrow();
  });
});
