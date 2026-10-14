/**
 * Login no PostgreSQL real: recusa uniforme, bloqueio por conta, SUPER_ADMIN provisorio e
 * a trilha dos eventos da regua (docs/seguranca-login.md).
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { cabecalhos, cookieDeSessao, novoCriador, novoUsuario, SENHA_BOA, trilhaDe, vincular } from "./_apoio";

let login: typeof import("@/lib/auth/login");
let sessao: typeof import("@/lib/auth/sessao");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  login = await import("@/lib/auth/login");
  sessao = await import("@/lib/auth/sessao");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const entrar = (email: string, senha: string, h: Headers) => login.tentarLogin(email, senha, true, h.get("x-real-ip")!, h);

describe("login", () => {
  it("recusa UNIFORME: senha errada, sem conta, inativo e sem vinculo no criador dao a mesma resposta", async () => {
    const criador = await novoCriador();
    const outro = await novoCriador();
    const ativo = await novoUsuario();
    await vincular(criador.id, ativo.id, "ALUNO");
    const inativo = await novoUsuario({ ativo: false });
    await vincular(criador.id, inativo.id, "ALUNO");
    const deOutro = await novoUsuario();
    await vincular(outro.id, deOutro.id, "ALUNO");
    const vinculoInativo = await novoUsuario();
    await vincular(criador.id, vinculoInativo.id, "ALUNO", "INATIVO");

    const recusas = [
      await entrar(ativo.email, "senha errada mas bem comprida", cabecalhos(criador.slug)),
      await entrar("ninguem-aqui@teste.local", SENHA_BOA, cabecalhos(criador.slug)),
      await entrar(inativo.email, SENHA_BOA, cabecalhos(criador.slug)),
      await entrar(deOutro.email, SENHA_BOA, cabecalhos(criador.slug)), // senha certa, criador errado
      await entrar(vinculoInativo.email, SENHA_BOA, cabecalhos(criador.slug)),
      await entrar(ativo.email, SENHA_BOA, cabecalhos(null)), // aluno no apex: so SUPER_ADMIN
    ];
    for (const r of recusas) expect(r).toEqual({ ok: false, erro: login.MSG_LOGIN_RECUSADO });
    // Ordem das chaves tambem igual (a regua compara byte a byte).
    expect(new Set(recusas.map((r) => JSON.stringify(r))).size).toBe(1);

    expect(await entrar(ativo.email, SENHA_BOA, cabecalhos(criador.slug))).toEqual({ ok: true, proximo: "entrar" });
    // Senha certa no criador errado nao conta como falha de senha.
    const [semFalha] = await db.select({ falhas: s.usuarios.falhas_login }).from(s.usuarios).where(eq(s.usuarios.id, deOutro.id));
    expect(semFalha.falhas).toBe(0);

    const trilhaOutro = await trilhaDe(deOutro.id);
    expect(trilhaOutro.some((t) => t.acao === "login_recusado" && /sem vínculo/.test(t.detalhes) && t.criador_id === criador.id)).toBe(true);
    const trilhaAtivo = await trilhaDe(ativo.id);
    expect(trilhaAtivo.some((t) => t.acao === "login" && t.criador_id === criador.id)).toBe(true);
    expect(trilhaAtivo.some((t) => t.acao === "login_recusado" && /Senha incorreta/.test(t.detalhes))).toBe(true);
  });

  it("bloqueio por CONTA: 5 senhas erradas trancam por 15 min, ate a senha certa e recusada", async () => {
    const criador = await novoCriador();
    const u = await novoUsuario();
    await vincular(criador.id, u.id, "ALUNO");
    for (let i = 0; i < login.MAX_FALHAS_CONTA; i++) {
      // IP novo a cada tentativa: o bloqueio e da conta, nao do IP.
      expect((await entrar(u.email, `errada numero ${i} bem comprida`, cabecalhos(criador.slug))).ok).toBe(false);
    }
    const [conta] = await db.select().from(s.usuarios).where(eq(s.usuarios.id, u.id));
    expect(conta.falhas_login).toBe(5);
    expect(conta.bloqueado_ate!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(await entrar(u.email, SENHA_BOA, cabecalhos(criador.slug))).toEqual({ ok: false, erro: login.MSG_LOGIN_RECUSADO });
    const trilha = await trilhaDe(u.id);
    expect(trilha.filter((t) => t.acao === "conta_bloqueada")).toHaveLength(1);
  });

  it("SUPER_ADMIN sem TOTP entra com sessao PROVISORIA (so cadastra o fator)", async () => {
    const admin = await novoUsuario({ papelPlataforma: "SUPER_ADMIN" });
    expect(await entrar(admin.email, SENHA_BOA, cabecalhos(null))).toEqual({ ok: true, proximo: "entrar" });
    const h = cabecalhos(null);
    h.set("cookie", await cookieDeSessao(admin.email, SENHA_BOA, h));
    const lida = await sessao.sessaoDosCabecalhos(h);
    expect(lida?.provisoria).toBe(true);
    expect(lida?.acesso.superAdmin).toBe(true);
    expect((await trilhaDe(admin.id)).some((t) => t.acao === "login" && /provisória/.test(t.detalhes))).toBe(true);
  });

  it("tentativa com e-mail inexistente fica na trilha como evento anonimo (sem o e-mail em claro)", async () => {
    const criador = await novoCriador();
    const email = `fantasma-${Date.now()}@teste.local`;
    await entrar(email, SENHA_BOA, cabecalhos(criador.slug));
    const linhas = await db.select().from(s.auditoria).where(eq(s.auditoria.criador_id, criador.id));
    expect(linhas.some((t) => t.user_id === null && /e-mail inexistente/.test(t.detalhes) && !t.detalhes.includes(email))).toBe(true);
  });
});
