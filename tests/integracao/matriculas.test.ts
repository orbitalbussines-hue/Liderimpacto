/**
 * Matriculas (RN-116) no PostgreSQL real: servico `matricular` (idempotencia pela referencia
 * externa, reativacao, uma viva por par), cancelar/expiracao, matricula de grupo, actions das
 * telas com trava de colisao, permissoes (ALUNO recusado) e isolamento A x B.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador, novoUsuario, vincular } from "./_apoio";
import { ok } from "./_catalogo";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let acoes: typeof import("@/lib/actions/matriculas");
let servico: typeof import("@/lib/matriculas/servico");
let consultas: typeof import("@/lib/matriculas/consultas");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  acoes = await import("@/lib/actions/matriculas");
  servico = await import("@/lib/matriculas/servico");
  consultas = await import("@/lib/matriculas/consultas");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

let codigo = 1;
async function produto(criadorId: string, titulo = "Curso", status: "RASCUNHO" | "PUBLICADO" = "PUBLICADO") {
  const n = codigo++;
  const [p] = await db
    .insert(s.produtos)
    .values({ criador_id: criadorId, codigo: n, titulo: `${titulo} ${n}`, slug: `curso-${n}-${randomUUID().slice(0, 6)}`, status, modified_by: criadorId })
    .returning();
  return p;
}

async function aluno(criadorId: string) {
  const u = await novoUsuario();
  return { usuario: u, membro: await vincular(criadorId, u.id, "ALUNO") };
}

/** Criador A (DONO, ADMIN, ALUNO, produto) e B (DONO, ALUNO, produto, grupo). */
async function cenario() {
  const a = await novoCriador("Criador A");
  const b = await novoCriador("Criador B");
  const dono = await novoUsuario();
  const admin = await novoUsuario();
  const donoB = await novoUsuario();
  await vincular(a.id, dono.id, "DONO");
  await vincular(a.id, admin.id, "ADMIN");
  await vincular(b.id, donoB.id, "DONO");
  const [grupoB] = await db.insert(s.criadores_grupos).values({ criador_id: b.id, nome: "Turma B", modified_by: donoB.id }).returning();
  return { a, b, dono, admin, donoB, alunoA: await aluno(a.id), alunoB: await aluno(b.id), pA: await produto(a.id), pB: await produto(b.id), grupoB };
}

const linha = async (id: string) => (await db.select().from(s.produtos_matriculas).where(eq(s.produtos_matriculas.id, id)))[0];
const doPar = (membroId: string, produtoId: string) =>
  db.select().from(s.produtos_matriculas).where(and(eq(s.produtos_matriculas.membro_id, membroId), eq(s.produtos_matriculas.produto_id, produtoId)));

describe("serviço matricular (ponto de entrada do gateway)", () => {
  it("idempotente pela referência externa; uma viva por par; cancelar e reativar a MESMA linha", async () => {
    const c = await cenario();
    const base = { criadorId: c.a.id, membroId: c.alunoA.membro.id, produtoId: c.pA.id, origem: "COMPRA" as const, autor: null };
    const r1 = await db.transaction((tx) => servico.matricular(tx, { ...base, referenciaExterna: "gateway:evt-1" }));
    expect(r1.resultado).toBe("criada");
    // Webhook repetido: mesma matricula, sem erro e sem mudar nada.
    const antes = await linha(r1.matriculaId);
    const r2 = await db.transaction((tx) => servico.matricular(tx, { ...base, referenciaExterna: "gateway:evt-1" }));
    expect(r2).toEqual({ matriculaId: r1.matriculaId, resultado: "ja-existia" });
    expect(await linha(r1.matriculaId)).toEqual(antes);
    // Sistema (autor nulo): a linha fica com a propria pessoa como autora; a trilha com user_id nulo.
    expect(antes).toMatchObject({ status: "ATIVA", origem: "COMPRA", modified_by: c.alunoA.usuario.id, criador_id: c.a.id });
    const trilha = await db.select().from(s.auditoria).where(eq(s.auditoria.registro_id, r1.matriculaId));
    expect(trilha).toMatchObject([{ acao: "criar", user_id: null, criador_id: c.a.id }]);

    // A mesma referencia em outro par e recusada.
    const outro = await aluno(c.a.id);
    await expect(db.transaction((tx) => servico.matricular(tx, { ...base, membroId: outro.membro.id, referenciaExterna: "gateway:evt-1" }))).rejects.toThrow(/já usada/);
    // Sem referencia, o mesmo par: fica como esta.
    expect((await db.transaction((tx) => servico.matricular(tx, { ...base, autor: c.dono.id }))).resultado).toBe("ja-existia");
    expect(await doPar(c.alunoA.membro.id, c.pA.id)).toHaveLength(1);
    // O banco tambem recusa a segunda linha viva do par.
    await expect(db.insert(s.produtos_matriculas).values({ criador_id: c.a.id, membro_id: c.alunoA.membro.id, produto_id: c.pA.id, origem: "MANUAL", modified_by: c.dono.id })).rejects.toThrow();

    const agora = new Date();
    expect(await consultas.matriculaAtiva(c.a.id, c.alunoA.membro.id, c.pA.id, agora)).toBe(true);
    await db.transaction((tx) => servico.cancelarMatricula(tx, { criadorId: c.a.id, matriculaId: r1.matriculaId, versao: antes.updated_at, motivo: "Reembolso", autor: c.dono.id }));
    expect(await linha(r1.matriculaId)).toMatchObject({ status: "CANCELADA", motivo_cancelamento: "Reembolso", is_deleted: false });
    expect(await consultas.matriculaAtiva(c.a.id, c.alunoA.membro.id, c.pA.id, new Date())).toBe(false);

    const r3 = await db.transaction((tx) => servico.matricular(tx, { ...base, origem: "MANUAL", autor: c.dono.id }));
    expect(r3).toEqual({ matriculaId: r1.matriculaId, resultado: "reativada" });
    expect(await linha(r1.matriculaId)).toMatchObject({ status: "ATIVA", origem: "MANUAL", motivo_cancelamento: null, referencia_externa: "gateway:evt-1" });
    expect(await doPar(c.alunoA.membro.id, c.pA.id)).toHaveLength(1);
  });

  it("expirada não vale e é reativada; expiração no passado é recusada", async () => {
    const c = await cenario();
    const base = { criadorId: c.a.id, membroId: c.alunoA.membro.id, produtoId: c.pA.id, origem: "MANUAL" as const, autor: c.dono.id };
    await expect(db.transaction((tx) => servico.matricular(tx, { ...base, expiraEm: new Date(Date.now() - 1000) }))).rejects.toThrow(/hoje ou depois/);
    const r = await db.transaction((tx) => servico.matricular(tx, { ...base, expiraEm: new Date(Date.now() + 60_000) }));
    await db.update(s.produtos_matriculas).set({ expira_em: new Date(Date.now() - 1000) }).where(eq(s.produtos_matriculas.id, r.matriculaId));
    expect(await consultas.matriculaAtiva(c.a.id, c.alunoA.membro.id, c.pA.id, new Date())).toBe(false);
    expect((await consultas.contadoresDeMatriculas(c.a.id, new Date())).expiradas).toBe(1);
    expect((await db.transaction((tx) => servico.matricular(tx, base))).resultado).toBe("reativada");
    expect(await linha(r.matriculaId)).toMatchObject({ status: "ATIVA", expira_em: null });
    expect(await consultas.matriculaAtiva(c.a.id, c.alunoA.membro.id, c.pA.id, new Date())).toBe(true);
  });

  it("grupo inteiro numa transação: quem já tem fica, cancelada reativa, nova cria; grupo de B recusado", async () => {
    const c = await cenario();
    const [grupo] = await db.insert(s.criadores_grupos).values({ criador_id: c.a.id, nome: "Turma A", modified_by: c.dono.id }).returning();
    const [x, y, z] = [c.alunoA, await aluno(c.a.id), await aluno(c.a.id)];
    for (const p of [x, y, z]) await db.insert(s.criadores_grupos_membros).values({ criador_id: c.a.id, grupo_id: grupo.id, membro_id: p.membro.id, modified_by: c.dono.id });
    const base = { criadorId: c.a.id, produtoId: c.pA.id, origem: "MANUAL" as const, autor: c.dono.id };
    await db.transaction((tx) => servico.matricular(tx, { ...base, membroId: x.membro.id }));
    const ry = await db.transaction((tx) => servico.matricular(tx, { ...base, membroId: y.membro.id }));
    await db.transaction(async (tx) => servico.cancelarMatricula(tx, { criadorId: c.a.id, matriculaId: ry.matriculaId, versao: (await linha(ry.matriculaId)).updated_at, motivo: "teste", autor: c.dono.id }));

    const g = await db.transaction((tx) => servico.matricularGrupo(tx, { ...base, grupoId: grupo.id }));
    expect(g).toEqual({ membros: 3, criadas: 1, reativadas: 1, jaExistiam: 1 });
    await expect(db.transaction((tx) => servico.matricularGrupo(tx, { ...base, grupoId: c.grupoB.id }))).rejects.toThrow(/Grupo não encontrado/);
  });

  it("o banco recusa misturar criadores (FK composta) e o serviço não acha membro/produto de B", async () => {
    const c = await cenario();
    await expect(db.insert(s.produtos_matriculas).values({ criador_id: c.a.id, membro_id: c.alunoA.membro.id, produto_id: c.pB.id, origem: "MANUAL", modified_by: c.dono.id })).rejects.toThrow();
    const base = { criadorId: c.a.id, origem: "MANUAL" as const, autor: c.dono.id };
    await expect(db.transaction((tx) => servico.matricular(tx, { ...base, membroId: c.alunoB.membro.id, produtoId: c.pA.id }))).rejects.toThrow(/Membro não encontrado/);
    await expect(db.transaction((tx) => servico.matricular(tx, { ...base, membroId: c.alunoA.membro.id, produtoId: c.pB.id }))).rejects.toThrow(/Produto não encontrado/);
  });
});

describe("leituras das telas", () => {
  it("aluno só vê os próprios cursos valendo e fora de rascunho; contagens por membro e produto", async () => {
    const c = await cenario();
    const rascunho = await produto(c.a.id, "Rascunho", "RASCUNHO");
    const cancelado = await produto(c.a.id, "Cancelado");
    const outro = await aluno(c.a.id);
    const base = { criadorId: c.a.id, origem: "MANUAL" as const, autor: c.dono.id };
    for (const p of [c.pA, rascunho, cancelado]) await db.transaction((tx) => servico.matricular(tx, { ...base, membroId: c.alunoA.membro.id, produtoId: p.id }));
    await db.transaction((tx) => servico.matricular(tx, { ...base, membroId: outro.membro.id, produtoId: c.pA.id }));
    const [mc] = await doPar(c.alunoA.membro.id, cancelado.id);
    await db.transaction((tx) => servico.cancelarMatricula(tx, { criadorId: c.a.id, matriculaId: mc.id, versao: mc.updated_at, motivo: "teste", autor: c.dono.id }));

    const agora = new Date();
    expect((await consultas.cursosDoAluno(c.a.id, c.alunoA.membro.id, agora)).map((x) => x.produtoId)).toEqual([c.pA.id]);
    expect(await consultas.cursosDoAluno(c.b.id, c.alunoA.membro.id, agora)).toEqual([]);
    expect(await consultas.matriculasPorMembro(c.a.id, [c.alunoA.membro.id, outro.membro.id], agora)).toEqual(
      new Map([
        [c.alunoA.membro.id, 2],
        [outro.membro.id, 1],
      ]),
    );
    expect((await consultas.alunosPorProduto(c.a.id, [c.pA.id, cancelado.id], agora)).get(c.pA.id)).toBe(2);
    expect((await consultas.alunosPorProduto(c.a.id, [c.pA.id, cancelado.id], agora)).get(cancelado.id)).toBeUndefined();
    expect(await consultas.contadoresDeMatriculas(c.a.id, agora)).toEqual({ total: 4, ativas: 3, pendentes: 0, canceladas: 1, expiradas: 0 });
    const filtrada = await consultas.listarMatriculas(c.a.id, { situacao: "CANCELADA", pagina: 1, porPagina: 10 }, agora);
    expect(filtrada.linhas.map((l) => l.id)).toEqual([mc.id]);
  });
});

describe("actions de matrícula (telas)", () => {
  it("ADMIN matricula pessoas em 2 produtos; altera expiração e cancela com trava; reativa", async () => {
    const c = await cenario();
    const p2 = await produto(c.a.id, "Mentoria", "RASCUNHO");
    const outro = await aluno(c.a.id);
    req.h = await cabecalhosLogados(c.admin.email, c.a.slug);
    const r = ok(await acoes.acaoMatricular({ membroIds: [c.alunoA.membro.id, outro.membro.id], produtoIds: [c.pA.id, p2.id], expiraEm: "2099-12-31" }));
    expect(r).toEqual({ pessoas: 2, produtos: 2, criadas: 4, reativadas: 0, jaExistiam: 0 });
    expect(ok(await acoes.acaoMatricular({ membroIds: [c.alunoA.membro.id], produtoIds: [c.pA.id] }))).toMatchObject({ jaExistiam: 1, criadas: 0 });
    expect(await acoes.acaoMatricular({ membroIds: [c.alunoA.membro.id], produtoIds: [c.pA.id], expiraEm: "2020-01-01" })).toMatchObject({ ok: false, erro: expect.stringMatching(/hoje ou depois/) });
    expect(await acoes.acaoMatricular({ produtoIds: [c.pA.id] })).toMatchObject({ ok: false, erro: expect.stringMatching(/pessoas OU um grupo/) });

    const [m] = await doPar(c.alunoA.membro.id, c.pA.id);
    expect(m.expira_em?.toISOString()).toBe("2100-01-01T02:59:59.999Z");
    const v1 = m.updated_at.toISOString();
    ok(await acoes.acaoAlterarExpiracao({ matriculaId: m.id, versao: v1, expiraEm: null }));
    expect((await linha(m.id)).expira_em).toBeNull();
    // Versao velha: colisao, nada muda.
    expect(await acoes.acaoCancelarMatricula({ matriculaId: m.id, versao: v1, motivo: "Pedido do aluno" })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro/) });
    expect(await acoes.acaoCancelarMatricula({ matriculaId: m.id, versao: (await linha(m.id)).updated_at.toISOString(), motivo: "x" })).toMatchObject({ ok: false });
    ok(await acoes.acaoCancelarMatricula({ matriculaId: m.id, versao: (await linha(m.id)).updated_at.toISOString(), motivo: "Pedido do aluno" }));
    expect(await linha(m.id)).toMatchObject({ status: "CANCELADA", modified_by: c.admin.id });
    ok(await acoes.acaoReativarMatricula({ matriculaId: m.id, versao: (await linha(m.id)).updated_at.toISOString(), expiraEm: "" }));
    expect(await linha(m.id)).toMatchObject({ status: "ATIVA", motivo_cancelamento: null });
    expect(await acoes.acaoReativarMatricula({ matriculaId: m.id, versao: (await linha(m.id)).updated_at.toISOString() })).toMatchObject({ ok: false, erro: expect.stringMatching(/já está ativa/) });

    const trilha = await db.select().from(s.auditoria).where(and(eq(s.auditoria.registro_id, m.id), eq(s.auditoria.user_id, c.admin.id)));
    expect(trilha.map((t) => t.detalhes).join("\n")).toMatch(/Cancelou a matrícula .*Pedido do aluno/);
    expect(trilha.some((t) => t.detalhes.startsWith("Expiração") && (t.dados_novos as { expira_em: null }).expira_em === null)).toBe(true);

    // Busca de membros: so os deste criador.
    const achados = ok(await acoes.acaoBuscarMembros({ busca: "teste.local" }));
    expect(achados.map((x) => x.id)).toContain(c.alunoA.membro.id);
    expect(achados.map((x) => x.id)).not.toContain(c.alunoB.membro.id);
  });

  it("ALUNO não usa nenhuma action de matrícula", async () => {
    const c = await cenario();
    const m = await db.transaction((tx) => servico.matricular(tx, { criadorId: c.a.id, membroId: c.alunoA.membro.id, produtoId: c.pA.id, origem: "MANUAL", autor: c.dono.id }));
    const versao = (await linha(m.matriculaId)).updated_at.toISOString();
    req.h = await cabecalhosLogados(c.alunoA.usuario.email, c.a.slug);
    const tentativas = [
      acoes.acaoMatricular({ membroIds: [c.alunoA.membro.id], produtoIds: [c.pA.id] }),
      acoes.acaoCancelarMatricula({ matriculaId: m.matriculaId, versao, motivo: "tentativa" }),
      acoes.acaoAlterarExpiracao({ matriculaId: m.matriculaId, versao, expiraEm: null }),
      acoes.acaoReativarMatricula({ matriculaId: m.matriculaId, versao }),
      acoes.acaoBuscarMembros({ busca: "teste" }),
    ];
    for (const t of tentativas) expect(await t).toMatchObject({ ok: false, erro: expect.stringMatching(/permissão/) });
    expect((await linha(m.matriculaId)).updated_at.toISOString()).toBe(versao);
  });

  it("isolamento A x B: membro, produto, grupo e matrícula de B recusados no host de A; nada grava", async () => {
    const c = await cenario();
    const mB = await db.transaction((tx) => servico.matricular(tx, { criadorId: c.b.id, membroId: c.alunoB.membro.id, produtoId: c.pB.id, origem: "MANUAL", autor: c.donoB.id }));
    const vB = (await linha(mB.matriculaId)).updated_at.toISOString();
    req.h = await cabecalhosLogados(c.dono.email, c.a.slug);
    const tentativas = {
      membroDeB: acoes.acaoMatricular({ membroIds: [c.alunoB.membro.id], produtoIds: [c.pA.id] }),
      produtoDeB: acoes.acaoMatricular({ membroIds: [c.alunoA.membro.id], produtoIds: [c.pB.id] }),
      grupoDeB: acoes.acaoMatricular({ grupoId: c.grupoB.id, produtoIds: [c.pA.id] }),
      misturado: acoes.acaoMatricular({ membroIds: [c.alunoA.membro.id, c.alunoB.membro.id], produtoIds: [c.pA.id] }),
      cancelar: acoes.acaoCancelarMatricula({ matriculaId: mB.matriculaId, versao: vB, motivo: "invasão" }),
      expiracao: acoes.acaoAlterarExpiracao({ matriculaId: mB.matriculaId, versao: vB, expiraEm: "2099-01-01" }),
      reativar: acoes.acaoReativarMatricula({ matriculaId: mB.matriculaId, versao: vB }),
    };
    for (const [nome, t] of Object.entries(tentativas)) expect((await t).ok, `${nome} deveria ser recusada`).toBe(false);
    // "misturado": a transacao inteira desfaz (o aluno de A tambem nao ficou matriculado).
    expect(await doPar(c.alunoA.membro.id, c.pA.id)).toHaveLength(0);
    expect((await linha(mB.matriculaId)).updated_at.toISOString()).toBe(vB);
    const lista = await consultas.listarMatriculas(c.a.id, { pagina: 1, porPagina: 50 }, new Date());
    expect(lista.total).toBe(0);
  });
});
