/**
 * Fase 1 (ADR-0018) no PostgreSQL real — tags de membros (RN-200) e vouchers (RN-201): unicidade sem
 * diferença de maiúsculas, idempotência, trava otimista, trilha, isolamento A×B (inclusive a FK
 * composta), limites do voucher com resgates simultâneos, matrícula pela `matricular` e permissões.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador, novoUsuario, vincular } from "./_apoio";
import { membroCom } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let tags: typeof import("@/lib/tags/servico");
let membros: typeof import("@/lib/membros/consultas");
let vouchers: typeof import("@/lib/vouchers/servico");
let consultasV: typeof import("@/lib/vouchers/consultas");
let acoesTags: typeof import("@/lib/actions/tags");
let acoesV: typeof import("@/lib/actions/vouchers");

beforeAll(async () => {
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  tags = await import("@/lib/tags/servico");
  membros = await import("@/lib/membros/consultas");
  vouchers = await import("@/lib/vouchers/servico");
  consultasV = await import("@/lib/vouchers/consultas");
  acoesTags = await import("@/lib/actions/tags");
  acoesV = await import("@/lib/actions/vouchers");
});

let codigo = 1;
async function produto(criadorId: string) {
  const n = codigo++;
  const [p] = await db
    .insert(s.produtos)
    .values({ criador_id: criadorId, codigo: n, titulo: `Curso ${n}`, slug: `c-${n}-${randomUUID().slice(0, 6)}`, status: "PUBLICADO", modified_by: criadorId })
    .returning();
  return p;
}

const trilha = (registroId: string) => db.select().from(s.auditoria).where(eq(s.auditoria.registro_id, registroId));

describe("tags de membros", () => {
  it("cria, nome único sem caixa, aplica idempotente, filtra, trava, exclui e isola A×B", async () => {
    const A = await novoCriador();
    const B = await novoCriador();
    const dono = await novoUsuario();
    const ana = await membroCom(A.id);
    const beto = await membroCom(A.id);
    const deB = await membroCom(B.id);
    const t = await db.transaction((tx) => tags.criarTag(tx, { criadorId: A.id, autor: dono.id, nome: "VIP", cor: "#aa0000" }));
    await expect(db.transaction((tx) => tags.criarTag(tx, { criadorId: A.id, autor: dono.id, nome: "vip", cor: "#aa0000" }))).rejects.toThrow(tags.MSG_TAG_DUPLICADA);
    // Outro criador pode ter o mesmo nome.
    await db.transaction((tx) => tags.criarTag(tx, { criadorId: B.id, autor: dono.id, nome: "VIP", cor: "#aa0000" }));

    const r1 = await db.transaction((tx) => tags.aplicarTag(tx, { criadorId: A.id, autor: dono.id, tagId: t.id, membroIds: [ana.membro.id, beto.membro.id] }));
    expect(r1).toEqual({ aplicadas: 2, jaTinham: 0 });
    const r2 = await db.transaction((tx) => tags.aplicarTag(tx, { criadorId: A.id, autor: dono.id, tagId: t.id, membroIds: [ana.membro.id] }));
    expect(r2).toEqual({ aplicadas: 0, jaTinham: 1 });
    // Membro de B: recusado pelo serviço (e a FK composta recusaria de todo jeito).
    await expect(db.transaction((tx) => tags.aplicarTag(tx, { criadorId: A.id, autor: dono.id, tagId: t.id, membroIds: [deB.membro.id] }))).rejects.toThrow("Membro não encontrado");
    await expect(db.insert(s.criadores_membros_tags).values({ criador_id: A.id, membro_id: deB.membro.id, tag_id: t.id, modified_by: dono.id })).rejects.toThrow();

    const filtrados = await membros.listarMembros(A.id, { tagId: t.id, pagina: 1, porPagina: 50 });
    expect(filtrados.total).toBe(2);
    expect(filtrados.linhas[0].tags).toEqual([{ id: t.id, nome: "VIP", cor: "#aa0000" }]);
    expect((await membros.listarTags(A.id)).find((x) => x.id === t.id)?.membros).toBe(2);
    expect(await membros.listarTags(B.id)).toHaveLength(1);

    await db.transaction((tx) => tags.removerTag(tx, { criadorId: A.id, autor: dono.id, tagId: t.id, membroIds: [beto.membro.id] }));
    expect((await membros.listarMembros(A.id, { tagId: t.id, pagina: 1, porPagina: 50 })).total).toBe(1);

    const salva = await db.transaction((tx) => tags.salvarTag(tx, { criadorId: A.id, autor: dono.id, tagId: t.id, versao: t.versao, nome: "Cliente VIP", cor: "#00aa00" }));
    // Versão velha = colisão; criador errado = colisão.
    await expect(db.transaction((tx) => tags.salvarTag(tx, { criadorId: A.id, autor: dono.id, tagId: t.id, versao: t.versao, nome: "X", cor: "#00aa00" }))).rejects.toThrow(/alterado/);
    await expect(db.transaction((tx) => tags.excluirTag(tx, { criadorId: B.id, autor: dono.id, tagId: t.id, versao: salva.versao }))).rejects.toThrow(/alterado/);
    expect(await db.transaction((tx) => tags.excluirTag(tx, { criadorId: A.id, autor: dono.id, tagId: t.id, versao: salva.versao }))).toEqual({ desmarcados: 1 });
    expect((await membros.listarMembros(A.id, { pagina: 1, porPagina: 50 })).linhas.every((l) => l.tags.length === 0)).toBe(true);
    // Excluída = nome livre de novo.
    await db.transaction((tx) => tags.criarTag(tx, { criadorId: A.id, autor: dono.id, nome: "Cliente VIP", cor: "#000000" }));
    expect((await trilha(t.id)).map((x) => x.acao).sort()).toEqual(["atualizar", "criar", "criar", "excluir", "excluir"]);
  });

  it("action: ALUNO recusado; ADMIN cria pela sessão do host", async () => {
    const A = await novoCriador();
    const aluno = await novoUsuario();
    const admin = await novoUsuario();
    await vincular(A.id, aluno.id, "ALUNO");
    await vincular(A.id, admin.id, "ADMIN");
    req.h = await cabecalhosLogados(aluno.email, A.slug);
    expect(await acoesTags.acaoCriarTag({ nome: "X", cor: "#AABBCC" })).toEqual({ ok: false, erro: "Sem permissão para esta ação." });
    req.h = await cabecalhosLogados(admin.email, A.slug);
    const r = await acoesTags.acaoCriarTag({ nome: "Lead quente", cor: "#AABBCC" });
    expect(r.ok).toBe(true);
    expect(await acoesTags.acaoCriarTag({ nome: "<b>", cor: "#aabbcc" })).toMatchObject({ ok: false });
  });
});

describe("vouchers", () => {
  async function cenario(o: Partial<import("@/lib/vouchers/servico").CamposVoucher> = {}) {
    const A = await novoCriador();
    const dono = await novoUsuario();
    await vincular(A.id, dono.id, "DONO");
    const p1 = await produto(A.id);
    const p2 = await produto(A.id);
    const v = await db.transaction((tx) =>
      vouchers.criarVoucher(tx, { criadorId: A.id, autor: dono.id, codigo: null, descricao: "", validoAte: null, limiteUsos: null, limitePorPessoa: 1, diasAcesso: 30, produtoIds: [p1.id, p2.id], ...o }),
    );
    return { A, dono, p1, p2, v };
  }

  it("código gerado sem ambíguos; resgate matricula (origem VOUCHER, referência, expiração) e respeita o limite por pessoa", async () => {
    const { A, p1, p2, v } = await cenario();
    expect(v.codigo).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const ana = await membroCom(A.id);
    const agora = new Date();
    const r = await db.transaction((tx) => vouchers.resgatarVoucher(tx, { criadorId: A.id, membroId: ana.membro.id, usuarioId: ana.usuario.id, codigo: v.codigo, agora }));
    expect(r.matriculas.map((m) => m.resultado)).toEqual(["criada", "criada"]);
    const ms = await db.select().from(s.produtos_matriculas).where(eq(s.produtos_matriculas.membro_id, ana.membro.id));
    expect(ms).toHaveLength(2);
    for (const m of ms) {
      expect(m.origem).toBe("VOUCHER");
      expect(m.referencia_externa).toBe(`voucher:${r.resgateId}:${m.produto_id}`);
      expect(m.expira_em?.getTime()).toBe(agora.getTime() + 30 * 86_400_000);
    }
    expect([p1.id, p2.id].sort()).toEqual(ms.map((m) => m.produto_id).sort());
    // De novo: limite por pessoa (1) — nada muda.
    await expect(db.transaction((tx) => vouchers.resgatarVoucher(tx, { criadorId: A.id, membroId: ana.membro.id, usuarioId: ana.usuario.id, codigo: v.codigo }))).rejects.toThrow(/máximo de vezes/);
    expect((await consultasV.listarVouchers(A.id)).find((x) => x.id === v.id)).toMatchObject({ usos: 1, produtos: expect.any(Array) });
    expect(await consultasV.resgatesDoVoucher(A.id, v.id)).toHaveLength(1);
    expect((await trilha(r.resgateId))[0]).toMatchObject({ acao: "criar", tabela: "criadores_vouchers_resgates", user_id: ana.usuario.id });
  });

  it("já tem tudo valendo = recusa sem gastar uso; produto já ativo não perde a referência do gateway", async () => {
    const { A, p1, p2, v } = await cenario({ limitePorPessoa: 2 });
    const bia = await membroCom(A.id);
    await db.insert(s.produtos_matriculas).values({ criador_id: A.id, membro_id: bia.membro.id, produto_id: p1.id, origem: "COMPRA", referencia_externa: "gateway:evt-9", modified_by: bia.usuario.id });
    const r = await db.transaction((tx) => vouchers.resgatarVoucher(tx, { criadorId: A.id, membroId: bia.membro.id, usuarioId: bia.usuario.id, codigo: v.codigo }));
    expect(r.matriculas.find((m) => m.produtoId === p1.id)?.resultado).toBe("ja-existia");
    expect(r.novas).toHaveLength(1);
    const [m1] = await db.select().from(s.produtos_matriculas).where(and(eq(s.produtos_matriculas.membro_id, bia.membro.id), eq(s.produtos_matriculas.produto_id, p1.id)));
    expect(m1.referencia_externa).toBe("gateway:evt-9");
    await expect(db.transaction((tx) => vouchers.resgatarVoucher(tx, { criadorId: A.id, membroId: bia.membro.id, usuarioId: bia.usuario.id, codigo: v.codigo }))).rejects.toThrow(/todos os cursos/);
    expect(await consultasV.resgatesDoVoucher(A.id, v.id)).toHaveLength(1);
    void p2;
  });

  it("limite total com resgates SIMULTÂNEOS; pausado, encerrado (final) e expirado recusam", async () => {
    const { A, dono, v } = await cenario({ limiteUsos: 2 });
    const pessoas = await Promise.all([1, 2, 3, 4].map(() => membroCom(A.id)));
    const r = await Promise.allSettled(
      pessoas.map((p) => db.transaction((tx) => vouchers.resgatarVoucher(tx, { criadorId: A.id, membroId: p.membro.id, usuarioId: p.usuario.id, codigo: v.codigo }))),
    );
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(2);
    expect(r.filter((x) => x.status === "rejected").every((x) => /limite de usos/.test(String((x as PromiseRejectedResult).reason)))).toBe(true);

    const outro = await cenario();
    const p = await membroCom(outro.A.id);
    const pausado = await db.transaction((tx) => vouchers.mudarSituacaoVoucher(tx, { criadorId: outro.A.id, autor: outro.dono.id, voucherId: outro.v.id, versao: outro.v.versao, situacao: "PAUSADO" }));
    await expect(db.transaction((tx) => vouchers.resgatarVoucher(tx, { criadorId: outro.A.id, membroId: p.membro.id, usuarioId: p.usuario.id, codigo: outro.v.codigo }))).rejects.toThrow(/pausado/);
    const enc = await db.transaction((tx) => vouchers.mudarSituacaoVoucher(tx, { criadorId: outro.A.id, autor: outro.dono.id, voucherId: outro.v.id, versao: pausado.versao, situacao: "ENCERRADO" }));
    await expect(db.transaction((tx) => vouchers.mudarSituacaoVoucher(tx, { criadorId: outro.A.id, autor: outro.dono.id, voucherId: outro.v.id, versao: enc.versao, situacao: "ATIVO" }))).rejects.toThrow(/não volta/);
    await expect(db.transaction((tx) => vouchers.resgatarVoucher(tx, { criadorId: outro.A.id, membroId: p.membro.id, usuarioId: p.usuario.id, codigo: outro.v.codigo }))).rejects.toThrow(/encerrado/);

    const vencido = await cenario({ validoAte: new Date(Date.now() + 60_000) });
    const q = await membroCom(vencido.A.id);
    await expect(
      db.transaction((tx) => vouchers.resgatarVoucher(tx, { criadorId: vencido.A.id, membroId: q.membro.id, usuarioId: q.usuario.id, codigo: vencido.v.codigo, agora: new Date(Date.now() + 120_000) })),
    ).rejects.toThrow(/expirou/);
    void dono;
  });

  it("código único por criador (caixa não importa), isolamento A×B, trava e exclusão só sem resgate", async () => {
    const { A, dono, p1, v } = await cenario();
    const B = await novoCriador();
    const pB = await produto(B.id);
    const base = { descricao: "", validoAte: null, limiteUsos: null, limitePorPessoa: 1, diasAcesso: null } as const;
    await expect(db.transaction((tx) => vouchers.criarVoucher(tx, { criadorId: A.id, autor: dono.id, codigo: v.codigo, ...base, produtoIds: [p1.id] }))).rejects.toThrow(vouchers.MSG_CODIGO_DUPLICADO);
    // Mesmo código em B é outro voucher; produto de A num voucher de B = recusa.
    await db.transaction((tx) => vouchers.criarVoucher(tx, { criadorId: B.id, autor: dono.id, codigo: v.codigo, ...base, produtoIds: [pB.id] }));
    await expect(db.transaction((tx) => vouchers.criarVoucher(tx, { criadorId: B.id, autor: dono.id, codigo: "OUTRO234", ...base, produtoIds: [p1.id] }))).rejects.toThrow("Curso não encontrado");
    // Membro de B resgatando o código no host de A: o voucher de A existe, mas o membro não (FK/serviço).
    const deB = await membroCom(B.id);
    await expect(db.transaction((tx) => vouchers.resgatarVoucher(tx, { criadorId: A.id, membroId: deB.membro.id, usuarioId: deB.usuario.id, codigo: v.codigo }))).rejects.toThrow();
    // O banco recusa código ambíguo/minúsculo mesmo sem o serviço.
    await expect(db.insert(s.criadores_vouchers).values({ criador_id: A.id, codigo: "abc0o1", modified_by: dono.id })).rejects.toThrow();

    const salvo = await db.transaction((tx) => vouchers.salvarVoucher(tx, { criadorId: A.id, autor: dono.id, voucherId: v.id, versao: v.versao, ...base, descricao: "Black Friday", produtoIds: [p1.id] }));
    await expect(db.transaction((tx) => vouchers.salvarVoucher(tx, { criadorId: A.id, autor: dono.id, voucherId: v.id, versao: v.versao, ...base, produtoIds: [p1.id] }))).rejects.toThrow(/alterado/);
    expect((await consultasV.listarVouchers(A.id, { busca: v.codigo.slice(0, 4).toLowerCase() })).map((x) => x.id)).toContain(v.id);
    expect((await consultasV.listarVouchers(A.id)).find((x) => x.id === v.id)?.produtos.map((x) => x.id)).toEqual([p1.id]);

    const ana = await membroCom(A.id);
    await db.transaction((tx) => vouchers.resgatarVoucher(tx, { criadorId: A.id, membroId: ana.membro.id, usuarioId: ana.usuario.id, codigo: v.codigo }));
    const [atual] = await db.select().from(s.criadores_vouchers).where(eq(s.criadores_vouchers.id, v.id));
    await expect(db.transaction((tx) => vouchers.excluirVoucher(tx, { criadorId: A.id, autor: dono.id, voucherId: v.id, versao: atual.updated_at }))).rejects.toThrow(/encerre/);
    void salvo;
  });

  it("action: aluno resgata pela sessão (código com hífen e minúsculas); ALUNO não cria voucher", async () => {
    const { A, v } = await cenario();
    const aluno = await novoUsuario();
    await vincular(A.id, aluno.id, "ALUNO");
    req.h = await cabecalhosLogados(aluno.email, A.slug);
    expect(await acoesV.acaoCriarVoucher({ produtoIds: [randomUUID()] })).toEqual({ ok: false, erro: "Sem permissão para esta ação." });
    const digitado = `${v.codigo.slice(0, 4).toLowerCase()}-${v.codigo.slice(4)}`;
    const r = await acoesV.acaoResgatarVoucher({ codigo: digitado });
    expect(r.ok && r.dados.matriculas).toHaveLength(2);
    expect(await acoesV.acaoResgatarVoucher({ codigo: "LIDER2026" })).toMatchObject({ ok: false, erro: expect.stringMatching(/Código inválido/) });
    expect(await acoesV.acaoResgatarVoucher({ codigo: "ZZZZZZZZ" })).toEqual({ ok: false, erro: "Voucher não encontrado." });
  });
});
