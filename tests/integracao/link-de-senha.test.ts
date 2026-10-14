/**
 * Primeiro acesso / redefinicao pelo link no PostgreSQL real. Trava o contrato com o Better
 * Auth: o token e criado por nos (`gerarLinkDeSenha`) e consumido por `auth.api.resetPassword`
 * — se uma atualizacao da biblioteca mudar isso, o link para de valer e este teste quebra.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { cabecalhos, cookieDeSessao, novoCriador, novoUsuario, SENHA_BOA, trilhaDe, vincular } from "./_apoio";

const SENHA_NOVA = "cadeira de balanco na varanda verde";

let rec: typeof import("@/lib/auth/recuperacao");
let link: typeof import("@/lib/auth/link-de-senha");
let sessao: typeof import("@/lib/auth/sessao");
let kdf: typeof import("@/lib/auth/senha-kdf");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  rec = await import("@/lib/auth/recuperacao");
  link = await import("@/lib/auth/link-de-senha");
  sessao = await import("@/lib/auth/sessao");
  kdf = await import("@/lib/auth/senha-kdf");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const tokenDe = (url: string) => new URL(url).hash.replace("#token=", "");

describe("link de definir senha", () => {
  it("primeiro acesso: o link do host do criador define a senha e e de USO UNICO", async () => {
    const c = await novoCriador();
    const u = await novoUsuario({ senha: null });
    await vincular(c.id, u.id, "ALUNO");
    const { url } = await rec.gerarLinkDeSenha(u.id, c, null);
    expect(url.startsWith(`http://${c.slug}.localhost:3011/primeiro-acesso#token=`)).toBe(true);
    const token = tokenDe(url);

    expect(await rec.redefinirSenha(token, SENHA_NOVA, cabecalhos(c.slug))).toBe("ok");
    const [conta] = await db.select().from(s.usuarios_contas).where(eq(s.usuarios_contas.usuario_id, u.id));
    expect(await kdf.conferirSenha(conta.senha_hash!, SENHA_NOVA)).toBe(true);
    expect(conta.modified_by).toBe(u.id);
    expect(await rec.redefinirSenha(token, "outra frase qualquer bem longa", cabecalhos(c.slug))).toBe("link-invalido");
    expect((await trilhaDe(u.id)).filter((t) => t.acao === "senha").length).toBeGreaterThanOrEqual(2); // emissao + definicao
  });

  it("link expirado e link substituido nao valem", async () => {
    const u = await novoUsuario({ senha: null });
    const expirado = tokenDe((await rec.gerarLinkDeSenha(u.id, null, null, -1)).url);
    expect(await rec.redefinirSenha(expirado, SENHA_NOVA, cabecalhos(null))).toBe("link-invalido");

    const primeiro = tokenDe((await rec.gerarLinkDeSenha(u.id, null, null)).url);
    const segundo = tokenDe((await rec.gerarLinkDeSenha(u.id, null, null)).url);
    expect(await rec.donoDoLink(primeiro)).toBeNull();
    expect(await rec.redefinirSenha(primeiro, SENHA_NOVA, cabecalhos(null))).toBe("link-invalido");
    expect(await rec.redefinirSenha(segundo, SENHA_NOVA, cabecalhos(null))).toBe("ok");
  });

  it("equipe gera para quem esta abaixo dela, so no proprio criador; trilha guarda o ato, nunca o token", async () => {
    const a = await novoCriador();
    const b = await novoCriador();
    const dono = await novoUsuario();
    await vincular(a.id, dono.id, "DONO");
    const admin = await novoUsuario();
    await vincular(a.id, admin.id, "ADMIN");
    const aluno = await novoUsuario({ senha: null });
    await vincular(a.id, aluno.id, "ALUNO");
    const alunoDeDois = await novoUsuario({ senha: null });
    await vincular(a.id, alunoDeDois.id, "ALUNO");
    await vincular(b.id, alunoDeDois.id, "ALUNO");

    const sessaoDe = async (email: string) => {
      const h = cabecalhos(a.slug);
      h.set("cookie", await cookieDeSessao(email, SENHA_BOA, cabecalhos(a.slug)));
      return (await sessao.sessaoDosCabecalhos(h)) as import("@/lib/auth/sessao").SessaoAtiva;
    };
    const comoDono = await sessaoDe(dono.email);
    const comoAdmin = await sessaoDe(admin.email);

    const gerado = await link.emitirLinkDeSenha(comoAdmin, aluno.id, "primeiro acesso do aluno");
    expect(gerado.url).toContain(`${a.slug}.localhost`);
    await expect(link.emitirLinkDeSenha(comoAdmin, dono.id, "tentando abrir o dono")).rejects.toThrow(/abaixo/);
    await expect(link.emitirLinkDeSenha(comoDono, alunoDeDois.id, "aluno de duas areas")).rejects.toThrow(/outra área/);
    await expect(link.emitirLinkDeSenha(comoDono, dono.id, "para mim")).rejects.toThrow(/Conta/);

    const trilha = await db.select().from(s.auditoria).where(eq(s.auditoria.registro_id, aluno.id));
    const emissao = trilha.find((t) => t.acao === "senha" && t.user_id === admin.id);
    expect(emissao?.criador_id).toBe(a.id);
    expect(emissao?.detalhes).toMatch(/primeiro acesso do aluno/);
    expect(JSON.stringify(trilha)).not.toContain(tokenDe(gerado.url));
  });
});
