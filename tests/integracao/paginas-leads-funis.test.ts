/**
 * Leads e funis (ADR-0022, RN-243 a RN-247) no PostgreSQL real: formulário público com consentimento,
 * honeypot, teto por IP, tag e consentimento vindos da versão PUBLICADA, nova captura atualiza, lista com
 * descadastrado; visitas anônimas por dia (beacon) e a conversão etapa a etapa com venda atribuída.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhos, cabecalhosLogados, novoCriador, novoUsuario, vincular } from "./_apoio";
import { lojaPronta, sessaoPaga } from "./_pagamentos";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let acoes: typeof import("@/lib/actions/paginas");
let captura: typeof import("@/app/p/[slug]/acoes");
let consultas: typeof import("@/lib/paginas/consultas");
let visita: typeof import("@/lib/paginas/rota-visita");
let config: typeof import("@/lib/paginas/config");
let stripe: typeof import("@/lib/pagamentos/stripe");
let StripeFalso: typeof import("@/lib/pagamentos/stripe-falso").StripeFalso;
let rota: typeof import("@/lib/pagamentos/rota-compra");
let processar: typeof import("@/lib/pagamentos/processar");

beforeAll(async () => {
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  acoes = await import("@/lib/actions/paginas");
  captura = await import("@/app/p/[slug]/acoes");
  consultas = await import("@/lib/paginas/consultas");
  visita = await import("@/lib/paginas/rota-visita");
  config = await import("@/lib/paginas/config");
  stripe = await import("@/lib/pagamentos/stripe");
  StripeFalso = (await import("@/lib/pagamentos/stripe-falso")).StripeFalso;
  rota = await import("@/lib/pagamentos/rota-compra");
  processar = await import("@/lib/pagamentos/processar");
});

afterEach(() => stripe.usarGatewayStripe(undefined));

const ok = <T,>(r: { ok: true; dados: T } | { ok: false; erro: string }): T => {
  if (!r.ok) throw new Error(r.erro);
  return r.dados;
};

/** Página de captura publicada (com tag opcional no formulário). */
async function capturaPublicada(criador: { id: string; slug: string }, slug: string, tagId: string | null = null) {
  const p = ok(await acoes.acaoCriarPagina({ modelo: "CAPTURA", titulo: `Captura ${slug}`, slug }));
  const [linha] = await db.select().from(s.criadores_paginas).where(eq(s.criadores_paginas.id, p.id));
  const cfg = config.configPaginaSchema.parse(linha.rascunho);
  const blocos = cfg.blocos.map((b) => (b.tipo === "FORMULARIO" ? { ...b, tagId, consentimento: "Aceito receber os e-mails da área (versão 1)." } : b));
  const v = ok(await acoes.acaoSalvarRascunhoPagina({ paginaId: p.id, versao: p.versao, titulo: `Captura ${slug}`, slug, config: { ...cfg, blocos } }));
  const pub = ok(await acoes.acaoPublicarPagina({ paginaId: p.id, versao: v.versao }));
  return { id: p.id, versao: pub.versao };
}

const formulario = (campos: Record<string, string>) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(campos)) d.set(k, v);
  return d;
};

describe("leads — formulário público", () => {
  it("grava com consentimento (texto da publicada), tag e UTM; honeypot não grava; sem consentimento recusa; nova captura atualiza", async () => {
    const A = await novoCriador();
    const B = await novoCriador();
    const dono = await novoUsuario();
    await vincular(A.id, dono.id, "DONO");
    req.h = await cabecalhosLogados(dono.email, A.slug);
    const [tag] = await db.insert(s.criadores_tags).values({ criador_id: A.id, nome: "Lead isca", modified_by: dono.id }).returning();
    const p = await capturaPublicada(A, "isca", tag.id);
    const email = `lead-${crypto.randomUUID().slice(0, 8)}@teste.local`;
    const base = { slug: "isca", pagina: p.id, nome: "Maria Souza", email, consentimento: "sim", site: "", utm_source: "instagram", utm_campaign: "outubro" };

    req.h = cabecalhos(A.slug); // visitante, sem sessão
    expect(await captura.enviarCaptura(null, formulario({ ...base, consentimento: "" }))).toEqual({ ok: false, erro: "Marque o consentimento para continuar." });
    expect(await captura.enviarCaptura(null, formulario({ ...base, site: "http://spam" }))).toEqual({ ok: true, proxima: null });
    expect(await db.select().from(s.criadores_leads).where(eq(s.criadores_leads.email, email))).toHaveLength(0);

    expect(await captura.enviarCaptura(null, formulario(base))).toEqual({ ok: true, proxima: null });
    const [lead] = await db.select().from(s.criadores_leads).where(eq(s.criadores_leads.email, email));
    expect(lead).toMatchObject({ criador_id: A.id, nome: "Maria Souza", pagina_id: p.id, tag_id: tag.id, capturas: 1, consentimento_texto: "Aceito receber os e-mails da área (versão 1).", utm: { source: "instagram", campaign: "outubro" } });
    expect(lead.consentimento_em).toBeInstanceOf(Date);

    // Trilha sem o e-mail.
    const [t] = await db.select().from(s.auditoria).where(eq(s.auditoria.registro_id, lead.id));
    expect(t.detalhes).not.toContain(email);
    expect(t.user_id).toBeNull();

    expect(await captura.enviarCaptura(null, formulario({ ...base, nome: "Maria S. Souza", email: email.toUpperCase() }))).toMatchObject({ ok: true });
    const leads = await db.select().from(s.criadores_leads).where(eq(s.criadores_leads.email, email));
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ nome: "Maria S. Souza", capturas: 2 });

    // Página de A pelo host de B, ou rascunho: indisponível.
    req.h = cabecalhos(B.slug);
    expect(await captura.enviarCaptura(null, formulario(base))).toEqual({ ok: false, erro: "Este formulário não está mais disponível." });
  });

  it("teto por IP (10 em 10 min) e lista com descadastrado", async () => {
    const A = await novoCriador();
    const dono = await novoUsuario();
    await vincular(A.id, dono.id, "DONO");
    req.h = await cabecalhosLogados(dono.email, A.slug);
    const p = await capturaPublicada(A, "teto");
    const ip = `10.250.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const enviar = (i: number) => {
      req.h = cabecalhos(A.slug, { "x-real-ip": ip });
      return captura.enviarCaptura(null, formulario({ slug: "teto", pagina: p.id, nome: "Pessoa Teste", email: `teto-${i}-${A.slug}@teste.local`, consentimento: "sim", site: "" }));
    };
    for (let i = 0; i < 10; i++) expect(await enviar(i)).toMatchObject({ ok: true });
    expect(await enviar(10)).toEqual({ ok: false, erro: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });

    const { descadastrar } = await import("@/lib/marketing/descadastro");
    const { hashDoDestinatario } = await import("@/lib/email/disparos");
    await descadastrar(A.id, hashDoDestinatario(`teto-3-${A.slug}@teste.local`), "LINK");
    const lista = await consultas.listarLeads(A.id, { pagina: 1 });
    expect(lista.total).toBe(10);
    expect(lista.linhas.filter((l) => l.descadastrado).map((l) => l.email)).toEqual([`teto-3-${A.slug}@teste.local`]);
    expect((await consultas.listarLeads(A.id, { pagina: 1, busca: "teto-7" })).total).toBe(1);
  });
});

describe("funis — visitas, próxima etapa e conversão", () => {
  it("captura → vendas: visitas por beacon, lead leva à próxima etapa com cupom/UTM, venda paga atribuída, conversão etapa a etapa", async () => {
    const { criador: A, contaId, oferta } = await lojaPronta();
    const { criador: B } = await lojaPronta();
    const dono = await novoUsuario();
    await vincular(A.id, dono.id, "DONO");
    req.h = await cabecalhosLogados(dono.email, A.slug);
    const cap = await capturaPublicada(A, "entrada");
    const v = ok(await acoes.acaoCriarPagina({ modelo: "VENDA", titulo: "Vendas", slug: "oferta" }));
    ok(await acoes.acaoPublicarPagina({ paginaId: v.id, versao: v.versao }));
    expect(await acoes.acaoCriarFunil({ nome: "Funil X", etapas: [{ paginaId: cap.id, nome: "a" }, { paginaId: cap.id, nome: "b" }] })).toMatchObject({ ok: false, erro: expect.stringMatching(/duas etapas/) });
    const f = ok(await acoes.acaoCriarFunil({ nome: "Lançamento", etapas: [{ paginaId: cap.id, nome: "Captura" }, { paginaId: v.id, nome: "Vendas" }] }));

    const bater = (slug: string, corpo: unknown) => visita.atenderVisita(new Request(`http://${slug}.localhost:3011/api/paginas/visita`, { method: "POST", headers: cabecalhos(slug), body: JSON.stringify(corpo) }));
    for (let i = 0; i < 4; i++) expect((await bater(A.slug, { p: cap.id, f: f.id })).status).toBe(204);
    await bater(A.slug, { p: v.id, f: f.id });
    await bater(A.slug, { p: v.id, f: f.id });
    await bater(A.slug, { p: cap.id, f: null }); // fora do funil
    await bater(B.slug, { p: cap.id, f: f.id }); // host de outra área: não conta
    await bater(A.slug, { p: cap.id, f: crypto.randomUUID() }); // funil que não existe: conta fora de funil

    req.h = cabecalhos(A.slug);
    const r = await captura.enviarCaptura(
      null,
      formulario({ slug: "entrada", pagina: cap.id, funil: f.id, cupom: "dez", utm_source: "ads", nome: "João Lima", email: `funil-${A.slug}@teste.local`, consentimento: "sim", site: "" }),
    );
    expect(r).toEqual({ ok: true, proxima: `/p/oferta?funil=${f.id}&cupom=DEZ&utm_source=ads` });
    const [lead] = await db.select().from(s.criadores_leads).where(eq(s.criadores_leads.email, `funil-${A.slug}@teste.local`));
    expect(lead).toMatchObject({ funil_id: f.id, pagina_id: cap.id });

    // Dois cliques no Preço da etapa 2; um vira venda paga.
    const falso = new StripeFalso();
    stripe.usarGatewayStripe(falso);
    const comprar = () => rota.atenderCompra(new Request(`http://${A.slug}.localhost:3011/api/stripe/checkout?oferta=${oferta.id}&pagina=${v.id}&funil=${f.id}`, { headers: cabecalhos(A.slug) }), stripe.gatewayStripe());
    expect((await comprar()).status).toBe(303);
    expect((await comprar()).status).toBe(303);
    await processar.processarEventoStripe(falso, falso.publicarEvento(contaId, "checkout.session.completed", sessaoPaga(falso.checkouts[0].id)).id, contaId);

    const m = (await consultas.metricasDoFunil(A.id, f.id, 30))!;
    expect(m.etapas.map((e) => [e.nome, e.visitas, e.leads, e.cliques, e.vendas])).toEqual([
      ["Captura", 4, 1, 0, 0],
      ["Vendas", 2, 0, 2, 1],
    ]);
    expect(m.etapas[0]).toMatchObject({ daAnterior: null, taxaLead: 25 });
    expect(m.etapas[1]).toMatchObject({ daAnterior: 50, taxaClique: 100, taxaVenda: 50, receitaCentavos: 19700, publicada: true });
    expect(await consultas.metricasDoFunil(B.id, f.id, 30)).toBeNull(); // funil de A pela área B
    const [resumo] = await consultas.listarFunis(A.id);
    expect(resumo).toMatchObject({ nome: "Lançamento", etapas: 2, visitas: 4, leads: 1, vendas: 1 });
    const [naLista] = (await consultas.listarPaginas(A.id)).filter((x) => x.id === cap.id);
    expect(naLista).toMatchObject({ visitas: 6, leads: 1 }); // dentro e fora do funil
  });
});
