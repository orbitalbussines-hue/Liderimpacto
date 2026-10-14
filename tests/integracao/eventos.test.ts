/**
 * Eventos ao vivo (ADR-0011, RN-142/143) no PostgreSQL real: quem vê (TODOS, PRODUTO, GRUPOS;
 * rascunho nunca), link SÓ na janela, presença idempotente e única entre as vivas (o banco recusa a
 * segunda), desconfirmar e confirmar de novo, CHECKs do evento, isolamento A × B (consulta e FK
 * composta) e os avisos (publicado, cancelado, lembrete idempotente por início e preferência).
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { novoCriador } from "./_apoio";
import { grupoCom, notificacoesDe } from "./_comunidade";
import { evento, pessoa, quemE } from "./_engajamento";
import { cursoPronto, matricular } from "./_progresso";

let con: typeof import("@/lib/eventos/consultas");
let pre: typeof import("@/lib/eventos/presenca");
let ger: typeof import("@/lib/notificacoes/gerar");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  con = await import("@/lib/eventos/consultas");
  pre = await import("@/lib/eventos/presenca");
  ger = await import("@/lib/notificacoes/gerar");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const MIN = 60_000;
const ids = (l: { id: string }[]) => l.map((x) => x.id).sort();

async function cenario() {
  const cr = await novoCriador();
  const dono = await pessoa(cr.id, "DONO");
  const ana = await pessoa(cr.id);
  const bia = await pessoa(cr.id);
  return { cr, dono, ana, bia };
}

describe("quem vê e o link", () => {
  it("TODOS, PRODUTO (matrícula valendo) e GRUPOS; rascunho nunca; equipe vê todos", async () => {
    const { cr, dono, ana, bia } = await cenario();
    const curso = await cursoPronto(cr.id);
    await matricular(cr.id, ana.membro.id, curso.produto.id);
    const g = await grupoCom(cr.id, [bia.membro.id]);
    const todos = await evento(cr.id, dono.usuario.id);
    const doCurso = await evento(cr.id, dono.usuario.id, { publico: "PRODUTO", produto_id: curso.produto.id });
    const doGrupo = await evento(cr.id, dono.usuario.id, { publico: "GRUPOS" });
    await db.insert(s.criadores_eventos_grupos).values({ criador_id: cr.id, evento_id: doGrupo.id, grupo_id: g.id, modified_by: dono.usuario.id });
    await evento(cr.id, dono.usuario.id, { situacao: "RASCUNHO", link_acesso: null });
    const agora = new Date();

    expect(ids(await con.eventosProximos(quemE(cr.id, ana), agora))).toEqual([todos.id, doCurso.id].sort());
    expect(ids(await con.eventosProximos(quemE(cr.id, bia), agora))).toEqual([todos.id, doGrupo.id].sort());
    expect(ids(await con.eventosProximos(quemE(cr.id, dono), agora))).toEqual([todos.id, doCurso.id, doGrupo.id].sort());
    // Matrícula expirada: sai do público PRODUTO.
    await db.update(s.produtos_matriculas).set({ expira_em: new Date(Date.now() - 1000) }).where(eq(s.produtos_matriculas.membro_id, ana.membro.id));
    expect(await con.eventoDoMembro(quemE(cr.id, ana), doCurso.id, agora)).toBeNull();
  });

  it("link só de 15 min antes até o fim; gravação só depois; cancelado nunca tem link", async () => {
    const { cr, dono, ana } = await cenario();
    const curso = await cursoPronto(cr.id);
    const e = await evento(cr.id, dono.usuario.id, { emMin: 60, gravacao_aula_id: curso.aulas[0].id });
    const q = quemE(cr.id, ana);
    const em = (min: number) => new Date(e.inicio_em.getTime() + min * MIN);
    expect(await con.eventoDoMembro(q, e.id, em(-16))).toMatchObject({ momento: "EM_BREVE", link: null, gravacaoAulaId: null });
    expect(await con.eventoDoMembro(q, e.id, em(-15))).toMatchObject({ momento: "ABERTO", link: "https://meet.google.com/abc-defg-hij" });
    expect(await con.eventoDoMembro(q, e.id, em(60))).toMatchObject({ momento: "ENCERRADO", link: null, gravacaoAulaId: curso.aulas[0].id });
    expect((await con.eventosPassados(q, em(61))).map((x) => x.id)).toEqual([e.id]);
    await db.update(s.criadores_eventos).set({ situacao: "CANCELADO", cancelado_em: new Date() }).where(eq(s.criadores_eventos.id, e.id));
    expect(await con.eventoDoMembro(q, e.id, em(0))).toMatchObject({ situacao: "CANCELADO", link: null });
    expect(await con.proximoEventoDoMembro(q, em(-30))).toBeNull();
  });

  it("CHECKs: link http, publicado sem link, PRODUTO sem curso", async () => {
    const { cr, dono } = await cenario();
    await expect(evento(cr.id, dono.usuario.id, { link_acesso: "http://zoom.us/j/1" })).rejects.toThrow();
    await expect(evento(cr.id, dono.usuario.id, { link_acesso: null })).rejects.toThrow();
    await expect(evento(cr.id, dono.usuario.id, { publico: "PRODUTO" })).rejects.toThrow();
  });
});

describe("presença", () => {
  it("confirmar é idempotente e o banco recusa a segunda inscrição viva; desconfirmar e voltar", async () => {
    const { cr, dono, ana } = await cenario();
    const e = await evento(cr.id, dono.usuario.id);
    const q = quemE(cr.id, ana);
    const agora = new Date();
    expect(await pre.confirmarPresenca(q, e.id, agora)).toBe(true);
    expect(await pre.confirmarPresenca(q, e.id, agora)).toBe(false);
    await expect(db.insert(s.criadores_eventos_inscricoes).values({ criador_id: cr.id, evento_id: e.id, membro_id: ana.membro.id, modified_by: ana.usuario.id })).rejects.toThrow();
    expect(await con.eventoDoMembro(q, e.id, agora)).toMatchObject({ inscrito: true, inscritos: 1 });

    expect(await pre.cancelarPresenca(q, e.id, agora)).toBe(true);
    expect(await pre.cancelarPresenca(q, e.id, agora)).toBe(false);
    expect(await pre.confirmarPresenca(q, e.id, agora)).toBe(true);
    const linhas = await db.select().from(s.criadores_eventos_inscricoes).where(eq(s.criadores_eventos_inscricoes.evento_id, e.id));
    expect(linhas.map((l) => l.is_deleted).sort()).toEqual([false, true]); // histórico fica (soft delete)
  });

  it("recusa rascunho, cancelado, encerrado e fora do público", async () => {
    const { cr, dono, ana } = await cenario();
    const q = quemE(cr.id, ana);
    const rascunho = await evento(cr.id, dono.usuario.id, { situacao: "RASCUNHO" });
    const cancelado = await evento(cr.id, dono.usuario.id, { situacao: "CANCELADO" });
    const passado = await evento(cr.id, dono.usuario.id, { emMin: -120 });
    const grupoVazio = await evento(cr.id, dono.usuario.id, { publico: "GRUPOS" });
    for (const e of [rascunho, cancelado, passado, grupoVazio]) await expect(pre.confirmarPresenca(q, e.id, new Date())).rejects.toThrow(pre.MSG_EVENTO_INDISPONIVEL);
  });
});

describe("isolamento A × B", () => {
  it("evento de B não aparece nem aceita presença em A; o banco recusa inscrição cruzada", async () => {
    const A = await cenario();
    const B = await cenario();
    const eB = await evento(B.cr.id, B.dono.usuario.id);
    const qA = quemE(A.cr.id, A.ana);
    expect(await con.eventosProximos(qA, new Date())).toEqual([]);
    expect(await con.eventoDoMembro(qA, eB.id, new Date())).toBeNull();
    await expect(pre.confirmarPresenca(qA, eB.id, new Date())).rejects.toThrow(pre.MSG_EVENTO_INDISPONIVEL);
    // Membro de A num evento de B, mesmo dizendo criador B: FK composta (membro, criador) recusa.
    await expect(db.insert(s.criadores_eventos_inscricoes).values({ criador_id: B.cr.id, evento_id: eB.id, membro_id: A.ana.membro.id, modified_by: A.ana.usuario.id })).rejects.toThrow();
  });
});

describe("avisos", () => {
  const ator = (p: Awaited<ReturnType<typeof pessoa>>) => ({ usuarioId: p.usuario.id, membroId: p.membro.id, nome: "Dono" });
  const doTipo = async (membroId: string, tipo: string) => (await notificacoesDe(membroId)).filter((n) => n.tipo === tipo);

  it("publicado: alunos do público, uma vez; cancelado: só inscritos", async () => {
    const { cr, dono, ana, bia } = await cenario();
    const e = await evento(cr.id, dono.usuario.id);
    await ger.notificarEventoPublicado(cr.id, e.id, ator(dono));
    await ger.notificarEventoPublicado(cr.id, e.id, ator(dono));
    expect(await doTipo(ana.membro.id, "EVENTO_PUBLICADO")).toHaveLength(1);
    expect((await doTipo(ana.membro.id, "EVENTO_PUBLICADO"))[0].dados).toMatchObject({ eventoId: e.id, eventoTitulo: "Mentoria ao vivo", eventoInicio: e.inicio_em.toISOString() });
    expect(await doTipo(dono.membro.id, "EVENTO_PUBLICADO")).toHaveLength(0);

    await pre.confirmarPresenca(quemE(cr.id, ana), e.id, new Date());
    await db.update(s.criadores_eventos).set({ situacao: "CANCELADO", cancelado_em: new Date() }).where(eq(s.criadores_eventos.id, e.id));
    await ger.notificarEventoCancelado(cr.id, e.id, ator(dono));
    expect(await doTipo(ana.membro.id, "EVENTO_CANCELADO")).toHaveLength(1);
    expect(await doTipo(bia.membro.id, "EVENTO_CANCELADO")).toHaveLength(0);
  });

  it("lembrete: inscritos com 'Lembretes' ligado, idempotente, e o job de um horário antigo não faz nada", async () => {
    const { cr, dono, ana, bia } = await cenario();
    const e = await evento(cr.id, dono.usuario.id, { emMin: 50 });
    for (const p of [ana, bia]) await pre.confirmarPresenca(quemE(cr.id, p), e.id, new Date());
    await db.update(s.usuarios).set({ lembretes: false }).where(eq(s.usuarios.id, bia.usuario.id));
    // Job atrasado que só rodou depois do fim: nada.
    expect(await ger.notificarLembreteEvento(cr.id, e.id, e.inicio_em, new Date(e.inicio_em.getTime() + 61 * MIN))).toBe(0);
    expect(await ger.notificarLembreteEvento(cr.id, e.id, e.inicio_em)).toBe(1);
    expect(await ger.notificarLembreteEvento(cr.id, e.id, e.inicio_em)).toBe(0);
    expect(await doTipo(bia.membro.id, "EVENTO_LEMBRETE")).toHaveLength(0);
    // Reagendado: o job do horário velho não avisa; o do novo avisa de novo.
    const novo = new Date(e.inicio_em.getTime() + 30 * MIN);
    await db.update(s.criadores_eventos).set({ inicio_em: novo }).where(and(eq(s.criadores_eventos.id, e.id)));
    expect(await ger.notificarLembreteEvento(cr.id, e.id, e.inicio_em)).toBe(0);
    expect(await ger.notificarLembreteEvento(cr.id, e.id, novo)).toBe(1);
  });
});
