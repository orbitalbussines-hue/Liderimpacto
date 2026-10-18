/**
 * Páginas de venda/captura (ADR-0022, RN-240 a RN-242) no PostgreSQL real: permissão, slug único por
 * criador, isolamento A×B, rascunho fora do público, publicar/tirar do ar com trava, referência de outro
 * criador recusada, texto e link do criador validados (só https, vídeo só YouTube/Vimeo por id) e o
 * botão de preço abrindo o checkout da oferta certa com a venda atribuída à página.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhos, cabecalhosLogados, novoCriador, novoUsuario, vincular } from "./_apoio";
import { lojaPronta } from "./_pagamentos";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let acoes: typeof import("@/lib/actions/paginas");
let publico: typeof import("@/lib/paginas/publico");
let config: typeof import("@/lib/paginas/config");
let stripe: typeof import("@/lib/pagamentos/stripe");
let StripeFalso: typeof import("@/lib/pagamentos/stripe-falso").StripeFalso;
let rota: typeof import("@/lib/pagamentos/rota-compra");

beforeAll(async () => {
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  acoes = await import("@/lib/actions/paginas");
  publico = await import("@/lib/paginas/publico");
  config = await import("@/lib/paginas/config");
  stripe = await import("@/lib/pagamentos/stripe");
  StripeFalso = (await import("@/lib/pagamentos/stripe-falso")).StripeFalso;
  rota = await import("@/lib/pagamentos/rota-compra");
});

afterEach(() => stripe.usarGatewayStripe(undefined));

const ok = <T,>(r: { ok: true; dados: T } | { ok: false; erro: string }): T => {
  if (!r.ok) throw new Error(r.erro);
  return r.dados;
};

async function equipeDe(criadorId: string, slug: string, papel: "DONO" | "ADMIN" = "ADMIN") {
  const u = await novoUsuario();
  await vincular(criadorId, u.id, papel);
  req.h = await cabecalhosLogados(u.email, slug);
  return u;
}

describe("páginas — escrita, permissão e isolamento", () => {
  it("slug único por criador; aluno sem permissão; outro criador pode usar o mesmo slug", async () => {
    const A = await novoCriador();
    const B = await novoCriador();
    const aluno = await novoUsuario();
    await vincular(A.id, aluno.id, "ALUNO");
    req.h = await cabecalhosLogados(aluno.email, A.slug);
    expect(await acoes.acaoCriarPagina({ modelo: "VENDA", titulo: "Curso", slug: "curso" })).toEqual({ ok: false, erro: "Sem permissão para esta ação." });

    await equipeDe(A.id, A.slug);
    ok(await acoes.acaoCriarPagina({ modelo: "VENDA", titulo: "Curso", slug: "curso" }));
    expect(await acoes.acaoCriarPagina({ modelo: "CAPTURA", titulo: "Outra", slug: "curso" })).toEqual({ ok: false, erro: "Já existe uma página com este endereço nesta área." });
    expect(await acoes.acaoCriarPagina({ modelo: "CAPTURA", titulo: "Outra", slug: "-ruim" })).toMatchObject({ ok: false, erro: expect.stringMatching(/Endereço/) });

    await equipeDe(B.id, B.slug);
    expect(await acoes.acaoCriarPagina({ modelo: "VENDA", titulo: "Curso B", slug: "curso" })).toMatchObject({ ok: true });
  });

  it("rascunho não é público; publicada só no próprio criador; tirar do ar volta a esconder; trava de versão", async () => {
    const A = await novoCriador();
    const B = await novoCriador();
    await equipeDe(A.id, A.slug);
    const p = ok(await acoes.acaoCriarPagina({ modelo: "CAPTURA", titulo: "Material", slug: "material" }));
    expect(await publico.paginaPublicada(A.id, "material")).toBeNull();

    const pub = ok(await acoes.acaoPublicarPagina({ paginaId: p.id, versao: p.versao }));
    expect(pub.numero).toBe(1);
    expect(await publico.paginaPublicada(A.id, "material")).toMatchObject({ id: p.id });
    expect(await publico.paginaPublicada(B.id, "material")).toBeNull(); // página de A não abre na área de B

    // Rascunho editado NÃO vai ao ar até publicar.
    const [linha] = await db.select().from(s.criadores_paginas).where(eq(s.criadores_paginas.id, p.id));
    const cfg = config.configPaginaSchema.parse(linha.rascunho);
    const capa = cfg.blocos[0];
    if (capa.tipo !== "CAPA") throw new Error("modelo sem capa");
    const editado = { ...cfg, blocos: [{ ...capa, titulo: "Título novo" }, ...cfg.blocos.slice(1)] };
    const salvo = ok(await acoes.acaoSalvarRascunhoPagina({ paginaId: p.id, versao: pub.versao, titulo: "Material", slug: "material", config: editado }));
    const noAr = await publico.paginaPublicada(A.id, "material");
    expect(noAr?.config.blocos[0]).toMatchObject({ titulo: capa.titulo });
    expect(await acoes.acaoSalvarRascunhoPagina({ paginaId: p.id, versao: pub.versao, titulo: "Material", slug: "material", config: editado })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado/) });

    // Equipe de B não mexe na página de A.
    await equipeDe(B.id, B.slug);
    expect(await acoes.acaoDespublicarPagina({ paginaId: p.id, versao: salvo.versao })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado/) });

    await equipeDe(A.id, A.slug);
    ok(await acoes.acaoDespublicarPagina({ paginaId: p.id, versao: salvo.versao }));
    expect(await publico.paginaPublicada(A.id, "material")).toBeNull();
    const trilha = await db.select().from(s.auditoria).where(eq(s.auditoria.registro_id, p.id));
    expect(trilha.map((t) => t.acao).sort()).toEqual(["atualizar", "atualizar", "criar", "publicar"]);
  });

  it("recusa: link que não é https, vídeo de outra origem, campo a mais, imagem/oferta/tag de outro criador; publicar exige a oferta do Preço", async () => {
    const { criador: A } = await lojaPronta();
    const { criador: B, oferta: ofertaB } = await lojaPronta();
    await equipeDe(A.id, A.slug);
    const p = ok(await acoes.acaoCriarPagina({ modelo: "VENDA", titulo: "Vendas", slug: "vendas" }));
    const [linha] = await db.select().from(s.criadores_paginas).where(eq(s.criadores_paginas.id, p.id));
    const cfg = config.configPaginaSchema.parse(linha.rascunho);
    const salvar = (c: unknown) => acoes.acaoSalvarRascunhoPagina({ paginaId: p.id, versao: p.versao, titulo: "Vendas", slug: "vendas", config: c });
    const comCapa = (x: Record<string, unknown>) => ({ ...cfg, blocos: [{ ...cfg.blocos[0], ...x }, ...cfg.blocos.slice(1)] });

    expect(await salvar(comCapa({ botao: { texto: "Ir", acao: "LINK", url: "javascript:alert(1)" } }))).toMatchObject({ ok: false, erro: expect.stringMatching(/https/) });
    expect(await salvar(comCapa({ botao: { texto: "Ir", acao: "LINK", url: "http://exemplo.com" } }))).toMatchObject({ ok: false, erro: expect.stringMatching(/https/) });
    expect(await salvar(comCapa({ midia: { tipo: "VIDEO", provedor: "OUTRO", id: "abc" } }))).toMatchObject({ ok: false });
    expect(await salvar(comCapa({ midia: { tipo: "VIDEO", provedor: "YOUTUBE", id: "<iframe>" } }))).toMatchObject({ ok: false });
    expect(await salvar(comCapa({ midia: { tipo: "IFRAME", src: "https://mal.exemplo" } }))).toMatchObject({ ok: false });
    expect(await salvar(comCapa({ html: "<b>x</b>" }))).toMatchObject({ ok: false });
    expect(await salvar(comCapa({ midia: { tipo: "IMAGEM", arquivoId: crypto.randomUUID() } }))).toMatchObject({ ok: false, erro: expect.stringMatching(/não é desta área/) });

    const preco = cfg.blocos.find((b) => b.tipo === "PRECO")!;
    const comPreco = (ofertaId: string | null) => ({ ...cfg, blocos: cfg.blocos.map((b) => (b.id === preco.id ? { ...b, ofertaId } : b)) });
    expect(await salvar(comPreco(ofertaB.id))).toMatchObject({ ok: false, erro: expect.stringMatching(/não é desta área/) });
    const [tagB] = await db.insert(s.criadores_tags).values({ criador_id: B.id, nome: "Lead B", modified_by: B.id }).returning();
    expect(await salvar({ ...cfg, blocos: [...cfg.blocos, { ...config.blocoSchema.parse({ id: "f1", visivel: true, tipo: "FORMULARIO", titulo: "T", texto: "", textoBotao: "Ok", consentimento: "Aceito receber e-mails.", tagId: tagB.id, sucesso: "Ok" }) }] })).toMatchObject({
      ok: false,
      erro: expect.stringMatching(/não é desta área/),
    });

    // Texto com cara de HTML é aceito COMO TEXTO (o render escapa; ver blocos.test.tsx).
    const v = ok(await salvar(comPreco(null)));
    expect(await acoes.acaoPublicarPagina({ paginaId: p.id, versao: v.versao })).toEqual({ ok: false, erro: "Para publicar, falta: escolha a oferta do bloco Preço." });
  });

  it("excluir libera o slug; página que é etapa de funil não sai", async () => {
    const A = await novoCriador();
    await equipeDe(A.id, A.slug);
    const p = ok(await acoes.acaoCriarPagina({ modelo: "CAPTURA", titulo: "Isca", slug: "isca" }));
    const f = ok(await acoes.acaoCriarFunil({ nome: "Funil isca", etapas: [{ paginaId: p.id, nome: "Captura" }] }));
    expect(await acoes.acaoExcluirPagina({ paginaId: p.id, versao: p.versao })).toMatchObject({ ok: false, erro: expect.stringMatching(/etapa do funil "Funil isca"/) });
    ok(await acoes.acaoExcluirFunil({ funilId: f.id, versao: f.versao }));
    ok(await acoes.acaoExcluirPagina({ paginaId: p.id, versao: p.versao }));
    expect(await acoes.acaoCriarPagina({ modelo: "CAPTURA", titulo: "Isca 2", slug: "isca" })).toMatchObject({ ok: true });
  });
});

describe("páginas — botão de preço e checkout", () => {
  it("o link do Preço abre o Checkout da oferta da página e a venda fica atribuída à página/funil; página de outra área é ignorada", async () => {
    const { criador: A, oferta } = await lojaPronta();
    const { criador: B, oferta: ofertaB } = await lojaPronta();
    await equipeDe(A.id, A.slug);
    const p = ok(await acoes.acaoCriarPagina({ modelo: "VENDA", titulo: "Vendas", slug: "vendas" }));
    const pub = ok(await acoes.acaoPublicarPagina({ paginaId: p.id, versao: p.versao }));
    expect(pub.numero).toBe(1);
    const f = ok(await acoes.acaoCriarFunil({ nome: "Lançamento", etapas: [{ paginaId: p.id, nome: "Vendas" }] }));

    const pagina = (await publico.paginaPublicada(A.id, "vendas"))!;
    const blocoPreco = pagina.config.blocos.find((b) => b.tipo === "PRECO");
    expect(blocoPreco).toMatchObject({ ofertaId: oferta.id }); // o modelo já liga na 1ª oferta ativa
    const { linkDoCheckout } = await import("@/components/paginas/blocos");
    const link = linkDoCheckout(oferta.id, { paginaId: p.id, funilId: f.id, cupom: null, afiliado: null, utm: {}, previa: false });

    const falso = new StripeFalso();
    stripe.usarGatewayStripe(falso);
    const r = await rota.atenderCompra(new Request(`http://${A.slug}.localhost:3011${link}`, { headers: cabecalhos(A.slug) }), stripe.gatewayStripe());
    expect(r.status).toBe(303);
    const [venda] = await db.select().from(s.criadores_vendas).where(eq(s.criadores_vendas.checkout_sessao_id, falso.checkouts[0].id));
    expect(venda.oferta_id).toBe(oferta.id);
    const [clique] = await db.select().from(s.criadores_paginas_checkouts).where(eq(s.criadores_paginas_checkouts.venda_id, venda.id));
    expect(clique).toMatchObject({ criador_id: A.id, pagina_id: p.id, funil_id: f.id });

    // Página de A no link de compra da área B: a compra de B segue, a atribuição à página de A não.
    const r2 = await rota.atenderCompra(new Request(`http://${B.slug}.localhost:3011/api/stripe/checkout?oferta=${ofertaB.id}&pagina=${p.id}&funil=${f.id}`, { headers: cabecalhos(B.slug) }), stripe.gatewayStripe());
    expect(r2.status).toBe(303);
    const [vendaB] = await db.select().from(s.criadores_vendas).where(eq(s.criadores_vendas.checkout_sessao_id, falso.checkouts[1].id));
    expect(vendaB.criador_id).toBe(B.id);
    expect(await db.select().from(s.criadores_paginas_checkouts).where(eq(s.criadores_paginas_checkouts.venda_id, vendaB.id))).toHaveLength(0);
    // Parâmetro lixo não quebra a compra.
    expect((await rota.atenderCompra(new Request(`http://${A.slug}.localhost:3011/api/stripe/checkout?oferta=${oferta.id}&pagina=xyz&funil=1`, { headers: cabecalhos(A.slug) }), stripe.gatewayStripe())).status).toBe(303);
  });
});
