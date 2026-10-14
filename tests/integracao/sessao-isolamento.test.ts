/**
 * Sessao e isolamento entre criadores no PostgreSQL real: papel e vinculo lidos do banco a
 * cada requisicao, cookie que so vale no host de origem, membro de A sem acesso a B.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { cabecalhos, cookieDeSessao, novoCriador, novoUsuario, SENHA_BOA, trilhaDe, vincular } from "./_apoio";

let sessao: typeof import("@/lib/auth/sessao");
let autz: typeof import("@/lib/auth/autorizacao");
let perm: typeof import("@/lib/auth/permissoes");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  sessao = await import("@/lib/auth/sessao");
  autz = await import("@/lib/auth/autorizacao");
  perm = await import("@/lib/auth/permissoes");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

/** Requisicao "no navegador": host + cookie da sessao. */
async function requisicao(slug: string | null, cookie: string) {
  const h = cabecalhos(slug);
  h.set("cookie", cookie);
  return sessao.sessaoDosCabecalhos(h);
}

describe("sessao e isolamento entre criadores", () => {
  it("papel rebaixado vale na requisicao SEGUINTE (nada fica no token)", async () => {
    const criador = await novoCriador();
    const u = await novoUsuario();
    const membro = await vincular(criador.id, u.id, "ADMIN");
    const cookie = await cookieDeSessao(u.email, SENHA_BOA, cabecalhos(criador.slug));

    const antes = await requisicao(criador.slug, cookie);
    expect(antes).not.toBeNull();
    expect(await autz.avaliarMembro(antes as never, perm.EQUIPE)).toMatchObject({ criador: { id: criador.id }, membro: { papel: "ADMIN" } });

    await db.update(s.criadores_membros).set({ papel: "ALUNO" }).where(eq(s.criadores_membros.id, membro.id));
    const depois = await requisicao(criador.slug, cookie);
    expect(await autz.avaliarMembro(depois as never, perm.EQUIPE)).toBeNull();
    expect((await trilhaDe(u.id)).some((t) => t.acao === "acesso_negado" && t.criador_id === criador.id)).toBe(true);
    // Continua aluno: a area do aluno abre.
    expect(await autz.avaliarMembro(depois as never, perm.TODOS_OS_MEMBROS)).not.toBeNull();

    // Vinculo INATIVO: a sessao cai na proxima requisicao; conta desativada tambem.
    await db.update(s.criadores_membros).set({ status: "INATIVO" }).where(eq(s.criadores_membros.id, membro.id));
    expect(await requisicao(criador.slug, cookie)).toBeNull();
    await db.update(s.criadores_membros).set({ status: "ATIVO" }).where(eq(s.criadores_membros.id, membro.id));
    expect(await requisicao(criador.slug, cookie)).not.toBeNull();
    await db.update(s.usuarios).set({ ativo: false }).where(eq(s.usuarios.id, u.id));
    expect(await requisicao(criador.slug, cookie)).toBeNull();
  });

  it("membro de A nao acessa B: nem com login, nem levando o cookie de A para o host de B", async () => {
    const a = await novoCriador("Criador A");
    const b = await novoCriador("Criador B");
    const u = await novoUsuario();
    await vincular(a.id, u.id, "DONO");
    const cookieDeA = await cookieDeSessao(u.email, SENHA_BOA, cabecalhos(a.slug));

    expect(await requisicao(a.slug, cookieDeA)).not.toBeNull();
    // Cookie copiado para outro host: a sessao nasceu em A e so vale em A.
    expect(await requisicao(b.slug, cookieDeA)).toBeNull();
    expect(await requisicao(null, cookieDeA)).toBeNull();
    // Login direto no host de B: o funil recusa (sem vinculo), a sessao nem nasce.
    await expect(cookieDeSessao(u.email, SENHA_BOA, cabecalhos(b.slug))).rejects.toThrow();

    // Mesmo que tivesse uma sessao "valida" em B, exigirMembro olha o criador DO HOST.
    const emA = (await requisicao(a.slug, cookieDeA))!;
    const forjada = { ...emA, alvo: { tipo: "criador" as const, criador: { ...b, cor_marca: null } }, acesso: { superAdmin: false, membro: null } };
    expect(await autz.avaliarMembro(forjada as never, perm.TODOS_OS_MEMBROS)).toBeNull();
  });

  it("criador SUSPENSO fecha a area na proxima requisicao", async () => {
    const c = await novoCriador();
    const u = await novoUsuario();
    await vincular(c.id, u.id, "DONO");
    const cookie = await cookieDeSessao(u.email, SENHA_BOA, cabecalhos(c.slug));
    await db.update(s.criadores).set({ status: "SUSPENSO" }).where(eq(s.criadores.id, c.id));
    expect(await requisicao(c.slug, cookie)).toBeNull();
  });

  it("SUPER_ADMIN entra em qualquer criador como DONO, e a entrada fica marcada como suporte", async () => {
    const c = await novoCriador();
    const admin = await novoUsuario({ papelPlataforma: "SUPER_ADMIN" });
    // TOTP confirmado direto no banco: aqui so interessa o acesso, nao o cadastro.
    await db.insert(s.usuarios_totp).values({ usuario_id: admin.id, segredo: "x", codigos_recuperacao: "x", verificado: true });
    const cookie = await cookieDeSessao(admin.email, SENHA_BOA, cabecalhos(c.slug)).catch(() => null);
    // Com 2FA ligado a senha sozinha nao abre sessao (o plugin pede o codigo): flag ainda desligada aqui.
    expect(cookie).not.toBeNull();
    const lida = await requisicao(c.slug, cookie!);
    expect(lida?.provisoria).toBe(true); // flag do plugin desligada = politica nao cumprida
    await db.update(s.usuarios).set({ two_factor_enabled: true }).where(eq(s.usuarios.id, admin.id));
    const plena = await requisicao(c.slug, cookie!);
    expect(plena?.provisoria).toBe(false);
    expect(await autz.avaliarMembro(plena as never, perm.EQUIPE)).toMatchObject({ membro: { papel: "DONO", superAdmin: true, id: null } });
    expect((await trilhaDe(admin.id)).some((t) => t.acao === "login" && /suporte/.test(t.detalhes) && t.criador_id === c.id)).toBe(true);
    // Cookie por host vale ate para quem entra em todo lugar: a sessao de C nao abre D nem o apex.
    const d = await novoCriador();
    expect(await requisicao(d.slug, cookie!)).toBeNull();
    expect(await requisicao(null, cookie!)).toBeNull();
  });

  it("o banco recusa grupo de A com membro de B (FK composta)", async () => {
    const a = await novoCriador();
    const b = await novoCriador();
    const u = await novoUsuario({ senha: null });
    const membroB = await vincular(b.id, u.id, "ALUNO");
    const [grupoA] = await db.insert(s.criadores_grupos).values({ criador_id: a.id, nome: "Turma 1", modified_by: randomUUID() }).returning();
    await expect(
      db.insert(s.criadores_grupos_membros).values({ criador_id: a.id, grupo_id: grupoA.id, membro_id: membroB.id, modified_by: randomUUID() }),
    ).rejects.toThrow();
    await expect(
      db.insert(s.criadores_grupos_membros).values({ criador_id: b.id, grupo_id: grupoA.id, membro_id: membroB.id, modified_by: randomUUID() }),
    ).rejects.toThrow();
  });
});
