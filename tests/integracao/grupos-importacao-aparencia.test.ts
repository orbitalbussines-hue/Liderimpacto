/**
 * Grupos, importacao CSV e cor da marca no PostgreSQL real, pelas Server Actions (headers()
 * simulado). Prova isolamento A x B, trava de colisao, bloqueio de grupo com membros, CSV que
 * so grava as linhas validas e a cor que a vitrine passa a ler.
 */
import { and, eq, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhos, cabecalhosLogados, novoCriador, novoUsuario, vincular } from "./_apoio";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let grupos: typeof import("@/lib/actions/grupos");
let membros: typeof import("@/lib/actions/membros");
let gestao: typeof import("@/lib/actions/membros-gestao");
let aparencia: typeof import("@/lib/actions/aparencia");
let area: typeof import("@/lib/criador/area");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  grupos = await import("@/lib/actions/grupos");
  membros = await import("@/lib/actions/membros");
  gestao = await import("@/lib/actions/membros-gestao");
  aparencia = await import("@/lib/actions/aparencia");
  area = await import("@/lib/criador/area");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const lerGrupo = async (id: string) => (await db.select().from(s.criadores_grupos).where(eq(s.criadores_grupos.id, id)))[0];

async function equipe() {
  const a = await novoCriador("Criador A");
  const b = await novoCriador("Criador B");
  const dono = await novoUsuario();
  const admin = await novoUsuario();
  const donoB = await novoUsuario();
  await vincular(a.id, dono.id, "DONO");
  await vincular(a.id, admin.id, "ADMIN");
  await vincular(b.id, donoB.id, "DONO");
  return { a, b, dono, admin, donoB };
}

describe("grupos de acesso", () => {
  it("cria, renomeia com trava, recusa nome repetido e so remove grupo vazio", async () => {
    const c = await equipe();
    req.h = await cabecalhosLogados(c.admin.email, c.a.slug);
    const r = await grupos.acaoCriarGrupo({ nome: "Turma Outubro", tipo: "TURMA" });
    if (!r.ok) throw new Error(r.erro);
    expect(await grupos.acaoCriarGrupo({ nome: "turma outubro", tipo: "ACESSO" })).toMatchObject({ ok: false, erro: expect.stringMatching(/Já existe/) });

    const v1 = (await lerGrupo(r.dados.id)).updated_at.toISOString();
    expect(await grupos.acaoRenomearGrupo({ grupoId: r.dados.id, nome: "Turma Novembro", versao: v1 })).toMatchObject({ ok: true });
    expect(await grupos.acaoRenomearGrupo({ grupoId: r.dados.id, nome: "Turma Dezembro", versao: v1 })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro/) });
    expect((await lerGrupo(r.dados.id)).nome).toBe("Turma Novembro");

    // Com membro dentro: recusa com mensagem clara; vazio: soft delete.
    const aluno = await novoUsuario();
    const v = await vincular(c.a.id, aluno.id, "ALUNO");
    expect(await gestao.acaoDefinirGruposDoMembro({ membroId: v.id, grupoIds: [r.dados.id], versao: v.updated_at.toISOString() })).toMatchObject({ ok: true });
    const v2 = (await lerGrupo(r.dados.id)).updated_at.toISOString();
    expect(await grupos.acaoRemoverGrupo({ grupoId: r.dados.id, versao: v2 })).toMatchObject({ ok: false, erro: expect.stringMatching(/tem 1 membro/) });
    const [vinc] = await db.select().from(s.criadores_membros).where(eq(s.criadores_membros.id, v.id));
    expect(await gestao.acaoDefinirGruposDoMembro({ membroId: v.id, grupoIds: [], versao: vinc.updated_at.toISOString() })).toMatchObject({ ok: true });
    expect(await grupos.acaoRemoverGrupo({ grupoId: r.dados.id, versao: v2 })).toMatchObject({ ok: true });
    expect(await lerGrupo(r.dados.id)).toMatchObject({ is_deleted: true, modified_by: c.admin.id });
    // O nome fica livre de novo (unico so entre os vivos).
    expect(await grupos.acaoCriarGrupo({ nome: "Turma Novembro", tipo: "TURMA" })).toMatchObject({ ok: true });
  });

  it("equipe de A nao renomeia nem remove grupo de B", async () => {
    const c = await equipe();
    const [gB] = await db.insert(s.criadores_grupos).values({ criador_id: c.b.id, nome: "Grupo de B", modified_by: c.donoB.id }).returning();
    req.h = await cabecalhosLogados(c.dono.email, c.a.slug);
    const v = gB.updated_at.toISOString();
    expect(await grupos.acaoRenomearGrupo({ grupoId: gB.id, nome: "Invadido", versao: v })).toMatchObject({ ok: false });
    expect(await grupos.acaoRemoverGrupo({ grupoId: gB.id, versao: v })).toMatchObject({ ok: false });
    expect(await lerGrupo(gB.id)).toEqual(gB);
  });
});

describe("importacao CSV", () => {
  it("linhas invalidas nao gravam nada; as validas entram (contas novas com link, existentes reaproveitadas)", async () => {
    const c = await equipe();
    const deB = await novoUsuario();
    await vincular(c.b.id, deB.id, "ALUNO");
    const sufixo = Date.now();
    const csv = [
      "nome;e-mail;grupo",
      `Ana Lima;ana-${sufixo}@teste.local;Turma CSV`,
      `Bruno Reis;bruno-${sufixo}@teste.local;`,
      `Sem Email;nao-e-email;Turma CSV`,
      `X;curto-${sufixo}@teste.local;`,
      `Conta Existente;${deB.email};Turma CSV`,
      `Ana Repetida;ana-${sufixo}@teste.local;`,
    ].join("\n");
    req.h = await cabecalhosLogados(c.admin.email, c.a.slug);
    const r = await membros.acaoImportarMembros({ csv });
    if (!r.ok) throw new Error(r.erro);
    expect(r.dados).toMatchObject({ criados: 2, reaproveitados: 1, jaMembros: 0, gruposCriados: ["Turma CSV"] });
    expect(r.dados.invalidas.map((e) => e.numero)).toEqual([4, 5, 7]);
    expect(r.dados.links.map((l) => l.email).sort()).toEqual([`ana-${sufixo}@teste.local`, `bruno-${sufixo}@teste.local`]);
    expect(r.dados.links.every((l) => l.url.startsWith(`http://${c.a.slug}.localhost:3011/primeiro-acesso#token=`))).toBe(true);
    expect(JSON.stringify(r)).not.toContain(c.b.slug);

    const invalidos = await db.select().from(s.usuarios).where(inArray(s.usuarios.email, ["nao-e-email", `curto-${sufixo}@teste.local`]));
    expect(invalidos).toEqual([]);
    const [turma] = await db
      .select()
      .from(s.criadores_grupos)
      .where(and(eq(s.criadores_grupos.criador_id, c.a.id), eq(s.criadores_grupos.nome, "Turma CSV")));
    const naTurma = await db.select().from(s.criadores_grupos_membros).where(eq(s.criadores_grupos_membros.grupo_id, turma.id));
    expect(naTurma).toHaveLength(2); // Ana e a conta existente
    expect(naTurma.every((x) => x.criador_id === c.a.id)).toBe(true);

    // Reimportar o mesmo arquivo: todos ja sao membros, nada duplica.
    const de2 = await membros.acaoImportarMembros({ csv });
    expect(de2).toMatchObject({ ok: true, dados: { criados: 0, jaMembros: 3 } });
  });

  it("cabecalho errado ou arquivo grande demais nao grava nada", async () => {
    const c = await equipe();
    req.h = await cabecalhosLogados(c.dono.email, c.a.slug);
    expect(await membros.acaoImportarMembros({ csv: "name,mail\nA,a@b.com" })).toMatchObject({ ok: false, erro: expect.stringMatching(/Cabeçalho/) });
    expect(await membros.acaoImportarMembros({ csv: `nome,email\n${"x".repeat(1024 * 1024)}` })).toMatchObject({ ok: false, erro: expect.stringMatching(/1 MB/) });
  });
});

describe("aparencia (cor da marca)", () => {
  it("so DONO salva; trava de colisao; a vitrine le a cor nova; B nao muda", async () => {
    const c = await equipe();
    const versaoDe = async (id: string) => (await db.select().from(s.criadores).where(eq(s.criadores.id, id)))[0].updated_at.toISOString();
    req.h = await cabecalhosLogados(c.admin.email, c.a.slug);
    expect(await aparencia.acaoSalvarCorDaMarca({ cor: "#2F6FDE", versao: await versaoDe(c.a.id) })).toMatchObject({ ok: false, erro: expect.stringMatching(/permissão/) });

    req.h = await cabecalhosLogados(c.dono.email, c.a.slug);
    const velha = await versaoDe(c.a.id);
    const r = await aparencia.acaoSalvarCorDaMarca({ cor: "#2F6FDE", versao: velha });
    expect(r).toMatchObject({ ok: true, dados: { cor: "#2f6fde" } });
    expect(await aparencia.acaoSalvarCorDaMarca({ cor: "#8E1F3A", versao: velha })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro/) });
    expect(await aparencia.acaoSalvarCorDaMarca({ cor: "red; } body { x", versao: await versaoDe(c.a.id) })).toMatchObject({ ok: false });

    const alvo = await area.alvoDosCabecalhos(cabecalhos(c.a.slug));
    expect(alvo).toMatchObject({ tipo: "criador", criador: { cor_marca: "#2f6fde" } });
    const [b] = await db.select().from(s.criadores).where(eq(s.criadores.id, c.b.id));
    expect(b.cor_marca).toBeNull();
    const trilha = await db.select().from(s.auditoria).where(and(eq(s.auditoria.registro_id, c.a.id), eq(s.auditoria.tabela, "criadores")));
    expect(trilha.some((t) => /padrão → #2f6fde/.test(t.detalhes))).toBe(true);

    // Voltar ao padrao.
    expect(await aparencia.acaoSalvarCorDaMarca({ cor: null, versao: await versaoDe(c.a.id) })).toMatchObject({ ok: true, dados: { cor: null } });
  });
});
