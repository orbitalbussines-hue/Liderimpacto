/**
 * Leads nas campanhas e automações (ADR-0023, RN-250 a RN-254) no PostgreSQL real + Redis: envio para
 * LEAD, segmentos de lead, dedupe pelo HMAC (lead que é aluno recebe 1x, como membro), descadastro,
 * isolamento A×B, métricas/clique/abertura/descadastro do envio de lead, automação "cadastro numa página"
 * (1x por lead, filtro de página, tag NO lead) e a exportação CSV (permissão, trilha sem e-mail, fórmula
 * neutralizada). Provedor FALSO: nada sai de verdade.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhos, cabecalhosLogados, novoCriador } from "./_apoio";
import { conteudo, hostDe, provedorFalso } from "./_marketing";
import { membroCom } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let camp: typeof import("@/lib/marketing/campanhas");
let envio: typeof import("@/lib/marketing/envio");
let publico: typeof import("@/lib/marketing/publico");
let consultas: typeof import("@/lib/marketing/consultas");
let rotas: typeof import("@/lib/marketing/rotas");
let tokens: typeof import("@/lib/marketing/tokens");
let provedor: typeof import("@/lib/marketing/provedor");
let autos: typeof import("@/lib/marketing/automacoes");
let execucoes: typeof import("@/lib/marketing/execucoes");
let exportar: typeof import("@/lib/paginas/exportar-leads");
let acoesPag: typeof import("@/lib/actions/paginas");
let captura: typeof import("@/app/p/[slug]/acoes");
let config: typeof import("@/lib/paginas/config");
let hash: (email: string) => string;

beforeAll(async () => {
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  camp = await import("@/lib/marketing/campanhas");
  envio = await import("@/lib/marketing/envio");
  publico = await import("@/lib/marketing/publico");
  consultas = await import("@/lib/marketing/consultas");
  rotas = await import("@/lib/marketing/rotas");
  tokens = await import("@/lib/marketing/tokens");
  provedor = await import("@/lib/marketing/provedor");
  autos = await import("@/lib/marketing/automacoes");
  execucoes = await import("@/lib/marketing/execucoes");
  exportar = await import("@/lib/paginas/exportar-leads");
  acoesPag = await import("@/lib/actions/paginas");
  captura = await import("@/app/p/[slug]/acoes");
  config = await import("@/lib/paginas/config");
  hash = (await import("@/lib/email/disparos")).hashDoDestinatario;
});

afterAll(async () => {
  provedor.usarProvedorEmail(provedor.provedorSmtp);
  const fila = await import("@/lib/marketing/fila");
  await Promise.all([fila.filaEmails().close(), fila.filaMarketing().close()]);
});

const semTeto = { espera: async () => 0 };
const SO_MEMBROS = { grupoIds: [], tagIds: [], produtoIds: [], nuncaAcessou: false };
const LEADS = { paginaIds: [] as string[], funilIds: [] as string[], tagIds: [] as string[] };
const emailNovo = (p: string) => `${p}-${randomUUID().slice(0, 8)}@teste.local`;

/** Página e lead direto no banco (a captura pública tem teste próprio). */
async function pagina(criadorId: string) {
  const [p] = await db.insert(s.criadores_paginas).values({ criador_id: criadorId, slug: `p-${randomUUID().slice(0, 8)}`, titulo: "Isca", modelo: "CAPTURA", rascunho: {} as never, modified_by: criadorId }).returning();
  return p;
}
async function lead(criadorId: string, paginaId: string, email: string, nome = "Lead Teste", tagId: string | null = null) {
  const [l] = await db
    .insert(s.criadores_leads)
    .values({ criador_id: criadorId, nome, email, pagina_id: paginaId, tag_id: tagId, consentimento_texto: "Aceito receber os e-mails da área.", consentimento_em: new Date(), modified_by: criadorId })
    .returning();
  return l;
}

async function campanhaIniciada(criadorId: string, autor: string, p: import("@/lib/db/schema/marketing").PublicoCampanha) {
  const c = await db.transaction((tx) => camp.criarCampanha(tx, { criadorId, autor, nome: "Para leads", conteudo: conteudo(), publico: p }));
  await db.transaction((tx) => camp.agendarCampanha(tx, { criadorId, autor, campanhaId: c.id, versao: c.versao, quando: null }));
  const r = await camp.iniciarCampanha(c.id);
  if (r.r !== "iniciada") throw new Error(`campanha não iniciou: ${r.r}`);
  return { campanhaId: c.id, envioIds: r.envioIds };
}
const enviosDa = (campanhaId: string) => db.select().from(s.criadores_emails_envios).where(eq(s.criadores_emails_envios.campanha_id, campanhaId));

async function cenario() {
  const A = await novoCriador("Área A");
  const B = await novoCriador("Área B");
  const dono = await membroCom(A.id, "DONO");
  const donoB = await membroCom(B.id, "DONO");
  const ana = await membroCom(A.id);
  const beto = await membroCom(A.id);
  const p1 = await pagina(A.id);
  const p2 = await pagina(A.id);
  const pB = await pagina(B.id);
  const l1 = await lead(A.id, p1.id, emailNovo("lia"), "Lia Lead");
  const lAna = await lead(A.id, p1.id, ana.usuario.email.toLowerCase(), "Ana como lead"); // já é aluna
  const l3 = await lead(A.id, p2.id, emailNovo("caio"), "Caio Lead");
  const lB = await lead(B.id, pB.id, l1.email, "Lia na B"); // mesmo e-mail em OUTRA área
  await (await import("@/lib/marketing/descadastro")).descadastrar(A.id, hash(l3.email), "LINK");
  return { A, B, dono, donoB, ana, beto, p1, p2, pB, l1, lAna, l3, lB };
}

describe("público com leads", () => {
  it("segmentos de lead, dedupe pelo HMAC (lead que é aluno conta como membro), descadastro e isolamento A×B", async () => {
    const { A, B, ana, p1, p2, pB, l1, lB } = await cenario();
    // Só leads da página 1: Lia (lead) + Ana (já é aluna: entra como MEMBRO, uma vez).
    expect(await publico.contarPublico(A.id, { ...SO_MEMBROS, membros: false, leads: { ...LEADS, paginaIds: [p1.id] } })).toEqual({ total: 2, descadastrados: 0, receberao: 2, membros: 1, leads: 1 });
    // Todos os alunos + todos os leads: Ana, Beto, Lia, Caio (descadastrado). Ana não duplica.
    const tudo = { ...SO_MEMBROS, membros: true, leads: LEADS };
    expect(await publico.contarPublico(A.id, tudo)).toEqual({ total: 4, descadastrados: 1, receberao: 3, membros: 2, leads: 1 });
    const dest = await publico.destinatariosDoPublico(A.id, tudo);
    expect(dest.filter((d) => d.hash === hash(ana.usuario.email))).toHaveLength(1);
    expect(dest.find((d) => d.hash === hash(ana.usuario.email))?.tipo).toBe("MEMBRO");
    // Campanha antiga (sem os campos) = só membros.
    expect((await publico.contarPublico(A.id, SO_MEMBROS)).leads).toBe(0);
    // Página/funil de outra área = recusa; B só vê os leads de B.
    await expect(publico.contarPublico(A.id, { ...SO_MEMBROS, membros: false, leads: { ...LEADS, paginaIds: [pB.id] } })).rejects.toThrow("Página não encontrada");
    const deB = await publico.destinatariosDoPublico(B.id, { ...SO_MEMBROS, membros: false, leads: LEADS });
    expect(deB.map((d) => (d.tipo === "LEAD" ? d.leadId : null))).toEqual([lB.id]);
    expect((await publico.destinatariosDoPublico(A.id, { ...SO_MEMBROS, membros: false, leads: { ...LEADS, paginaIds: [p2.id] } })).map((d) => d.email)).not.toContain(l1.email);
  });

  it("lead recebe a campanha; aluno-lead recebe 1; descadastrado não; reprocessar não duplica; destinatários mostram o tipo", async () => {
    const falso = provedorFalso();
    const { A, B, dono, donoB, ana, l1, l3, lB } = await cenario();
    const { campanhaId, envioIds } = await campanhaIniciada(A.id, dono.usuario.id, { ...SO_MEMBROS, membros: true, leads: LEADS });
    const envios = await enviosDa(campanhaId);
    expect(envios).toHaveLength(4);
    expect(envios.filter((e) => e.lead_id === l1.id)[0]).toMatchObject({ membro_id: null, situacao: "PENDENTE", chave: `campanha:${campanhaId}:lead:${l1.id}` });
    expect(envios.find((e) => e.lead_id === l3.id)).toMatchObject({ situacao: "IGNORADO" });
    expect(await camp.iniciarCampanha(campanhaId)).toEqual({ r: "ignorada" });

    for (const id of envioIds) expect(await envio.processarEnvio(id, 1, 5, semTeto)).toEqual({ r: "enviado" });
    expect(falso.para(l1.email)).toHaveLength(1);
    expect(falso.para(ana.usuario.email)).toHaveLength(1);
    expect(falso.para(l3.email)).toHaveLength(0);
    const msg = falso.para(l1.email)[0];
    expect(msg.tipo).toBe("CAMPANHA");
    expect(msg.cabecalhos?.["List-Unsubscribe"]).toContain(`${A.slug}.localhost:3011/api/email/descadastro?t=${hash(l1.email)}.`);

    const lista = await consultas.destinatariosDaCampanha(A.id, campanhaId, { pagina: 1, porPagina: 10 });
    expect(lista?.linhas.find((d) => d.leadId === l1.id)).toMatchObject({ tipo: "LEAD", nome: "Lia Lead", email: l1.email });
    expect(lista?.linhas.filter((d) => d.tipo === "MEMBRO")).toHaveLength(2);
    expect((await consultas.listarCampanhas(A.id))[0]).toMatchObject({ situacao: "CONCLUIDA", enviados: 3, ignorados: 1 });

    // Na B, só a Lia de B (mesmo e-mail, outra área) e a lista de descadastro de A não vale lá.
    const b = await campanhaIniciada(B.id, donoB.usuario.id, { ...SO_MEMBROS, membros: false, leads: LEADS });
    expect((await enviosDa(b.campanhaId)).map((e) => e.lead_id)).toEqual([lB.id]);
  });

  it("envio de lead: abertura e clique assinados contam; descadastro pelo link guarda a máscara do lead; lead removido não recebe", async () => {
    provedorFalso();
    const { A, dono, l1, p1 } = await cenario();
    const { campanhaId, envioIds } = await campanhaIniciada(A.id, dono.usuario.id, { ...SO_MEMBROS, membros: false, leads: { ...LEADS, paginaIds: [p1.id] } });
    const idLead = (await enviosDa(campanhaId)).find((e) => e.lead_id === l1.id)!.id;
    expect(envioIds).toContain(idLead);
    await envio.processarEnvio(idLead, 1, 5, semTeto);
    const base = `http://${A.slug}.localhost:3011`;
    await rotas.atenderAbertura(new Request(`${base}/api/email/abertura?e=${idLead}&s=${tokens.assinaturaAbertura(idLead)}`, { headers: hostDe(A.slug) }));
    const url = "https://exemplo.com/aula-nova";
    const clique = await rotas.atenderClique(new Request(`${base}/api/email/clique?e=${idLead}&u=${encodeURIComponent(url)}&s=${tokens.assinaturaClique(idLead, url)}`, { headers: hostDe(A.slug) }));
    expect(clique.status).toBe(302);
    expect(await consultas.campanhaDoCriador(A.id, campanhaId)).toMatchObject({ aberturas: 1, cliques: 1 });

    const t = tokens.tokenDescadastro(A.id, l1.email);
    expect((await rotas.atenderDescadastro(new Request(`${base}/api/email/descadastro?t=${t}`, { method: "POST", headers: hostDe(A.slug) }))).status).toBe(200);
    const [d] = await db.select().from(s.criadores_emails_descadastros).where(and(eq(s.criadores_emails_descadastros.criador_id, A.id), eq(s.criadores_emails_descadastros.destinatario_hash, hash(l1.email))));
    expect(d.destinatario_mascarado).toContain("***");
    expect(JSON.stringify(d)).not.toContain(l1.email);

    // Lead removido (soft delete) entre o início e o envio: IGNORADO.
    const outro = await lead(A.id, p1.id, emailNovo("rui"));
    const c2 = await campanhaIniciada(A.id, dono.usuario.id, { ...SO_MEMBROS, membros: false, leads: LEADS });
    const idRui = (await enviosDa(c2.campanhaId)).find((e) => e.lead_id === outro.id)!.id;
    await db.update(s.criadores_leads).set({ is_deleted: true, deleted_at: new Date() }).where(eq(s.criadores_leads.id, outro.id));
    expect(await envio.processarEnvio(idRui, 1, 5, semTeto)).toEqual({ r: "ignorado", motivo: "Lead removido." });
  });
});

describe("automação: cadastro numa página", () => {
  it("dispara 1x por lead (nova captura não repete), respeita o filtro de página, aplica a tag NO lead e manda o e-mail ao lead", async () => {
    const falso = provedorFalso();
    const A = await novoCriador();
    const dono = await membroCom(A.id, "DONO");
    req.h = await cabecalhosLogados(dono.usuario.email, A.slug);
    const nova = (r: { ok: boolean; dados?: unknown; erro?: string }) => {
      if (!r.ok) throw new Error(r.erro);
      return r.dados as { id: string; versao: string };
    };
    const p = nova(await acoesPag.acaoCriarPagina({ modelo: "CAPTURA", titulo: "Isca", slug: "isca" }));
    const [linha] = await db.select().from(s.criadores_paginas).where(eq(s.criadores_paginas.id, p.id));
    const cfg = config.configPaginaSchema.parse(linha.rascunho);
    const v = nova(await acoesPag.acaoSalvarRascunhoPagina({ paginaId: p.id, versao: p.versao, titulo: "Isca", slug: "isca", config: cfg }));
    nova(await acoesPag.acaoPublicarPagina({ paginaId: p.id, versao: v.versao }));
    const outra = await pagina(A.id);
    const [tag] = await db.insert(s.criadores_tags).values({ criador_id: A.id, nome: "Veio da isca", modified_by: dono.usuario.id }).returning();

    const ativa = async (extra: Partial<import("@/lib/marketing/automacoes").DadosAutomacao>) => {
      const a = await db.transaction((tx) =>
        autos.criarAutomacao(tx, { criadorId: A.id, autor: dono.usuario.id, gatilho: "LEAD_CAPTURADO", nome: "Boas-vindas do lead", produtoId: null, dias: null, atrasoMinutos: 0, conteudo: conteudo(), tagId: null, ...extra }),
      );
      await db.transaction((tx) => autos.mudarSituacaoAutomacao(tx, { criadorId: A.id, autor: dono.usuario.id, automacaoId: a.id, versao: a.versao, situacao: "ATIVA" }));
      return a.id;
    };
    const qualquer = await ativa({ tagId: tag.id });
    const daOutra = await ativa({ paginaId: outra.id });
    // Página só vale no gatilho de lead (CHECK no banco).
    await expect(db.transaction((tx) => autos.criarAutomacao(tx, { criadorId: A.id, autor: dono.usuario.id, gatilho: "MEMBRO_CADASTRADO", nome: "Errada", produtoId: null, dias: null, atrasoMinutos: 0, conteudo: conteudo(), tagId: null, paginaId: outra.id }))).rejects.toThrow();

    const email = emailNovo("lead");
    const form = () => {
      const d = new FormData();
      for (const [k, x] of Object.entries({ slug: "isca", pagina: p.id, nome: "Lia", email, consentimento: "sim", site: "" })) d.set(k, x);
      return d;
    };
    req.h = cabecalhos(A.slug);
    expect(await captura.enviarCaptura(null, form())).toMatchObject({ ok: true });
    expect(await captura.enviarCaptura(null, form())).toMatchObject({ ok: true });
    const [l] = await db.select().from(s.criadores_leads).where(and(eq(s.criadores_leads.criador_id, A.id), eq(s.criadores_leads.email, email)));
    expect(l.capturas).toBe(2);
    const exQ = await db.select().from(s.criadores_automacoes_execucoes).where(eq(s.criadores_automacoes_execucoes.automacao_id, qualquer));
    expect(exQ).toHaveLength(1);
    expect(exQ[0]).toMatchObject({ lead_id: l.id, membro_id: null, referencia: "captura" });
    expect(await db.select().from(s.criadores_automacoes_execucoes).where(eq(s.criadores_automacoes_execucoes.automacao_id, daOutra))).toHaveLength(0);

    const r = await execucoes.processarExecucao(exQ[0].id);
    if (r.r !== "executada" || !r.envioId) throw new Error("execução não criou envio");
    expect((await db.select().from(s.criadores_leads).where(eq(s.criadores_leads.id, l.id)))[0].tag_id).toBe(tag.id);
    expect(await execucoes.processarExecucao(exQ[0].id)).toEqual({ r: "ignorada" });
    expect(await envio.processarEnvio(r.envioId, 1, 5, semTeto)).toEqual({ r: "enviado" });
    expect(falso.para(email).map((e) => e.tipo)).toEqual(["AUTOMACAO"]);
    const hist = await consultas.historicoDaAutomacao(A.id, qualquer, { pagina: 1, porPagina: 10 });
    expect(hist?.linhas[0]).toMatchObject({ tipo: "LEAD", nome: "Lia", referencia: "captura", tagAplicada: true });
    const trilha = await db.select().from(s.auditoria).where(and(eq(s.auditoria.tabela, "criadores_leads"), eq(s.auditoria.registro_id, l.id)));
    expect(trilha.some((t) => t.detalhes.includes("Veio da isca"))).toBe(true);
    expect(JSON.stringify(trilha)).not.toContain(email);
  });
});

describe("exportação CSV dos leads", () => {
  it("só DONO/ADMIN (401/403), só os leads da área, fórmula neutralizada e trilha sem e-mail", async () => {
    const { A, dono, ana, p1, l1, lB } = await cenario();
    await lead(A.id, p1.id, emailNovo("formula"), "=HYPERLINK(\"http://mal.exemplo\")");
    await lead(A.id, p1.id, emailNovo("menos"), "-2+3");
    const url = (h: Headers, q = "") => new Request(`http://${h.get("host")}/admin/paginas/leads/exportar${q}`, { headers: h });
    expect((await exportar.atenderExportacaoLeads(url(cabecalhos(A.slug)))).status).toBe(401);
    expect((await exportar.atenderExportacaoLeads(url(await cabecalhosLogados(ana.usuario.email, A.slug)))).status).toBe(403);
    const hDono = await cabecalhosLogados(dono.usuario.email, A.slug);
    expect((await exportar.atenderExportacaoLeads(url(hDono, "?pagina=nao-e-id"))).status).toBe(400);

    const r = await exportar.atenderExportacaoLeads(url(hDono, `?pagina=${p1.id}`));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(r.headers.get("content-disposition")).toMatch(/attachment; filename="leads-\d{4}-\d{2}-\d{2}\.csv"/);
    const csv = await r.text();
    const linhas = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(linhas[0].split(";").slice(0, 3)).toEqual(["nome", "email", "pagina_origem"]);
    expect(linhas).toHaveLength(1 + 4); // Lia, Ana-lead, fórmula, menos (a página 2 fica de fora)
    expect(csv).toContain(l1.email);
    expect(csv).not.toContain(lB.nome);
    expect(csv).toContain(`"'=HYPERLINK(""http://mal.exemplo"")"`);
    expect(csv).toContain("'-2+3");
    expect(csv).not.toMatch(/(^|;)=HYPERLINK/m);

    const [t] = await db.select().from(s.auditoria).where(and(eq(s.auditoria.criador_id, A.id), eq(s.auditoria.acao, "exportar")));
    expect(t).toMatchObject({ user_id: dono.usuario.id, tabela: "criadores_leads", detalhes: "Exportou 4 lead(s) em CSV" });
    expect(JSON.stringify(t)).not.toContain(l1.email);
  });
});
