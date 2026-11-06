/**
 * Integração Bling (ADR-0024, RN-260 a RN-266) no PostgreSQL real. A API do Bling é um `fetch` simulado
 * por conta (o access token diz de quem é o pedido), com os formatos da documentação; nada sai para a
 * rede. Cobre: aviso assinado aceito / assinatura errada recusada, pedido gravado sem CPF em claro,
 * resgate feliz (ALUNO + matrícula COMPRA + primeiro acesso), segundo resgate recusado, CPF errado =
 * mensagem genérica, busca na API quando o pedido não chegou, cancelamento encerra o acesso, isolamento
 * A×B, teto de tentativas, OAuth (code → tokens, refresh recusado → REAUTORIZAR) e a porta do código.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assinarBling, blingAviso, blingPedido, emailFicticio, numeroLojaFicticio, pedidoBlingId } from "../integracoes/exemplos";
import { cabecalhos, novoCriador, novoUsuario, vincular } from "./_apoio";
import { cursoPronto } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));
const primeiroAcesso = vi.hoisted(() => ({ enviados: [] as string[] }));
vi.mock("@/lib/membros/primeiro-acesso", async (original) => ({
  ...(await original<typeof import("@/lib/membros/primeiro-acesso")>()),
  enviarPrimeiroAcesso: async (para: string) => {
    primeiroAcesso.enviados.push(para);
    return true;
  },
}));

let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let serv: typeof import("@/lib/integracoes/servico");
let receber: typeof import("@/lib/integracoes/receber");
let processar: typeof import("@/lib/integracoes/processar");
let consultas: typeof import("@/lib/integracoes/consultas");
let oauth: typeof import("@/lib/integracoes/bling/oauth");
let api: typeof import("@/lib/integracoes/bling/api");
let cpf: typeof import("@/lib/integracoes/bling/cpf");
let resgate: typeof import("@/lib/integracoes/bling/resgate");
let publico: typeof import("@/lib/resgates/publico");
let acoes: typeof import("@/lib/actions/resgate-publico");
let vouchers: typeof import("@/lib/vouchers/servico");

// ---------- Bling simulado ----------
const URL_API = "https://api.bling.com.br/Api/v3";
/** Pedidos por access token (cada conexão enxerga só a própria conta). */
const contas = new Map<string, Map<string, unknown>>();
const chamadas: { url: string; init?: RequestInit }[] = [];
let respostaToken: () => Response = () => json(400, { error: { type: "invalid_grant" } });
const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

async function blingFalso(entrada: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(entrada instanceof Request ? entrada.url : entrada);
  chamadas.push({ url, init });
  if (url === `${URL_API}/oauth/token`) return respostaToken();
  if (!url.startsWith(`${URL_API}/pedidos/vendas`)) return json(500, {});
  const token = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") ?? "";
  const conta = contas.get(token);
  if (!conta) return json(401, { error: { type: "invalid_token" } });
  const u = new URL(url);
  const id = u.pathname.split("/").at(-1)!;
  if (id !== "vendas") return conta.has(id) ? json(200, conta.get(id)) : json(404, {});
  const numero = u.searchParams.get("numerosLojas[]");
  const achados = [...conta.values()].filter((p) => (p as { data: { numeroLoja: string } }).data.numeroLoja === numero);
  return json(200, { data: achados.map((p) => ({ id: (p as { data: { id: number } }).data.id })) });
}

beforeAll(async () => {
  vi.stubGlobal("fetch", blingFalso);
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  serv = await import("@/lib/integracoes/servico");
  receber = await import("@/lib/integracoes/receber");
  processar = await import("@/lib/integracoes/processar");
  consultas = await import("@/lib/integracoes/consultas");
  oauth = await import("@/lib/integracoes/bling/oauth");
  api = await import("@/lib/integracoes/bling/api");
  cpf = await import("@/lib/integracoes/bling/cpf");
  resgate = await import("@/lib/integracoes/bling/resgate");
  publico = await import("@/lib/resgates/publico");
  acoes = await import("@/lib/actions/resgate-publico");
  vouchers = await import("@/lib/vouchers/servico");
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  chamadas.length = 0;
  primeiroAcesso.enviados.length = 0;
});

const CPF = "529.982.247-25"; // fictício, dígitos válidos
const CPF_DIGITOS = "52998224725";
const CLIENTE = "cliente-ficticio-0001";
const SECRET = "client-secret-ficticio-0001";

/** Criador + DONO + curso + Bling conectado, AUTORIZADO (token na conta simulada) e com o SKU mapeado. */
async function blingConectado(o: { sku?: string; dias?: number | null } = {}) {
  const criador = await novoCriador();
  const dono = await novoUsuario();
  await vincular(criador.id, dono.id, "DONO");
  const { produto } = await cursoPronto(criador.id, { aulas: 1 });
  const integ = await db.transaction((tx) => oauth.conectarBling(tx, { criadorId: criador.id, autor: dono.id, clienteId: CLIENTE, clientSecret: SECRET }));
  const access = `access-${integ.id}`;
  contas.set(access, new Map());
  await db
    .update(s.criadores_integracoes_oauth)
    .set({ situacao: "AUTORIZADA", tokens_cifrados: api.cifrarTokens(integ.id, { access, refresh: `refresh-${integ.id}` }), token_expira_em: new Date(Date.now() + 3_600_000) })
    .where(eq(s.criadores_integracoes_oauth.integracao_id, integ.id));
  await db.transaction((tx) =>
    serv.criarMapeamento(tx, { criadorId: criador.id, autor: dono.id, integracaoId: integ.id, produtoExterno: o.sku ?? "LIVRO-01", nomeExterno: "Livro", produtoIds: [produto.id], diasAcesso: o.dias ?? null }),
  );
  /** Põe (ou muda) o pedido na conta do Bling desta conexão. */
  const noBling = (p: Parameters<typeof blingPedido>[0]) => contas.get(access)!.set(p.pedidoId, blingPedido(p));
  return { criador, dono, produto, integ, access, noBling };
}

async function avisar(integracaoId: string, payload: unknown, segredo = SECRET) {
  const corpo = JSON.stringify(payload);
  const fila: string[] = [];
  const r = await receber.receberEventoIntegracao({ segmento: "bling", integracaoId, corpo, cabecalhos: new Headers({ "x-bling-signature-256": assinarBling(segredo, corpo) }) }, async (ids) => {
    fila.push(...ids);
    return true;
  });
  for (const id of fila) await processar.processarEventoIntegracao(id);
  return { r, fila };
}

const pedidoGravado = async (integracaoId: string, pedidoId: string) =>
  (await db.select().from(s.criadores_integracoes_pedidos).where(and(eq(s.criadores_integracoes_pedidos.integracao_id, integracaoId), eq(s.criadores_integracoes_pedidos.pedido_id, pedidoId))))[0];
const matriculasDe = (produtoId: string) => db.select().from(s.produtos_matriculas).where(eq(s.produtos_matriculas.produto_id, produtoId));

/** Resgate pela action pública, no host do criador (IP aleatório por chamada). */
async function resgatar(slug: string, e: { numeroPedido: string; cpf?: string; nome?: string; email?: string }) {
  req.h = cabecalhos(slug);
  return acoes.acaoResgatarPedido({ numeroPedido: e.numeroPedido, cpf: e.cpf ?? CPF, nome: e.nome ?? "Maria Exemplo", email: e.email ?? emailFicticio() });
}

describe("aviso do Bling", () => {
  it("assinado = 200 e o pedido é relido na API e gravado SEM CPF em claro; assinatura errada = 401", async () => {
    const { criador, integ, noBling } = await blingConectado();
    const pedidoId = pedidoBlingId();
    const numeroLoja = numeroLojaFicticio();
    noBling({ pedidoId, numeroLoja, cpf: CPF });

    const ruim = await avisar(integ.id, blingAviso({ pedidoId, numeroLoja }), "secret-errado-000");
    expect(ruim.r.status).toBe(401);
    expect(ruim.fila).toEqual([]);

    const bom = await avisar(integ.id, blingAviso({ pedidoId, numeroLoja }));
    expect(bom.r.status).toBe(200);
    expect(bom.fila).toHaveLength(1);
    expect(chamadas.some((c) => c.url === `${URL_API}/pedidos/vendas/${pedidoId}`)).toBe(true);
    const p = await pedidoGravado(integ.id, pedidoId);
    expect(p).toMatchObject({ numero_loja: numeroLoja, situacao: "VALIDO", skus: ["LIVRO-01"], cpf_hmac: cpf.hmacDoCpf(criador.id, CPF) });
    expect(JSON.stringify(p)).not.toContain(CPF_DIGITOS);
    const [ev] = await db.select().from(s.criadores_integracoes_eventos).where(eq(s.criadores_integracoes_eventos.id, bom.fila[0]));
    expect(ev.situacao).toBe("PROCESSADO");
    expect(JSON.stringify(ev)).not.toContain(CPF_DIGITOS);
  });
});

describe("resgate público por pedido + CPF", () => {
  it("feliz: conta nova vira ALUNO com matrícula COMPRA bling:<pedido>:<curso> e recebe o primeiro acesso; 2º resgate recusado com o e-mail mascarado", async () => {
    const { criador, integ, produto, noBling } = await blingConectado({ dias: 365 });
    const pedidoId = pedidoBlingId();
    const numeroLoja = numeroLojaFicticio();
    noBling({ pedidoId, numeroLoja, cpf: CPF });
    await avisar(integ.id, blingAviso({ pedidoId, numeroLoja }));

    const email = emailFicticio();
    const r = await resgatar(criador.slug, { numeroPedido: ` ${numeroLoja} `, cpf: CPF, email });
    expect(r).toEqual({ ok: true, dados: { contaNova: true, cursos: 1 } });
    expect(primeiroAcesso.enviados).toEqual([email]);
    const [m] = await matriculasDe(produto.id);
    expect(m).toMatchObject({ origem: "COMPRA", status: "ATIVA", referencia_externa: `bling:${pedidoId}:${produto.id}` });
    expect(m.expira_em!.getTime()).toBeGreaterThan(Date.now() + 364 * 86_400_000);
    const [pessoa] = await db
      .select({ email: s.usuarios.email, papel: s.criadores_membros.papel })
      .from(s.criadores_membros)
      .innerJoin(s.usuarios, eq(s.usuarios.id, s.criadores_membros.usuario_id))
      .where(eq(s.criadores_membros.id, m.membro_id));
    expect(pessoa).toEqual({ email, papel: "ALUNO" });

    const segunda = await resgatar(criador.slug, { numeroPedido: numeroLoja, email: emailFicticio() });
    expect(segunda.ok).toBe(false);
    expect(!segunda.ok && segunda.erro).toContain("já foi resgatado");
    expect(!segunda.ok && segunda.erro).toContain(`(${email.slice(0, 2)}***@`);
    expect(await matriculasDe(produto.id)).toHaveLength(1);

    // Na tela do DONO: resgatado, e-mail mascarado, sem CPF.
    const [linha] = (await consultas.pedidosMarketplace(criador.id)).filter((x) => x.pedidoId === pedidoId);
    expect(linha).toMatchObject({ situacao: "VALIDO", comCpf: true });
    expect(linha.resgatadoPor).not.toBe(email);
    expect(JSON.stringify(linha)).not.toContain(CPF_DIGITOS);
  });

  it("conta que já existe: matrícula sai, sem e-mail de primeiro acesso (entra com a senha de sempre)", async () => {
    const { criador, integ, produto, noBling } = await blingConectado();
    const existente = await novoUsuario();
    const pedidoId = pedidoBlingId();
    const numeroLoja = numeroLojaFicticio();
    noBling({ pedidoId, numeroLoja, cpf: CPF });
    await avisar(integ.id, blingAviso({ pedidoId, numeroLoja }));
    const r = await resgatar(criador.slug, { numeroPedido: numeroLoja, email: existente.email.toUpperCase() });
    expect(r).toEqual({ ok: true, dados: { contaNova: false, cursos: 1 } });
    expect(primeiroAcesso.enviados).toEqual([]);
    expect(await matriculasDe(produto.id)).toHaveLength(1);
  });

  it("CPF errado, número inexistente e SKU sem mapeamento = a MESMA mensagem genérica; nada é criado", async () => {
    const { criador, integ, produto, noBling } = await blingConectado();
    const pedidoId = pedidoBlingId();
    const numeroLoja = numeroLojaFicticio();
    noBling({ pedidoId, numeroLoja, cpf: CPF });
    await avisar(integ.id, blingAviso({ pedidoId, numeroLoja }));
    const semSku = pedidoBlingId();
    const numeroSemSku = numeroLojaFicticio();
    noBling({ pedidoId: semSku, numeroLoja: numeroSemSku, cpf: CPF, skus: ["OUTRO-SKU"] });
    await avisar(integ.id, blingAviso({ pedidoId: semSku, numeroLoja: numeroSemSku }));

    chamadas.length = 0;
    const email = emailFicticio();
    const erros = [
      await resgatar(criador.slug, { numeroPedido: numeroLoja, cpf: "111.444.777-35", email }),
      await resgatar(criador.slug, { numeroPedido: numeroLojaFicticio(), email }),
      await resgatar(criador.slug, { numeroPedido: numeroSemSku, email }),
    ];
    for (const e of erros) expect(e).toEqual({ ok: false, erro: resgate.MSG_RECUSA_PEDIDO });
    // CPF errado num número que JÁ está aqui não consulta a API; número desconhecido consulta UMA vez.
    expect(chamadas.filter((c) => c.url.includes("numerosLojas")).length).toBe(1);
    expect(await matriculasDe(produto.id)).toHaveLength(0);
    expect(await db.select().from(s.usuarios).where(eq(s.usuarios.email, email))).toHaveLength(0);
    const trilha = await db.select().from(s.auditoria).where(and(eq(s.auditoria.criador_id, criador.id), eq(s.auditoria.acao, "acesso_negado")));
    expect(trilha.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(trilha)).not.toContain(CPF_DIGITOS);
    expect(JSON.stringify(trilha)).not.toContain("11144477735");
  });

  it("pedido que o aviso não trouxe: UMA busca pelo número na API, grava e libera", async () => {
    const { criador, produto, noBling } = await blingConectado();
    const pedidoId = pedidoBlingId();
    const numeroLoja = numeroLojaFicticio();
    noBling({ pedidoId, numeroLoja, cpf: CPF }); // está no Bling, mas o aviso nunca chegou
    const r = await resgatar(criador.slug, { numeroPedido: numeroLoja });
    expect(r).toEqual({ ok: true, dados: { contaNova: true, cursos: 1 } });
    expect(chamadas.filter((c) => c.url.includes("numerosLojas")).length).toBe(1);
    expect((await matriculasDe(produto.id))[0].referencia_externa).toBe(`bling:${pedidoId}:${produto.id}`);
  });

  it("pedido cancelado no Bling encerra SÓ o acesso daquele pedido; excluído também", async () => {
    const { criador, integ, produto, noBling } = await blingConectado();
    const [p1, p2] = [pedidoBlingId(), pedidoBlingId()];
    const [n1, n2] = [numeroLojaFicticio(), numeroLojaFicticio()];
    noBling({ pedidoId: p1, numeroLoja: n1, cpf: CPF });
    noBling({ pedidoId: p2, numeroLoja: n2, cpf: "111.444.777-35" });
    await avisar(integ.id, blingAviso({ pedidoId: p1, numeroLoja: n1 }));
    await avisar(integ.id, blingAviso({ pedidoId: p2, numeroLoja: n2 }));
    expect((await resgatar(criador.slug, { numeroPedido: n1 })).ok).toBe(true);
    expect((await resgatar(criador.slug, { numeroPedido: n2, cpf: "111.444.777-35" })).ok).toBe(true);

    noBling({ pedidoId: p1, numeroLoja: n1, cpf: CPF, situacao: 2 });
    // O conteúdo do aviso não decide: mesmo dizendo "1", vale o que a API devolve (2 = cancelado).
    await avisar(integ.id, blingAviso({ evento: "order.updated", pedidoId: p1, numeroLoja: n1, situacao: 1 }));
    const ms = await matriculasDe(produto.id);
    expect(ms.find((m) => m.referencia_externa === `bling:${p1}:${produto.id}`)).toMatchObject({ status: "CANCELADA", motivo_cancelamento: "Pedido cancelado no Bling" });
    expect(ms.find((m) => m.referencia_externa === `bling:${p2}:${produto.id}`)!.status).toBe("ATIVA");
    expect((await pedidoGravado(integ.id, p1)).situacao).toBe("CANCELADO");

    contas.get(`access-${integ.id}`)!.delete(p2);
    await avisar(integ.id, blingAviso({ evento: "order.deleted", pedidoId: p2 }));
    expect((await matriculasDe(produto.id)).find((m) => m.referencia_externa === `bling:${p2}:${produto.id}`)).toMatchObject({ status: "CANCELADA", motivo_cancelamento: "Pedido excluído no Bling" });
  });

  it("isolamento: o pedido de A não resgata no endereço de B, nem aparece para B", async () => {
    const A = await blingConectado();
    const B = await blingConectado();
    const pedidoId = pedidoBlingId();
    const numeroLoja = numeroLojaFicticio();
    A.noBling({ pedidoId, numeroLoja, cpf: CPF });
    await avisar(A.integ.id, blingAviso({ pedidoId, numeroLoja }));
    // Aviso de A entregue na URL de B (assinado com o secret de B): B relê na conta DELE e não acha.
    await avisar(B.integ.id, blingAviso({ pedidoId, numeroLoja }));
    expect(await pedidoGravado(B.integ.id, pedidoId)).toBeUndefined();
    expect(await resgatar(B.criador.slug, { numeroPedido: numeroLoja })).toEqual({ ok: false, erro: resgate.MSG_RECUSA_PEDIDO });
    expect((await consultas.pedidosMarketplace(B.criador.id)).map((x) => x.pedidoId)).not.toContain(pedidoId);
    expect(await matriculasDe(B.produto.id)).toHaveLength(0);
    expect((await resgatar(A.criador.slug, { numeroPedido: numeroLoja })).ok).toBe(true);
  });

  it("teto persistido: a 6ª tentativa no mesmo pedido (IPs diferentes) é barrada antes de conferir", async () => {
    const { criador } = await blingConectado();
    const numeroLoja = numeroLojaFicticio();
    const r = [];
    for (let i = 0; i < 6; i++) r.push(await resgatar(criador.slug, { numeroPedido: numeroLoja }));
    expect(r.slice(0, 5).every((x) => !x.ok && x.erro === resgate.MSG_RECUSA_PEDIDO)).toBe(true);
    expect(r[5]).toEqual({ ok: false, erro: publico.MSG_TETO_RESGATE });
  });
});

describe("OAuth do Bling", () => {
  it("code → tokens cifrados (Basic client_id:secret, enable-jwt), AUTORIZADA; state de outra sessão recusa", async () => {
    const criador = await novoCriador();
    const dono = await novoUsuario();
    await vincular(criador.id, dono.id, "DONO");
    const integ = await db.transaction((tx) => oauth.conectarBling(tx, { criadorId: criador.id, autor: dono.id, clienteId: CLIENTE, clientSecret: SECRET }));
    const agora = new Date();
    const url = new URL(await oauth.urlDeAutorizacao({ criadorId: criador.id, integracaoId: integ.id, sessaoId: "sessao-1", usuarioId: dono.id, agora }));
    expect(url.searchParams.get("client_id")).toBe(CLIENTE);
    const estado = url.searchParams.get("state")!;

    await expect(oauth.concluirAutorizacaoBling({ criadorId: criador.id, usuarioId: dono.id, sessaoId: "outra-sessao", code: "codigo1", estado, agora })).rejects.toThrow("outra sessão");
    respostaToken = () => json(200, { access_token: "jwt-access-0001", expires_in: 21600, token_type: "Bearer", scope: "x", refresh_token: "refresh-0001" });
    await oauth.concluirAutorizacaoBling({ criadorId: criador.id, usuarioId: dono.id, sessaoId: "sessao-1", code: "codigo1", estado, agora });
    const pedido = chamadas.find((c) => c.url.endsWith("/oauth/token"))!;
    const h = new Headers(pedido.init?.headers);
    expect(h.get("authorization")).toBe(`Basic ${Buffer.from(`${CLIENTE}:${SECRET}`).toString("base64")}`);
    expect(h.get("enable-jwt")).toBe("1");
    expect(String(pedido.init?.body)).toBe("grant_type=authorization_code&code=codigo1");
    const [o] = await db.select().from(s.criadores_integracoes_oauth).where(eq(s.criadores_integracoes_oauth.integracao_id, integ.id));
    expect(o).toMatchObject({ situacao: "AUTORIZADA", erro: null });
    expect(o.tokens_cifrados).not.toContain("jwt-access-0001");
    expect((await consultas.autorizacaoBling(criador.id))!.situacao).toBe("AUTORIZADA");
  });

  it("renovação: sem refresh novo mantém o antigo; refresh recusado vira REAUTORIZAR", async () => {
    const { integ } = await blingConectado();
    respostaToken = () => json(200, { access_token: "jwt-novo", expires_in: 21600, token_type: "Bearer" });
    expect(await api.tokenDeAcesso(integ.id, true)).toBe("jwt-novo");
    chamadas.length = 0;
    expect(await api.tokenDeAcesso(integ.id, true)).toBe("jwt-novo");
    expect(String(chamadas[0].init?.body)).toBe(`grant_type=refresh_token&refresh_token=refresh-${integ.id}`);

    respostaToken = () => json(400, { error: { type: "invalid_grant" } });
    await expect(api.tokenDeAcesso(integ.id, true)).rejects.toThrow(api.MSG_AUTORIZAR_BLING);
    const [o] = await db.select().from(s.criadores_integracoes_oauth).where(eq(s.criadores_integracoes_oauth.integracao_id, integ.id));
    expect(o.situacao).toBe("REAUTORIZAR");
    expect(o.erro).toContain("invalid_grant");
  });
});

describe("resgate público por código (voucher, ex.: Amazon)", () => {
  it("conta nova recebe o primeiro acesso; código esgotado ou errado = mesma recusa e nenhuma conta nasce", async () => {
    const criador = await novoCriador();
    const dono = await novoUsuario();
    await vincular(criador.id, dono.id, "DONO");
    const { produto } = await cursoPronto(criador.id, { aulas: 1 });
    const v = await db.transaction((tx) =>
      vouchers.criarVoucher(tx, { criadorId: criador.id, autor: dono.id, codigo: null, descricao: "", validoAte: null, limiteUsos: 1, limitePorPessoa: 1, diasAcesso: null, produtoIds: [produto.id] }),
    );
    const email = emailFicticio();
    req.h = cabecalhos(criador.slug);
    expect(await acoes.acaoResgatarCodigo({ codigo: v.codigo.toLowerCase(), nome: "Ana Exemplo", email })).toEqual({ ok: true, dados: { contaNova: true, cursos: 1 } });
    expect(primeiroAcesso.enviados).toEqual([email]);
    expect(await matriculasDe(produto.id)).toHaveLength(1);

    const outro = emailFicticio();
    for (const codigo of [v.codigo, "ZZZZ9999"]) {
      req.h = cabecalhos(criador.slug);
      expect(await acoes.acaoResgatarCodigo({ codigo, nome: "Bia Exemplo", email: outro })).toEqual({ ok: false, erro: publico.MSG_RECUSA_CODIGO });
    }
    expect(await db.select().from(s.usuarios).where(eq(s.usuarios.email, outro))).toHaveLength(0);
    expect(await matriculasDe(produto.id)).toHaveLength(1);
  });

  it("no apex não há resgate", async () => {
    req.h = cabecalhos(null);
    expect(await acoes.acaoResgatarCodigo({ codigo: "ABCD2345", nome: "Ana Exemplo", email: emailFicticio() })).toEqual({ ok: false, erro: "Este endereço não aceita resgates." });
  });
});
