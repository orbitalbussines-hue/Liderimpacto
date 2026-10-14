/**
 * Telas e actions dos eventos ao vivo (ADR-0011, RN-142/143) no PostgreSQL real: papéis (ALUNO
 * recusado, ADMIN e DONO ok), rascunho → publicado → cancelado com trava e trilha, publicar e
 * reagendar ENFILEIRAM o lembrete (fila simulada), cancelar avisa os inscritos, isolamento A × B,
 * presença pela action, rota `.ics` só para quem vê, lado do worker (job e reenfileiramento) e,
 * com Redis no ar, o job atrasado de verdade (idempotente pelo jobId).
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cabecalhos, cabecalhosLogados, novoCriador } from "./_apoio";
import { ok } from "./_catalogo";
import { grupoCom, notificacoesDe } from "./_comunidade";
import { evento, pessoa, quemE } from "./_engajamento";
import { cursoPronto, membroCom } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));
const fila = vi.hoisted(() => ({ enfileirar: vi.fn(async () => true) }));
vi.mock("@/lib/eventos/fila", async (original) => ({ ...(await original<typeof import("@/lib/eventos/fila")>()), enfileirarLembreteComPrazo: fila.enfileirar }));

let acoes: typeof import("@/lib/actions/eventos");
let rota: typeof import("@/lib/eventos/rota-agenda");
let lembrete: typeof import("@/lib/eventos/lembrete");
let pre: typeof import("@/lib/eventos/presenca");
let filaReal: typeof import("@/lib/eventos/fila");
let campoDeBrasilia: typeof import("@/lib/validators/eventos").campoDeBrasilia;
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  acoes = await import("@/lib/actions/eventos");
  rota = await import("@/lib/eventos/rota-agenda");
  lembrete = await import("@/lib/eventos/lembrete");
  pre = await import("@/lib/eventos/presenca");
  filaReal = await import("@/lib/eventos/fila");
  campoDeBrasilia = (await import("@/lib/validators/eventos")).campoDeBrasilia;
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

beforeEach(() => fila.enfileirar.mockClear());

const MIN = 60_000;
const daqui = (min: number) => new Date(Math.ceil((Date.now() + min * MIN) / MIN) * MIN); // minuto cheio (o form não tem segundos)
const campos = (o: Record<string, unknown> = {}) => ({
  titulo: "Mentoria em grupo",
  descricao: "Traga suas dúvidas.",
  inicio: campoDeBrasilia(daqui(2 * 24 * 60)),
  duracaoMin: 60,
  link: "https://meet.google.com/abc-defg-hij",
  publico: "TODOS",
  produtoId: null,
  grupoIds: [],
  gravacaoAulaId: null,
  ...o,
});
const doTipo = async (membroId: string, tipo: string) => (await notificacoesDe(membroId)).filter((n) => n.tipo === tipo);
const eventoNoBanco = async (id: string) => (await db.select().from(s.criadores_eventos).where(eq(s.criadores_eventos.id, id)))[0];

async function cenario() {
  const cr = await novoCriador();
  const admin = await membroCom(cr.id, "ADMIN");
  const bia = await pessoa(cr.id); // no grupo
  const caio = await pessoa(cr.id); // fora do grupo
  const g = await grupoCom(cr.id, [bia.membro.id]);
  req.h = await cabecalhosLogados(admin.usuario.email, cr.slug);
  return { cr, admin, bia, caio, g };
}

describe("papéis", () => {
  it("ALUNO recebe 'Sem permissão' em toda action da equipe; DONO cria e exclui rascunho", async () => {
    const cr = await novoCriador();
    const aluno = await membroCom(cr.id, "ALUNO");
    const dono = await membroCom(cr.id, "DONO");
    const e = await evento(cr.id, dono.usuario.id, { situacao: "RASCUNHO" });
    const versao = e.updated_at.toISOString();
    req.h = await cabecalhosLogados(aluno.usuario.email, cr.slug);
    for (const r of [
      await acoes.acaoCriarEvento(campos()),
      await acoes.acaoSalvarEvento({ eventoId: e.id, versao, campos: campos() }),
      await acoes.acaoPublicarEvento({ eventoId: e.id, versao }),
      await acoes.acaoCancelarEvento({ eventoId: e.id, versao }),
      await acoes.acaoExcluirEvento({ eventoId: e.id, versao }),
    ])
      expect(r).toEqual({ ok: false, erro: "Sem permissão para esta ação." });
    expect(await db.select().from(s.criadores_eventos).where(eq(s.criadores_eventos.criador_id, cr.id))).toHaveLength(1);

    req.h = await cabecalhosLogados(dono.usuario.email, cr.slug);
    const novo = ok(await acoes.acaoCriarEvento(campos({ link: "" })));
    expect(await eventoNoBanco(novo.id)).toMatchObject({ situacao: "RASCUNHO", link_acesso: null, criado_por: dono.usuario.id });
    ok(await acoes.acaoExcluirEvento({ eventoId: novo.id, versao: novo.versao }));
    expect(await eventoNoBanco(novo.id)).toMatchObject({ is_deleted: true, modified_by: dono.usuario.id });
  });
});

describe("ciclo do evento (ADMIN)", () => {
  it("rascunho → publicar (avisa o público, enfileira) → reagendar (reenfileira) → cancelar (avisa inscritos), com trava e trilha", async () => {
    const x = await cenario();
    const criado = ok(await acoes.acaoCriarEvento(campos({ link: "", publico: "GRUPOS", grupoIds: [x.g.id] })));
    const gs = await db.select().from(s.criadores_eventos_grupos).where(and(eq(s.criadores_eventos_grupos.evento_id, criado.id), eq(s.criadores_eventos_grupos.is_deleted, false)));
    expect(gs.map((g) => g.grupo_id)).toEqual([x.g.id]);

    // Publicar sem link: recusa.
    expect(await acoes.acaoPublicarEvento({ eventoId: criado.id, versao: criado.versao })).toEqual({ ok: false, erro: "Para publicar, informe o link da sala (https)." });
    const salvo = ok(await acoes.acaoSalvarEvento({ eventoId: criado.id, versao: criado.versao, campos: campos({ publico: "GRUPOS", grupoIds: [x.g.id] }) }));
    // Trava otimista: a versão velha não grava.
    expect(await acoes.acaoSalvarEvento({ eventoId: criado.id, versao: criado.versao, campos: campos({ titulo: "Outro" }) })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro usuario/) });

    const pub = ok(await acoes.acaoPublicarEvento({ eventoId: criado.id, versao: salvo.versao }));
    const e1 = await eventoNoBanco(criado.id);
    expect(e1).toMatchObject({ situacao: "PUBLICADO", titulo: "Mentoria em grupo" });
    expect(fila.enfileirar).toHaveBeenCalledExactlyOnceWith(x.cr.id, criado.id, e1.inicio_em);
    expect(pub.lembreteEnfileirado).toBe(true);
    expect(await doTipo(x.bia.membro.id, "EVENTO_PUBLICADO")).toHaveLength(1);
    expect(await doTipo(x.caio.membro.id, "EVENTO_PUBLICADO")).toHaveLength(0);

    // Salvar sem mudar o horário não reenfileira; mudar reenfileira com o novo início.
    fila.enfileirar.mockClear();
    const v2 = ok(await acoes.acaoSalvarEvento({ eventoId: criado.id, versao: pub.versao, campos: campos({ inicio: campoDeBrasilia(e1.inicio_em), publico: "GRUPOS", grupoIds: [x.g.id], descricao: "Nova" }) }));
    expect(fila.enfileirar).not.toHaveBeenCalled();
    const novoInicio = daqui(3 * 24 * 60);
    const v3 = ok(await acoes.acaoSalvarEvento({ eventoId: criado.id, versao: v2.versao, campos: campos({ inicio: campoDeBrasilia(novoInicio), publico: "TODOS" }) }));
    expect(fila.enfileirar).toHaveBeenCalledExactlyOnceWith(x.cr.id, criado.id, novoInicio);
    // Público ampliado: quem passou a ver recebe o aviso (uma vez só para quem já tinha).
    expect(await doTipo(x.caio.membro.id, "EVENTO_PUBLICADO")).toHaveLength(1);
    expect(await doTipo(x.bia.membro.id, "EVENTO_PUBLICADO")).toHaveLength(1);
    expect(await db.select().from(s.criadores_eventos_grupos).where(and(eq(s.criadores_eventos_grupos.evento_id, criado.id), eq(s.criadores_eventos_grupos.is_deleted, false)))).toHaveLength(0);

    // Publicado não se exclui nem perde o link.
    expect(await acoes.acaoExcluirEvento({ eventoId: criado.id, versao: v3.versao })).toMatchObject({ ok: false });
    expect(await acoes.acaoSalvarEvento({ eventoId: criado.id, versao: v3.versao, campos: campos({ link: "" }) })).toEqual({ ok: false, erro: "Evento publicado precisa do link da sala." });

    await pre.confirmarPresenca(quemE(x.cr.id, x.bia), criado.id, new Date());
    ok(await acoes.acaoCancelarEvento({ eventoId: criado.id, versao: v3.versao }));
    expect(await eventoNoBanco(criado.id)).toMatchObject({ situacao: "CANCELADO" });
    expect(await doTipo(x.bia.membro.id, "EVENTO_CANCELADO")).toHaveLength(1);
    expect(await doTipo(x.caio.membro.id, "EVENTO_CANCELADO")).toHaveLength(0);
    // Cancelado é só leitura.
    const v4 = (await eventoNoBanco(criado.id)).updated_at.toISOString();
    expect(await acoes.acaoSalvarEvento({ eventoId: criado.id, versao: v4, campos: campos() })).toEqual({ ok: false, erro: "Evento cancelado não pode ser editado." });

    const trilha = await db.select().from(s.auditoria).where(and(eq(s.auditoria.tabela, "criadores_eventos"), eq(s.auditoria.registro_id, criado.id)));
    expect(trilha.map((t) => t.acao).sort()).toEqual(["atualizar", "atualizar", "atualizar", "atualizar", "criar", "publicar"]);
    expect(trilha.every((t) => t.user_id === x.admin.usuario.id && t.criador_id === x.cr.id)).toBe(true);
    expect(JSON.stringify(trilha)).not.toContain("meet.google.com"); // o link não vai para a trilha
  });

  it("não publica encontro que já terminou; gravação só com aula da área", async () => {
    const x = await cenario();
    const r = ok(await acoes.acaoCriarEvento(campos({ inicio: campoDeBrasilia(daqui(-180)) })));
    expect(await acoes.acaoPublicarEvento({ eventoId: r.id, versao: r.versao })).toMatchObject({ ok: false, erro: expect.stringMatching(/já terminou/) });
    const curso = await cursoPronto(x.cr.id);
    ok(await acoes.acaoSalvarEvento({ eventoId: r.id, versao: r.versao, campos: campos({ gravacaoAulaId: curso.aulas[0].id }) }));
    expect((await eventoNoBanco(r.id)).gravacao_aula_id).toBe(curso.aulas[0].id);
  });
});

describe("isolamento A × B", () => {
  it("evento, curso, grupo e aula de B: 'não encontrado' para o ADMIN de A", async () => {
    const A = await cenario();
    const crB = await novoCriador();
    const donoB = await pessoa(crB.id, "DONO");
    const eB = await evento(crB.id, donoB.usuario.id, { situacao: "RASCUNHO" });
    const cursoB = await cursoPronto(crB.id);
    const gB = await grupoCom(crB.id, []);
    const vB = eB.updated_at.toISOString();
    expect(await acoes.acaoPublicarEvento({ eventoId: eB.id, versao: vB })).toMatchObject({ ok: false, erro: expect.stringMatching(/não encontrado nesta área/) });
    expect(await acoes.acaoExcluirEvento({ eventoId: eB.id, versao: vB })).toMatchObject({ ok: false, erro: expect.stringMatching(/não encontrado nesta área/) });
    expect(await acoes.acaoCriarEvento(campos({ publico: "PRODUTO", produtoId: cursoB.produto.id }))).toEqual({ ok: false, erro: "Curso não encontrado nesta área." });
    expect(await acoes.acaoCriarEvento(campos({ publico: "GRUPOS", grupoIds: [gB.id] }))).toMatchObject({ ok: false, erro: expect.stringMatching(/Grupo não encontrado/) });
    expect(await acoes.acaoCriarEvento(campos({ gravacaoAulaId: cursoB.aulas[0].id }))).toEqual({ ok: false, erro: "Aula da gravação não encontrada nesta área." });
    expect(await eventoNoBanco(eB.id)).toMatchObject({ situacao: "RASCUNHO", is_deleted: false });
    expect(await db.select().from(s.criadores_eventos).where(eq(s.criadores_eventos.criador_id, A.cr.id))).toHaveLength(0);
  });
});

describe("presença pela action e rota .ics", () => {
  it("o aluno confirma e desconfirma a PRÓPRIA presença", async () => {
    const cr = await novoCriador();
    const aluno = await membroCom(cr.id, "ALUNO");
    const e = await evento(cr.id, aluno.usuario.id);
    req.h = await cabecalhosLogados(aluno.usuario.email, cr.slug);
    expect(ok(await acoes.acaoConfirmarPresenca({ eventoId: e.id }))).toEqual({ confirmou: true });
    expect(ok(await acoes.acaoConfirmarPresenca({ eventoId: e.id }))).toEqual({ confirmou: false });
    expect(await acoes.acaoConfirmarPresenca({ eventoId: e.id, membroId: aluno.membro.id })).toMatchObject({ ok: false }); // nada de id de pessoa
    expect(ok(await acoes.acaoCancelarPresenca({ eventoId: e.id }))).toEqual({ cancelou: true });
  });

  it(".ics: quem vê baixa (sem o link da sala); sem sessão 401; fora do público, rascunho e id ruim 404", async () => {
    const cr = await novoCriador();
    const aluno = await membroCom(cr.id, "ALUNO");
    const dono = await pessoa(cr.id, "DONO");
    const todos = await evento(cr.id, dono.usuario.id, { titulo: "Live de outubro" });
    const doGrupo = await evento(cr.id, dono.usuario.id, { publico: "GRUPOS" });
    const rascunho = await evento(cr.id, dono.usuario.id, { situacao: "RASCUNHO" });
    const h = await cabecalhosLogados(aluno.usuario.email, cr.slug);
    const pedir = (id: string, cab: Headers = h) => rota.atenderAgendaIcs(new Request(`http://${cr.slug}.localhost:3011/eventos/${id}/agenda.ics`, { headers: cab }), id);

    const r = await pedir(todos.id);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="encontro-live-de-outubro.ics"');
    expect(r.headers.get("cache-control")).toBe("no-store");
    const corpo = (await r.text()).replace(/\r\n /g, "");
    expect(corpo).toContain("SUMMARY:Live de outubro");
    expect(corpo).toContain(`URL:http://${cr.slug}.localhost:3011/eventos/${todos.id}`);
    expect(corpo).not.toContain("meet.google.com");

    expect((await pedir(todos.id, cabecalhos(cr.slug))).status).toBe(401);
    for (const id of [doGrupo.id, rascunho.id, "nao-e-uuid"]) expect((await pedir(id)).status).toBe(404);
  });
});

describe("comunidade", () => {
  it("lateral traz o próximo encontro PUBLICADO do público (cancelado e rascunho não)", async () => {
    const { lateralDaComunidade } = await import("@/lib/comunidade/consultas");
    const cr = await novoCriador();
    const dono = await pessoa(cr.id, "DONO");
    const ana = await pessoa(cr.id);
    expect((await lateralDaComunidade(quemE(cr.id, ana))).proximoEncontro).toBeNull();
    await evento(cr.id, dono.usuario.id, { emMin: 30, situacao: "CANCELADO" });
    await evento(cr.id, dono.usuario.id, { emMin: 40, situacao: "RASCUNHO" });
    const e = await evento(cr.id, dono.usuario.id, { emMin: 60 * 24 });
    expect((await lateralDaComunidade(quemE(cr.id, ana))).proximoEncontro).toMatchObject({ id: e.id, link: null, situacao: "PUBLICADO" });
  });
});

describe("lembrete (lado do worker)", () => {
  it("o job avisa os inscritos uma vez; ao subir, reenfileira só PUBLICADOS que não começaram", async () => {
    const cr = await novoCriador();
    const dono = await pessoa(cr.id, "DONO");
    const ana = await pessoa(cr.id);
    const futuro = await evento(cr.id, dono.usuario.id, { emMin: 50 });
    const comecou = await evento(cr.id, dono.usuario.id, { emMin: -10 });
    const rascunho = await evento(cr.id, dono.usuario.id, { situacao: "RASCUNHO" });
    const cancelado = await evento(cr.id, dono.usuario.id, { situacao: "CANCELADO" });
    await pre.confirmarPresenca(quemE(cr.id, ana), futuro.id, new Date());
    const job = { criadorId: cr.id, eventoId: futuro.id, inicioEm: futuro.inicio_em.toISOString() };
    expect(await lembrete.processarLembrete(job)).toBe(1);
    expect(await lembrete.processarLembrete(job)).toBe(0);
    await expect(lembrete.processarLembrete({ ...job, eventoId: "x" })).rejects.toThrow();

    const pendentes = (await lembrete.lembretesPendentes()).filter((p) => p.criadorId === cr.id);
    expect(pendentes).toEqual([job]);
    expect(pendentes.map((p) => p.eventoId)).not.toContain(comecou.id);
    expect([rascunho.id, cancelado.id].some((id) => pendentes.some((p) => p.eventoId === id))).toBe(false);
  });

  it.runIf(!!process.env.REDIS_URL)("Redis no ar: job ATRASADO até 1 h antes, enfileirar de novo não duplica", async () => {
    const q = filaReal.criarFilaEventos();
    try {
      const inicio = new Date(Date.now() + 3 * 60 * MIN);
      const dados = { criadorId: crypto.randomUUID(), eventoId: crypto.randomUUID(), inicioEm: inicio.toISOString() };
      await filaReal.enfileirarLembrete(q, dados);
      await filaReal.enfileirarLembrete(q, dados);
      const id = `lembrete-${dados.eventoId}-${inicio.getTime()}`;
      const j = await q.getJob(id);
      expect(j?.data).toEqual(dados);
      expect(await j?.getState()).toBe("delayed");
      expect(j!.opts.delay).toBeGreaterThan(115 * MIN);
      expect((await q.getDelayed()).filter((x) => x.data.eventoId === dados.eventoId)).toHaveLength(1);
      await j?.remove();
    } finally {
      await q.close();
    }
  });
});
