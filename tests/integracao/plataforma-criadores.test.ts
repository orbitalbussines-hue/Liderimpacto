/**
 * Area da plataforma no PostgreSQL real, pelas Server Actions (headers() simulado): so o
 * SUPER_ADMIN no apex cria criador (com DONO e link no host novo) e suspende — suspenso, a area
 * responde 404 e as sessoes de la caem na proxima requisicao.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhos, cabecalhosLogados, novoCriador, novoUsuario, superAdminPleno, vincular } from "./_apoio";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let acoes: typeof import("@/lib/actions/criadores");
let area: typeof import("@/lib/criador/area");
let sessao: typeof import("@/lib/auth/sessao");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  acoes = await import("@/lib/actions/criadores");
  area = await import("@/lib/criador/area");
  sessao = await import("@/lib/auth/sessao");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const slugNovo = () => `n-${randomBytes(4).toString("hex")}`;
const dados = (slug: string, extra: Record<string, string> = {}) => ({
  nome: "Escola Nova",
  slug,
  cor: "",
  donoNome: "Dona da Escola",
  donoEmail: `dona-${slug}@teste.local`,
  ...extra,
});

describe("plataforma: criadores", () => {
  it("SUPER_ADMIN no apex cria o criador, o DONO e o link no host da area nova", async () => {
    const { usuario, h } = await superAdminPleno(null);
    req.h = h;
    const slug = slugNovo();
    const r = await acoes.acaoCriarCriador(dados(slug.toUpperCase(), { cor: "#2E9E5B" }));
    if (!r.ok) throw new Error(r.erro);
    expect(r.dados.slug).toBe(slug);
    expect(r.dados.link?.url.startsWith(`http://${slug}.localhost:3011/primeiro-acesso#token=`)).toBe(true);
    const [c] = await db.select().from(s.criadores).where(eq(s.criadores.id, r.dados.id));
    expect(c).toMatchObject({ slug, cor_marca: "#2e9e5b", status: "ATIVO", modified_by: usuario.id });
    const [v] = await db.select().from(s.criadores_membros).where(eq(s.criadores_membros.criador_id, c.id));
    expect(v.papel).toBe("DONO");
    const trilha = await db.select().from(s.auditoria).where(eq(s.auditoria.criador_id, c.id));
    expect(trilha.map((t) => t.tabela)).toEqual(expect.arrayContaining(["criadores", "usuarios", "criadores_membros"]));

    expect(await acoes.acaoCriarCriador(dados(slug))).toMatchObject({ ok: false, erro: expect.stringMatching(/em uso/) });
    for (const ruim of ["www", "admin", "api", "app", "plataforma", "-x", "x-", "com espaco", "ação"]) {
      expect(await acoes.acaoCriarCriador(dados(ruim))).toMatchObject({ ok: false, erro: expect.stringMatching(/Endereço inválido/) });
    }
  });

  it("DONO de um criador e SUPER_ADMIN fora do apex nao criam nem suspendem criador", async () => {
    const c = await novoCriador();
    const dono = await novoUsuario();
    await vincular(c.id, dono.id, "DONO");
    req.h = await cabecalhosLogados(dono.email, c.slug);
    expect(await acoes.acaoCriarCriador(dados(slugNovo()))).toMatchObject({ ok: false, erro: expect.stringMatching(/permissão/) });
    expect(await acoes.acaoAlterarSituacaoCriador({ criadorId: c.id, status: "SUSPENSO", versao: c.updated_at.toISOString() })).toMatchObject({ ok: false });

    req.h = (await superAdminPleno(c.slug)).h;
    expect(await acoes.acaoCriarCriador(dados(slugNovo()))).toMatchObject({ ok: false, erro: expect.stringMatching(/permissão/) });
    const [ainda] = await db.select().from(s.criadores).where(eq(s.criadores.id, c.id));
    expect(ainda.status).toBe("ATIVO");
  });

  it("suspender derruba a area (404) e a sessao de quem estava la; reativar devolve", async () => {
    const c = await novoCriador();
    const aluno = await novoUsuario();
    await vincular(c.id, aluno.id, "ALUNO");
    const naArea = await cabecalhosLogados(aluno.email, c.slug);
    expect(await sessao.sessaoDosCabecalhos(naArea)).not.toBeNull();

    req.h = (await superAdminPleno(null)).h;
    const r = await acoes.acaoAlterarSituacaoCriador({ criadorId: c.id, status: "SUSPENSO", versao: c.updated_at.toISOString() });
    expect(r).toMatchObject({ ok: true });
    expect(await area.alvoDosCabecalhos(cabecalhos(c.slug))).toBeNull();
    expect(await sessao.sessaoDosCabecalhos(naArea)).toBeNull();
    // Versao velha: colisao.
    expect(await acoes.acaoAlterarSituacaoCriador({ criadorId: c.id, status: "ATIVO", versao: c.updated_at.toISOString() })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro/) });

    const [atual] = await db.select().from(s.criadores).where(eq(s.criadores.id, c.id));
    expect(await acoes.acaoAlterarSituacaoCriador({ criadorId: c.id, status: "ATIVO", versao: atual.updated_at.toISOString() })).toMatchObject({ ok: true });
    expect(await area.alvoDosCabecalhos(cabecalhos(c.slug))).not.toBeNull();
  });
});
