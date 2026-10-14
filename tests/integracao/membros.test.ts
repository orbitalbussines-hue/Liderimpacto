/**
 * Gestao de membros no PostgreSQL real, chamando as Server Actions de verdade (o `headers()`
 * do Next e simulado com host + cookie). Prova: isolamento A x B, papeis DONO x ADMIN x ALUNO,
 * ultimo DONO, identidade reaproveitada sem vazar, trava de colisao e efeito na sessao.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador, novoUsuario, superAdminPleno, vincular } from "./_apoio";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let m: typeof import("@/lib/actions/membros");
let g: typeof import("@/lib/actions/membros-gestao");
let senha: typeof import("@/lib/actions/usuarios-senha");
let sessao: typeof import("@/lib/auth/sessao");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  m = await import("@/lib/actions/membros");
  g = await import("@/lib/actions/membros-gestao");
  senha = await import("@/lib/actions/usuarios-senha");
  sessao = await import("@/lib/auth/sessao");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const lerVinculo = async (id: string) => (await db.select().from(s.criadores_membros).where(eq(s.criadores_membros.id, id)))[0];
const versao = async (id: string) => (await lerVinculo(id)).updated_at.toISOString();

async function grupo(criadorId: string, nome = `Turma ${Math.random()}`) {
  const [x] = await db.insert(s.criadores_grupos).values({ criador_id: criadorId, nome, modified_by: criadorId }).returning();
  return x;
}

/** Cenario: criadores A e B; DONO e ADMIN em A; aluno em A; aluno em B. */
async function cenario() {
  const a = await novoCriador("Criador A");
  const b = await novoCriador("Criador B");
  const dono = await novoUsuario();
  const admin = await novoUsuario();
  const alunoA = await novoUsuario();
  const alunoB = await novoUsuario();
  const vDono = await vincular(a.id, dono.id, "DONO");
  const vAdmin = await vincular(a.id, admin.id, "ADMIN");
  const vAlunoA = await vincular(a.id, alunoA.id, "ALUNO");
  const vAlunoB = await vincular(b.id, alunoB.id, "ALUNO");
  return { a, b, dono, admin, alunoA, alunoB, vDono, vAdmin, vAlunoA, vAlunoB };
}

describe("membros: isolamento entre criadores", () => {
  it("ADMIN de A nao le nem altera nada de B, mesmo passando ids de B", async () => {
    const c = await cenario();
    const grupoB = await grupo(c.b.id);
    const antesB = await lerVinculo(c.vAlunoB.id);
    req.h = await cabecalhosLogados(c.admin.email, c.a.slug);

    const vB = antesB.updated_at.toISOString();
    expect(await g.acaoAlterarSituacaoMembro({ membroId: c.vAlunoB.id, status: "INATIVO", versao: vB })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado/) });
    expect(await g.acaoRemoverMembro({ membroId: c.vAlunoB.id, versao: vB })).toMatchObject({ ok: false });
    expect(await g.acaoDefinirGruposDoMembro({ membroId: c.vAlunoB.id, grupoIds: [], versao: vB })).toMatchObject({ ok: false });
    // Grupo de B para membro de A: recusado (e a FK composta tambem recusaria).
    expect(await g.acaoDefinirGruposDoMembro({ membroId: c.vAlunoA.id, grupoIds: [grupoB.id], versao: await versao(c.vAlunoA.id) })).toMatchObject({
      ok: false,
      erro: expect.stringMatching(/Grupo inválido/),
    });
    expect(await m.acaoCadastrarMembro({ nome: "Nova Pessoa", email: `nova-${Date.now()}@teste.local`, papel: "ALUNO", grupoIds: [grupoB.id] })).toMatchObject({ ok: false });
    expect(await senha.acaoGerarLinkDeSenha({ usuarioId: c.alunoB.id, motivo: "tentando abrir B" })).toMatchObject({ ok: false, erro: expect.stringMatching(/não é membro/) });

    const depoisB = await lerVinculo(c.vAlunoB.id);
    expect(depoisB).toEqual(antesB);
    const [gm] = await db.select().from(s.criadores_grupos_membros).where(eq(s.criadores_grupos_membros.grupo_id, grupoB.id));
    expect(gm).toBeUndefined();

    // O criador vem do HOST: o cookie de A levado ao host de B nao abre nada.
    const h = new Headers(req.h);
    h.set("host", `${c.b.slug}.localhost:3011`);
    req.h = h;
    expect(await g.acaoRemoverMembro({ membroId: c.vAlunoB.id, versao: vB })).toMatchObject({ ok: false, erro: expect.stringMatching(/Sessão expirada/) });
  });
});

describe("membros: papeis", () => {
  it("ADMIN gerencia so ALUNO; DONO gerencia a equipe; ALUNO nao gerencia nada", async () => {
    const c = await cenario();
    req.h = await cabecalhosLogados(c.admin.email, c.a.slug);
    expect(await m.acaoCadastrarMembro({ nome: "Aluno Novo", email: `a-${Date.now()}@teste.local`, papel: "ALUNO" })).toMatchObject({ ok: true });
    expect(await m.acaoCadastrarMembro({ nome: "Admin Novo", email: `b-${Date.now()}@teste.local`, papel: "ADMIN" })).toMatchObject({ ok: false, erro: expect.stringMatching(/permissão/) });
    expect(await g.acaoMudarPapel({ membroId: c.vAlunoA.id, papel: "ADMIN", versao: await versao(c.vAlunoA.id) })).toMatchObject({ ok: false });
    expect(await g.acaoAlterarSituacaoMembro({ membroId: c.vDono.id, status: "INATIVO", versao: await versao(c.vDono.id) })).toMatchObject({ ok: false, erro: expect.stringMatching(/permissão/) });
    expect(await g.acaoAlterarSituacaoMembro({ membroId: c.vAlunoA.id, status: "INATIVO", versao: await versao(c.vAlunoA.id) })).toMatchObject({ ok: true });

    req.h = await cabecalhosLogados(c.dono.email, c.a.slug);
    expect(await m.acaoCadastrarMembro({ nome: "Admin Novo", email: `c-${Date.now()}@teste.local`, papel: "ADMIN" })).toMatchObject({ ok: true });
    expect(await m.acaoCadastrarMembro({ nome: "Dono Novo", email: `d-${Date.now()}@teste.local`, papel: "DONO" })).toMatchObject({ ok: false });
    expect(await g.acaoMudarPapel({ membroId: c.vAdmin.id, papel: "DONO", versao: await versao(c.vAdmin.id) })).toMatchObject({ ok: true });
    const trilha = await db.select().from(s.auditoria).where(and(eq(s.auditoria.registro_id, c.vAdmin.id), eq(s.auditoria.acao, "atualizar")));
    expect(trilha.some((t) => /ADMIN → DONO/.test(t.detalhes) && t.user_id === c.dono.id && t.criador_id === c.a.id)).toBe(true);

    const aluno = await novoUsuario();
    await vincular(c.a.id, aluno.id, "ALUNO");
    req.h = await cabecalhosLogados(aluno.email, c.a.slug);
    expect(await m.acaoCadastrarMembro({ nome: "Fulano", email: `e-${Date.now()}@teste.local`, papel: "ALUNO" })).toMatchObject({ ok: false, erro: expect.stringMatching(/permissão/) });
    expect(await g.acaoRemoverMembro({ membroId: c.vAlunoA.id, versao: await versao(c.vAlunoA.id) })).toMatchObject({ ok: false });
  });

  it("o ultimo DONO ativo nao sai: nem rebaixado, nem inativado, nem removido", async () => {
    const c = await cenario();
    req.h = await cabecalhosLogados(c.dono.email, c.a.slug);
    expect(await g.acaoMudarPapel({ membroId: c.vDono.id, papel: "ADMIN", versao: await versao(c.vDono.id) })).toMatchObject({ ok: false, erro: expect.stringMatching(/pelo menos um DONO/) });

    // SUPER_ADMIN (suporte, conta como DONO) tambem nao tira o unico DONO.
    const { h } = await superAdminPleno(c.a.slug);
    req.h = h;
    expect(await g.acaoAlterarSituacaoMembro({ membroId: c.vDono.id, status: "INATIVO", versao: await versao(c.vDono.id) })).toMatchObject({ ok: false, erro: expect.stringMatching(/pelo menos um DONO/) });
    expect(await g.acaoRemoverMembro({ membroId: c.vDono.id, versao: await versao(c.vDono.id) })).toMatchObject({ ok: false, erro: expect.stringMatching(/pelo menos um DONO/) });

    // Com um segundo DONO, o rebaixamento passa (inclusive o proprio).
    expect(await g.acaoMudarPapel({ membroId: c.vAdmin.id, papel: "DONO", versao: await versao(c.vAdmin.id) })).toMatchObject({ ok: true });
    req.h = await cabecalhosLogados(c.dono.email, c.a.slug);
    expect(await g.acaoMudarPapel({ membroId: c.vDono.id, papel: "ADMIN", versao: await versao(c.vDono.id) })).toMatchObject({ ok: true });
    expect((await lerVinculo(c.vDono.id)).papel).toBe("ADMIN");
  });
});

describe("membros: cadastro", () => {
  it("conta nova nasce sem senha e o link de primeiro acesso volta para a tela, no host da area", async () => {
    const c = await cenario();
    const turma = await grupo(c.a.id);
    req.h = await cabecalhosLogados(c.admin.email, c.a.slug);
    const email = `nova-${Date.now()}@teste.local`;
    const r = await m.acaoCadastrarMembro({ nome: "Maria da Silva", email: email.toUpperCase(), papel: "ALUNO", grupoIds: [turma.id] });
    if (!r.ok) throw new Error(r.erro);
    expect(r.dados.link?.url.startsWith(`http://${c.a.slug}.localhost:3011/primeiro-acesso#token=`)).toBe(true);
    const [u] = await db.select().from(s.usuarios).where(eq(s.usuarios.email, email));
    expect(u.nome).toBe("Maria da Silva");
    const [conta] = await db.select().from(s.usuarios_contas).where(eq(s.usuarios_contas.usuario_id, u.id));
    expect(conta.senha_hash).toBeNull();
    const [v] = await db.select().from(s.criadores_membros).where(eq(s.criadores_membros.usuario_id, u.id));
    expect(v).toMatchObject({ criador_id: c.a.id, papel: "ALUNO", status: "ATIVO" });
    const [gm] = await db.select().from(s.criadores_grupos_membros).where(eq(s.criadores_grupos_membros.membro_id, v.id));
    expect(gm.grupo_id).toBe(turma.id);
    const trilha = await db.select().from(s.auditoria).where(eq(s.auditoria.registro_id, u.id));
    expect(JSON.stringify(trilha)).not.toContain(new URL(r.dados.link!.url).hash.replace("#token=", ""));
  });

  it("e-mail que ja existe em outro criador reaproveita a identidade, sem link e sem vazar dados de la", async () => {
    const c = await cenario();
    req.h = await cabecalhosLogados(c.admin.email, c.a.slug);
    const r = await m.acaoCadastrarMembro({ nome: "Outro Nome Qualquer", email: c.alunoB.email, papel: "ALUNO" });
    if (!r.ok) throw new Error(r.erro);
    expect(r.dados).toMatchObject({ link: null, emailEnviado: false });
    expect(r.dados.aviso).toMatch(/já tem conta/);
    const texto = JSON.stringify(r);
    expect(texto).not.toContain(c.b.slug);
    expect(texto).not.toContain(c.b.nome);
    const [u] = await db.select().from(s.usuarios).where(eq(s.usuarios.id, c.alunoB.id));
    expect(u.nome).toBe("Pessoa de Teste"); // o nome digitado em A nao sobrescreve a conta
    const vinculos = await db.select().from(s.criadores_membros).where(eq(s.criadores_membros.usuario_id, c.alunoB.id));
    expect(vinculos.map((v) => v.criador_id).sort()).toEqual([c.a.id, c.b.id].sort());
    expect(await m.acaoCadastrarMembro({ nome: "De Novo", email: c.alunoB.email, papel: "ALUNO" })).toMatchObject({ ok: false, erro: expect.stringMatching(/já é membro/) });
  });
});

describe("membros: trava, remocao e efeito no acesso", () => {
  it("segunda gravacao com updated_at velho falha; inativar derruba a sessao; remover e logico", async () => {
    const c = await cenario();
    const cookieAluno = await cabecalhosLogados(c.alunoA.email, c.a.slug);
    req.h = await cabecalhosLogados(c.dono.email, c.a.slug);
    const velha = await versao(c.vAlunoA.id);
    expect(await g.acaoMudarPapel({ membroId: c.vAlunoA.id, papel: "ADMIN", versao: velha })).toMatchObject({ ok: true });
    expect(await g.acaoMudarPapel({ membroId: c.vAlunoA.id, papel: "ALUNO", versao: velha })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro/) });

    expect(await sessao.sessaoDosCabecalhos(cookieAluno)).not.toBeNull();
    expect(await g.acaoAlterarSituacaoMembro({ membroId: c.vAlunoA.id, status: "INATIVO", versao: await versao(c.vAlunoA.id) })).toMatchObject({ ok: true });
    expect(await sessao.sessaoDosCabecalhos(cookieAluno)).toBeNull();

    expect(await g.acaoRemoverMembro({ membroId: c.vAlunoA.id, versao: await versao(c.vAlunoA.id) })).toMatchObject({ ok: true });
    const removido = await lerVinculo(c.vAlunoA.id);
    expect(removido).toMatchObject({ is_deleted: true, modified_by: c.dono.id });
    const [u] = await db.select().from(s.usuarios).where(eq(s.usuarios.id, c.alunoA.id));
    expect(u.is_deleted).toBe(false); // a identidade global continua
    // Pode voltar: cadastrar de novo cria um vinculo novo (o removido fica no historico).
    expect(await m.acaoCadastrarMembro({ nome: "Volta", email: c.alunoA.email, papel: "ALUNO" })).toMatchObject({ ok: true });
  });
});
