/**
 * Integrações Hotmart e Eduzz (ADR-0021, RN-230 a RN-236) no PostgreSQL real, com payloads de exemplo
 * das documentações (anonimizados, tests/integracoes/exemplos.ts). Nada sai para a rede: a fila é
 * injetada e o worker é chamado direto. Cobre: token errado recusado, mesmo evento 2× = 1 matrícula,
 * comprador novo vira ALUNO, reembolso encerra, sem mapeamento fica guardado e reprocessa, assinatura,
 * isolamento A×B e permissão por action.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { assinarEduzz, eduzzContrato, eduzzFatura, hotmartAssinaturaCancelada, hotmartCompra, transacaoHotmart } from "../integracoes/exemplos";
import { cabecalhosLogados, novoCriador, novoUsuario, vincular } from "./_apoio";
import { cursoPronto } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let serv: typeof import("@/lib/integracoes/servico");
let receber: typeof import("@/lib/integracoes/receber");
let processar: typeof import("@/lib/integracoes/processar");
let consultas: typeof import("@/lib/integracoes/consultas");
let acoes: typeof import("@/lib/actions/integracoes");

beforeAll(async () => {
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  serv = await import("@/lib/integracoes/servico");
  receber = await import("@/lib/integracoes/receber");
  processar = await import("@/lib/integracoes/processar");
  consultas = await import("@/lib/integracoes/consultas");
  acoes = await import("@/lib/actions/integracoes");
});

const HOTTOK = "hottok-ficticio-de-teste-0001";
const CHAVE_EDUZZ = "chave-eduzz-ficticia-0001";

/** Criador + DONO + curso + conexão (Hotmart ou Eduzz) já mapeada (produto externo → curso). */
async function areaConectada(plataforma: "HOTMART" | "EDUZZ" = "HOTMART", o: { mapear?: string | null; dias?: number | null } = {}) {
  const criador = await novoCriador();
  const dono = await novoUsuario();
  await vincular(criador.id, dono.id, "DONO");
  const { produto } = await cursoPronto(criador.id, { aulas: 1 });
  const segredo = plataforma === "HOTMART" ? HOTTOK : CHAVE_EDUZZ;
  const integ = await db.transaction((tx) => serv.conectarIntegracao(tx, { criadorId: criador.id, autor: dono.id, plataforma, segredo }));
  const externo = o.mapear === undefined ? (plataforma === "HOTMART" ? "1000001" : "P567") : o.mapear;
  if (externo) {
    await db.transaction((tx) => serv.criarMapeamento(tx, { criadorId: criador.id, autor: dono.id, integracaoId: integ.id, produtoExterno: externo, nomeExterno: "Produto externo", produtoIds: [produto.id], diasAcesso: o.dias ?? null }));
  }
  return { criador, dono, produto, integ };
}

/** Entrega como a plataforma faria e devolve a resposta e os ids enfileirados. */
async function entregar(plataforma: "HOTMART" | "EDUZZ", integracaoId: string, payload: unknown, segredo?: string) {
  const corpo = JSON.stringify(payload);
  const cabecalhos = new Headers(
    plataforma === "HOTMART" ? { "x-hotmart-hottok": segredo ?? HOTTOK } : { "x-signature": assinarEduzz(segredo ?? CHAVE_EDUZZ, corpo) },
  );
  const fila: string[] = [];
  const r = await receber.receberEventoIntegracao({ segmento: plataforma.toLowerCase(), integracaoId, corpo, cabecalhos }, async (ids) => {
    fila.push(...ids);
    return true;
  });
  return { r, fila };
}

/** Um por vez, como o worker (concorrência 1). */
async function processarTodos(ids: string[]) {
  const r: string[] = [];
  for (const id of ids) r.push(await processar.processarEventoIntegracao(id));
  return r;
}
const matriculasDe = (produtoId: string) => db.select().from(s.produtos_matriculas).where(eq(s.produtos_matriculas.produto_id, produtoId));
const evento = async (id: string) => (await db.select().from(s.criadores_integracoes_eventos).where(eq(s.criadores_integracoes_eventos.id, id)))[0];
const recibosDe = (integracaoId: string) => db.select().from(s.integracoes_recibos).where(eq(s.integracoes_recibos.integracao_id, integracaoId));

describe("recepção do webhook", () => {
  it("token errado e assinatura errada = 401 + recibo RECUSADO; conexão inexistente ou de outra plataforma = 404", async () => {
    const { integ } = await areaConectada("HOTMART");
    const e = await areaConectada("EDUZZ");
    expect((await entregar("HOTMART", integ.id, hotmartCompra(), "hottok-errado-123")).r.status).toBe(401);
    expect((await entregar("EDUZZ", e.integ.id, eduzzFatura(), "chave-errada-123")).r.status).toBe(401);
    expect((await entregar("EDUZZ", integ.id, eduzzFatura())).r.status).toBe(404);
    expect((await entregar("HOTMART", "00000000-0000-4000-8000-000000000000", hotmartCompra())).r.status).toBe(404);
    expect((await receber.receberEventoIntegracao({ segmento: "kiwify", integracaoId: integ.id, corpo: "{}", cabecalhos: new Headers() })).status).toBe(404);
    const rs = await recibosDe(integ.id);
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ recusa: "TOKEN_INVALIDO", evento_id: null });
    expect(await db.select().from(s.criadores_integracoes_eventos).where(eq(s.criadores_integracoes_eventos.criador_id, rs[0].criador_id))).toHaveLength(0);
    // corpo fora do formato com token certo = 400 + FORMATO_INVALIDO
    expect((await entregar("HOTMART", integ.id, { ola: "mundo" })).r.status).toBe(400);
    expect((await recibosDe(integ.id)).map((r) => r.recusa).sort()).toEqual(["FORMATO_INVALIDO", "TOKEN_INVALIDO"]);
  });

  it("mesmo evento 2× = 1 recibo e 1 matrícula; comprador novo vira conta + ALUNO; recibo e linha sem e-mail depois de processar", async () => {
    const { criador, produto, integ } = await areaConectada("HOTMART");
    const payload = hotmartCompra({ transacao: "HP0000000001" });
    const primeira = await entregar("HOTMART", integ.id, payload);
    const segunda = await entregar("HOTMART", integ.id, payload);
    expect(primeira.r.status).toBe(200);
    expect(segunda.r.status).toBe(200);
    expect(primeira.fila).toHaveLength(1);
    expect(segunda.fila).toEqual(primeira.fila); // ainda PENDENTE: re-enfileira o mesmo (jobId não duplica)
    const rs = await recibosDe(integ.id);
    expect(rs).toHaveLength(1);
    expect(JSON.stringify(rs[0])).not.toContain(payload.data.buyer.email);

    expect(await processarTodos(primeira.fila)).toEqual(["PROCESSADO"]);
    expect(await processar.processarEventoIntegracao(primeira.fila[0])).toBe("nada");
    expect((await entregar("HOTMART", integ.id, payload)).fila).toEqual([]); // já processado: nada a enfileirar

    const ms = await matriculasDe(produto.id);
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ origem: "COMPRA", status: "ATIVA", expira_em: null, referencia_externa: `hotmart:HP0000000001:${produto.id}` });
    const [pessoa] = await db
      .select({ email: s.usuarios.email, nome: s.usuarios.nome, papel: s.criadores_membros.papel })
      .from(s.criadores_membros)
      .innerJoin(s.usuarios, eq(s.usuarios.id, s.criadores_membros.usuario_id))
      .where(and(eq(s.criadores_membros.id, ms[0].membro_id), eq(s.criadores_membros.criador_id, criador.id)));
    expect(pessoa).toEqual({ email: payload.data.buyer.email, nome: "Maria Exemplo", papel: "ALUNO" });
    expect(await evento(primeira.fila[0])).toMatchObject({ situacao: "PROCESSADO", comprador_email: null, comprador_nome: null, membro_id: ms[0].membro_id });
    // A mesma transação chegando como PURCHASE_COMPLETE (fim da garantia) não duplica.
    const completa = await entregar("HOTMART", integ.id, hotmartCompra({ evento: "PURCHASE_COMPLETE", transacao: "HP0000000001", email: payload.data.buyer.email }));
    await processarTodos(completa.fila);
    expect(await matriculasDe(produto.id)).toHaveLength(1);
  });

  it("reembolso e chargeback encerram o acesso daquela compra; aprovação que chega depois do reembolso é ignorada", async () => {
    const { produto, integ } = await areaConectada("HOTMART", { dias: 30 });
    const t = transacaoHotmart();
    const aprovada = hotmartCompra({ transacao: t });
    await processarTodos((await entregar("HOTMART", integ.id, aprovada)).fila);
    const [m] = await matriculasDe(produto.id);
    expect(m.expira_em!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    const reembolso = await entregar("HOTMART", integ.id, hotmartCompra({ evento: "PURCHASE_REFUNDED", transacao: t, email: aprovada.data.buyer.email }));
    expect(await processarTodos(reembolso.fila)).toEqual(["PROCESSADO"]);
    expect((await matriculasDe(produto.id))[0]).toMatchObject({ status: "CANCELADA", motivo_cancelamento: "Reembolso na Hotmart" });

    // Fora de ordem: o chargeback chega e a aprovação (outra transação) só depois.
    const t2 = transacaoHotmart();
    const outra = await areaConectada("HOTMART");
    await processarTodos((await entregar("HOTMART", outra.integ.id, hotmartCompra({ evento: "PURCHASE_CHARGEBACK", transacao: t2 }))).fila);
    const tarde = await entregar("HOTMART", outra.integ.id, hotmartCompra({ transacao: t2 }));
    expect(await processarTodos(tarde.fila)).toEqual(["IGNORADO"]);
    expect(await matriculasDe(outra.produto.id)).toHaveLength(0);
  });

  it("produto sem mapeamento fica guardado (com o comprador), aparece na tela e reprocessa depois de mapear", async () => {
    const { criador, dono, produto, integ } = await areaConectada("HOTMART", { mapear: null });
    const payload = hotmartCompra({ produtoId: 777 });
    const { fila } = await entregar("HOTMART", integ.id, payload);
    expect(await processarTodos(fila)).toEqual(["SEM_MAPEAMENTO"]);
    const guardado = await evento(fila[0]);
    expect(guardado).toMatchObject({ situacao: "SEM_MAPEAMENTO", comprador_email: payload.data.buyer.email });
    const [naTela] = await consultas.eventosRecentes(criador.id);
    expect(naTela).toMatchObject({ situacao: "SEM_MAPEAMENTO", produtoExterno: "777", tipo: "COMPRA_APROVADA" });
    expect(naTela.pessoa).not.toBe(payload.data.buyer.email);
    expect(naTela.pessoa).toMatch(/\*\*\*@/);

    await db.transaction((tx) => serv.criarMapeamento(tx, { criadorId: criador.id, autor: dono.id, integracaoId: integ.id, produtoExterno: "777", nomeExterno: null, produtoIds: [produto.id], diasAcesso: null }));
    req.h = await cabecalhosLogados(dono.email, criador.slug);
    const r = await acoes.acaoReprocessarEventoIntegracao({ eventoId: fila[0], versao: guardado.updated_at.toISOString() });
    expect(r.ok).toBe(true);
    expect((await evento(fila[0])).situacao).toBe("PENDENTE");
    expect(await processarTodos(fila)).toEqual(["PROCESSADO"]);
    expect(await matriculasDe(produto.id)).toHaveLength(1);
    // Processado não reprocessa.
    const depois = await evento(fila[0]);
    expect(await acoes.acaoReprocessarEventoIntegracao({ eventoId: fila[0], versao: depois.updated_at.toISOString() })).toMatchObject({ ok: false });
  });

  it("assinatura Hotmart: acesso até a próxima cobrança + 3 dias, renovação estende a MESMA matrícula, cancelamento limita ao período pago, atrasada não corta", async () => {
    const { produto, integ } = await areaConectada("HOTMART");
    const email = "assinante@teste.local".replace("assinante", `assinante-${Date.now()}`);
    const p1 = new Date(Date.now() + 30 * 86_400_000);
    await processarTodos((await entregar("HOTMART", integ.id, hotmartCompra({ assinante: "SUB00001", proximaCobranca: p1, email }))).fila);
    const [m1] = await matriculasDe(produto.id);
    expect(m1.referencia_externa).toBe(`hotmart-assinatura:SUB00001:${produto.id}`);
    expect(m1.expira_em!.getTime()).toBe(p1.getTime() + 3 * 86_400_000);
    const p2 = new Date(Date.now() + 60 * 86_400_000);
    await processarTodos((await entregar("HOTMART", integ.id, hotmartCompra({ assinante: "SUB00001", proximaCobranca: p2, email }))).fila);
    const ms = await matriculasDe(produto.id);
    expect(ms).toHaveLength(1);
    expect(ms[0].expira_em!.getTime()).toBe(p2.getTime() + 3 * 86_400_000);
    expect(await processarTodos((await entregar("HOTMART", integ.id, hotmartCompra({ evento: "PURCHASE_DELAYED", assinante: "SUB00001", email }))).fila)).toEqual(["IGNORADO"]);
    await processarTodos((await entregar("HOTMART", integ.id, hotmartAssinaturaCancelada({ assinante: "SUB00001", proximaCobranca: p2 }))).fila);
    expect((await matriculasDe(produto.id))[0]).toMatchObject({ status: "ATIVA", expira_em: p2 });
  });

  it("Eduzz: assinatura conferida, um recibo por produto, contrato cancelado encerra", async () => {
    const { produto, integ, criador, dono } = await areaConectada("EDUZZ");
    const { produto: bump } = await cursoPronto(criador.id, { aulas: 1 });
    await db.transaction((tx) => serv.criarMapeamento(tx, { criadorId: criador.id, autor: dono.id, integracaoId: integ.id, produtoExterno: "P789", nomeExterno: null, produtoIds: [bump.id], diasAcesso: 33 }));
    const fatura = eduzzFatura({ faturaId: "12345678", itens: [{ productId: "P567", billingType: "recurrence" }, { productId: "P789", isBump: true, billingType: "recurrence" }], contratoId: "C77" });
    const { r, fila } = await entregar("EDUZZ", integ.id, fatura);
    expect(r.status).toBe(200);
    expect(await processarTodos(fila)).toEqual(["PROCESSADO", "PROCESSADO"]);
    expect((await matriculasDe(produto.id))[0]).toMatchObject({ referencia_externa: `eduzz-assinatura:C77:${produto.id}`, expira_em: null });
    expect((await matriculasDe(bump.id))[0].expira_em).not.toBeNull();
    await processarTodos((await entregar("EDUZZ", integ.id, eduzzContrato({ contratoId: "C77", status: "canceled" }))).fila);
    expect((await matriculasDe(produto.id))[0].status).toBe("CANCELADA");
    expect((await matriculasDe(bump.id))[0].status).toBe("CANCELADA");
    // ping da ativação: autenticado, registrado como ignorado, nada na fila.
    const ping = await entregar("EDUZZ", integ.id, { id: "l927c4root16a9zvq8v78lcr6", event: "ping", data: { message: "ping" }, sentDate: new Date().toISOString() });
    expect(ping).toMatchObject({ r: { status: 200 }, fila: [] });
  });
});

describe("isolamento e permissão", () => {
  it("A×B: o token de A não abre a URL de B; B não mapeia curso de A nem reprocessa evento de A; A não vê os eventos de B", async () => {
    const A = await areaConectada("HOTMART", { mapear: null });
    const B = await areaConectada("HOTMART");
    await db.transaction((tx) => serv.trocarSegredoIntegracao(tx, { criadorId: B.criador.id, autor: B.dono.id, integracaoId: B.integ.id, versao: B.integ.versao, segredo: "hottok-de-b-0002" }));
    expect((await entregar("HOTMART", B.integ.id, hotmartCompra())).r.status).toBe(401);
    const { fila } = await entregar("HOTMART", A.integ.id, hotmartCompra());
    await processarTodos(fila);
    await expect(
      db.transaction((tx) => serv.criarMapeamento(tx, { criadorId: B.criador.id, autor: B.dono.id, integracaoId: B.integ.id, produtoExterno: "X1", nomeExterno: null, produtoIds: [A.produto.id], diasAcesso: null })),
    ).rejects.toThrow("Curso inválido");
    await expect(
      db.transaction((tx) => serv.criarMapeamento(tx, { criadorId: B.criador.id, autor: B.dono.id, integracaoId: A.integ.id, produtoExterno: "X1", nomeExterno: null, produtoIds: [B.produto.id], diasAcesso: null })),
    ).rejects.toThrow("Integração não encontrada");
    const ev = await evento(fila[0]);
    req.h = await cabecalhosLogados(B.dono.email, B.criador.slug);
    expect(await acoes.acaoReprocessarEventoIntegracao({ eventoId: ev.id, versao: ev.updated_at.toISOString() })).toMatchObject({ ok: false });
    expect((await evento(fila[0])).situacao).toBe("SEM_MAPEAMENTO");
    expect((await consultas.eventosRecentes(B.criador.id)).some((e) => e.eventoId === ev.id)).toBe(false);
    expect(await consultas.integracoesDoCriador(B.criador.id)).toHaveLength(1);
    expect(JSON.stringify(await consultas.integracoesDoCriador(B.criador.id))).not.toContain("hottok");
  });

  it("só o DONO: ADMIN e ALUNO recebem 'Sem permissão' em toda action", async () => {
    const { criador, integ, produto } = await areaConectada("HOTMART");
    const [mapa] = await consultas.mapeamentosDoCriador(criador.id);
    const v = integ.versao.toISOString();
    const chamadas = [
      () => acoes.acaoConectarIntegracao({ plataforma: "EDUZZ", segredo: "chave-qualquer-123" }),
      () => acoes.acaoTrocarSegredoIntegracao({ integracaoId: integ.id, versao: v, segredo: "outro-token-123" }),
      () => acoes.acaoDesconectarIntegracao({ integracaoId: integ.id, versao: v }),
      () => acoes.acaoCriarMapeamento({ integracaoId: integ.id, produtoExterno: "9", produtoIds: [produto.id], diasAcesso: null }),
      () => acoes.acaoExcluirMapeamento({ mapeamentoId: mapa.id, versao: mapa.versao.toISOString() }),
      () => acoes.acaoReprocessarEventoIntegracao({ eventoId: integ.id, versao: v }),
    ];
    for (const papel of ["ADMIN", "ALUNO"] as const) {
      const u = await novoUsuario();
      await vincular(criador.id, u.id, papel);
      req.h = await cabecalhosLogados(u.email, criador.slug);
      for (const c of chamadas) expect(await c()).toMatchObject({ ok: false, erro: "Sem permissão para esta ação." });
    }
    expect(await consultas.integracoesDoCriador(criador.id)).toHaveLength(1);
  });

  it("DONO: conecta Eduzz (URL própria), recusa 2ª conexão da mesma plataforma, troca o token e desconecta (URL vira 404)", async () => {
    const { criador, dono } = await areaConectada("HOTMART");
    req.h = await cabecalhosLogados(dono.email, criador.slug);
    const r = await acoes.acaoConectarIntegracao({ plataforma: "EDUZZ", segredo: CHAVE_EDUZZ });
    if (!r.ok) throw new Error(r.erro);
    expect(r.dados.url).toBe(`http://localhost:3011/api/integracoes/eduzz/${r.dados.id}`);
    expect(await acoes.acaoConectarIntegracao({ plataforma: "EDUZZ", segredo: CHAVE_EDUZZ })).toMatchObject({ ok: false, erro: "A Eduzz já está conectada nesta área." });
    const t = await acoes.acaoTrocarSegredoIntegracao({ integracaoId: r.dados.id, versao: r.dados.versao, segredo: "chave-nova-eduzz-02" });
    if (!t.ok) throw new Error(t.erro);
    expect((await entregar("EDUZZ", r.dados.id, eduzzFatura(), CHAVE_EDUZZ)).r.status).toBe(401);
    expect((await entregar("EDUZZ", r.dados.id, eduzzFatura({ itens: [{ productId: "SEMMAPA" }] }), "chave-nova-eduzz-02")).r.status).toBe(200);
    expect(await acoes.acaoDesconectarIntegracao({ integracaoId: r.dados.id, versao: t.dados.versao })).toMatchObject({ ok: true });
    expect((await entregar("EDUZZ", r.dados.id, eduzzFatura(), "chave-nova-eduzz-02")).r.status).toBe(404);
    // A trilha não guarda o token (só os 4 finais).
    const trilha = await db.select({ d: s.auditoria.detalhes, n: s.auditoria.dados_novos }).from(s.auditoria).where(eq(s.auditoria.registro_id, r.dados.id));
    expect(JSON.stringify(trilha)).not.toContain(CHAVE_EDUZZ);
    expect(JSON.stringify(trilha)).not.toContain("chave-nova-eduzz-02");
  });
});
