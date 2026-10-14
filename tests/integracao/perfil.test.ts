/**
 * "Meu perfil" > Dados pessoais (acaoSalvarPerfil) no PostgreSQL real: sessão obrigatória, alvo
 * SEMPRE a pessoa da sessão (id no corpo é recusado), trava de colisão pela versão, WhatsApp
 * validado e trilha antes → depois na mesma transação.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhos, cabecalhosLogados, novoCriador } from "./_apoio";
import { ok } from "./_catalogo";
import { membroCom } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let perfil: typeof import("@/lib/actions/perfil");
let consultas: typeof import("@/lib/perfil/consultas");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  perfil = await import("@/lib/actions/perfil");
  consultas = await import("@/lib/perfil/consultas");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const lerUsuario = async (id: string) => (await db.select().from(s.usuarios).where(eq(s.usuarios.id, id)))[0];

describe("acaoSalvarPerfil", () => {
  it("salva nome, WhatsApp (só dígitos) e empresa da pessoa da SESSÃO, com trilha antes → depois", async () => {
    const cr = await novoCriador();
    const al = await membroCom(cr.id);
    req.h = await cabecalhosLogados(al.usuario.email, cr.slug);
    const dados = (await consultas.dadosDoPerfil(al.usuario.id, cr.id))!;
    const r = ok(await perfil.acaoSalvarPerfil({ nome: "Ana Nova", whatsapp: "(11) 99999-0000", empresaCargo: "Diretora", versao: dados.versao }));
    const u = await lerUsuario(al.usuario.id);
    expect(u).toMatchObject({ nome: "Ana Nova", whatsapp: "11999990000", empresa_cargo: "Diretora", modified_by: al.usuario.id });
    expect(r.versao).toBe(u.updated_at.toISOString());
    const [linha] = await db
      .select()
      .from(s.auditoria)
      .where(and(eq(s.auditoria.user_id, al.usuario.id), eq(s.auditoria.tabela, "usuarios"), eq(s.auditoria.acao, "atualizar")));
    expect(linha).toMatchObject({ criador_id: cr.id, dados_anteriores: { nome: "Pessoa de Teste", whatsapp: null, empresaCargo: null } });
    expect(linha.dados_novos).toEqual({ nome: "Ana Nova", whatsapp: "11999990000", empresaCargo: "Diretora" });
    // Vazio limpa (vira nulo).
    ok(await perfil.acaoSalvarPerfil({ nome: "Ana Nova", whatsapp: "", empresaCargo: "", versao: r.versao }));
    expect(await lerUsuario(al.usuario.id)).toMatchObject({ whatsapp: null, empresa_cargo: null });
  });

  it("trava de colisão: versão velha é recusada e nada muda", async () => {
    const cr = await novoCriador();
    const al = await membroCom(cr.id);
    req.h = await cabecalhosLogados(al.usuario.email, cr.slug);
    const velha = (await consultas.dadosDoPerfil(al.usuario.id, cr.id))!.versao;
    ok(await perfil.acaoSalvarPerfil({ nome: "Primeira Aba", whatsapp: "", empresaCargo: "", versao: velha }));
    const r = await perfil.acaoSalvarPerfil({ nome: "Segunda Aba", whatsapp: "", empresaCargo: "", versao: velha });
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("outra janela") });
    expect((await lerUsuario(al.usuario.id)).nome).toBe("Primeira Aba");
  });

  it("isolamento: id de outra pessoa no corpo é recusado; a sessão só altera a própria conta", async () => {
    const cr = await novoCriador();
    const a = await membroCom(cr.id);
    const b = await membroCom(cr.id);
    req.h = await cabecalhosLogados(a.usuario.email, cr.slug);
    const versaoB = (await consultas.dadosDoPerfil(b.usuario.id, cr.id))!.versao;
    const comId = await perfil.acaoSalvarPerfil({ nome: "Invasor", whatsapp: "", empresaCargo: "", versao: versaoB, usuarioId: b.usuario.id });
    expect(comId.ok).toBe(false);
    // A versão de B não serve para A (trava): a conta de B segue intacta.
    expect((await perfil.acaoSalvarPerfil({ nome: "Invasor", whatsapp: "", empresaCargo: "", versao: versaoB })).ok).toBe(false);
    expect((await lerUsuario(b.usuario.id)).nome).toBe("Pessoa de Teste");
    expect((await lerUsuario(a.usuario.id)).nome).toBe("Pessoa de Teste");
  });

  it("sem sessão: recusa; WhatsApp ou nome inválidos: recusa com mensagem", async () => {
    const cr = await novoCriador();
    const al = await membroCom(cr.id);
    const versao = (await consultas.dadosDoPerfil(al.usuario.id, cr.id))!.versao;
    req.h = cabecalhos(cr.slug);
    expect(await perfil.acaoSalvarPerfil({ nome: "Ana", whatsapp: "", empresaCargo: "", versao })).toEqual({ ok: false, erro: "Sessão expirada. Entre novamente." });
    req.h = await cabecalhosLogados(al.usuario.email, cr.slug);
    for (const whatsapp of ["(11) 1234", "(01) 99999-0000", "abc"]) {
      const r = await perfil.acaoSalvarPerfil({ nome: "Ana", whatsapp, empresaCargo: "", versao });
      expect(r).toEqual({ ok: false, erro: expect.stringContaining("WhatsApp inválido") });
    }
    expect((await perfil.acaoSalvarPerfil({ nome: "<script>", whatsapp: "", empresaCargo: "", versao })).ok).toBe(false);
    expect((await lerUsuario(al.usuario.id)).nome).toBe("Pessoa de Teste");
  });
});
