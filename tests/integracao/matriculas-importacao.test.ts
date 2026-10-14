/**
 * Importacao CSV de matriculas (RN-117) no PostgreSQL real, pela Server Action: linhas invalidas
 * (inclusive produto de OUTRO criador) nao gravam; as validas entram numa transacao so; e-mail
 * novo vira conta + vinculo ALUNO com link; conta existente reaproveitada; grupo criado.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador, novoUsuario, vincular } from "./_apoio";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));
// Falha simulada no MEIO da importação (prova a transação única): `matricular` lança neste produto.
const falha = vi.hoisted(() => ({ produtoId: "" }));
vi.mock("@/lib/matriculas/servico", async (original) => {
  const o = await original<typeof import("@/lib/matriculas/servico")>();
  return {
    ...o,
    matricular: async (...args: Parameters<typeof o.matricular>) => {
      if (args[1].produtoId === falha.produtoId) throw new Error("falha simulada");
      return o.matricular(...args);
    },
  };
});

let imp: typeof import("@/lib/actions/matriculas-importacao");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  imp = await import("@/lib/actions/matriculas-importacao");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

async function produto(criadorId: string, codigo: number) {
  const [p] = await db
    .insert(s.produtos)
    .values({ criador_id: criadorId, codigo, titulo: `Curso ${codigo}`, slug: `curso-csv-${randomUUID().slice(0, 8)}`, status: "PUBLICADO", modified_by: criadorId })
    .returning();
  return p;
}

describe("importação CSV de matrículas", () => {
  it("válidas numa transação (conta nova + matrícula, conta existente, membro existente); inválidas e produto de B ficam fora", async () => {
    const a = await novoCriador("Criador A");
    const b = await novoCriador("Criador B");
    const admin = await novoUsuario();
    await vincular(a.id, admin.id, "ADMIN");
    const [p1, p2, pB] = [await produto(a.id, 1), await produto(a.id, 2), await produto(b.id, 3)];
    const jaMembro = await novoUsuario();
    const vJa = await vincular(a.id, jaMembro.id, "ALUNO");
    const deB = await novoUsuario();
    await vincular(b.id, deB.id, "ALUNO");
    const n = Date.now();
    const nova = `nova-${n}@teste.local`;
    const csv = [
      "nome,email,produto,expira_em,grupo",
      `Nova Pessoa,${nova},1,31/12/2099,Turma CSV`,
      `Nova Pessoa,${nova},${p2.slug},,`,
      `Já Membro,${jaMembro.email},1,,Turma CSV`,
      `Conta de B,${deB.email},${p2.slug},,`,
      `Invasor,invasor-${n}@teste.local,${pB.slug},,`,
      `Codigo de B,codigob-${n}@teste.local,3,,`,
      `Sem Produto,sem-${n}@teste.local,,,`,
    ].join("\n");
    req.h = await cabecalhosLogados(admin.email, a.slug);
    const r = await imp.acaoImportarMatriculas({ csv });
    if (!r.ok) throw new Error(r.erro);
    expect(r.dados).toMatchObject({ criadas: 4, reativadas: 0, jaExistiam: 0, contasNovas: 1, reaproveitados: 1, jaMembros: 1, gruposCriados: ["Turma CSV"], emailsEnviados: 0 });
    expect(r.dados.invalidas.map((e) => [e.numero, e.mensagem])).toEqual([
      [6, `Produto "${pB.slug}" não encontrado.`],
      [7, 'Produto "3" não encontrado.'],
      [8, "Informe o produto (código ou endereço)."],
    ]);
    expect(r.dados.links).toMatchObject([{ email: nova }]);
    expect(r.dados.links[0].url).toMatch(new RegExp(`^http://${a.slug}\\.localhost:3011/primeiro-acesso#token=`));
    expect(JSON.stringify(r)).not.toContain(b.slug);

    // Nada de B foi tocado; os invasores nao viraram conta.
    expect(await db.select().from(s.produtos_matriculas).where(eq(s.produtos_matriculas.produto_id, pB.id))).toEqual([]);
    expect(await db.select().from(s.usuarios).where(inArray(s.usuarios.email, [`invasor-${n}@teste.local`, `codigob-${n}@teste.local`, `sem-${n}@teste.local`]))).toEqual([]);
    const todas = await db.select().from(s.produtos_matriculas).where(eq(s.produtos_matriculas.criador_id, a.id));
    expect(todas).toHaveLength(4);
    expect(todas.every((m) => m.origem === "IMPORTACAO" && m.status === "ATIVA" && m.modified_by === admin.id)).toBe(true);
    expect(todas.filter((m) => m.produto_id === p1.id)).toHaveLength(2);
    expect(todas.find((m) => m.membro_id === vJa.id)?.expira_em).toBeNull();
    // Conta nova: UMA conta e UM vinculo ALUNO, mesmo vindo em duas linhas.
    const [contaNova] = await db.select().from(s.usuarios).where(eq(s.usuarios.email, nova));
    const vinculos = await db.select().from(s.criadores_membros).where(eq(s.criadores_membros.usuario_id, contaNova.id));
    expect(vinculos).toMatchObject([{ criador_id: a.id, papel: "ALUNO" }]);
    const [turma] = await db.select().from(s.criadores_grupos).where(and(eq(s.criadores_grupos.criador_id, a.id), eq(s.criadores_grupos.nome, "Turma CSV")));
    expect(await db.select().from(s.criadores_grupos_membros).where(eq(s.criadores_grupos_membros.grupo_id, turma.id))).toHaveLength(2);

    // Reimportar: nada duplica (todas ja existiam).
    const de2 = await imp.acaoImportarMatriculas({ csv });
    expect(de2).toMatchObject({ ok: true, dados: { criadas: 0, jaExistiam: 4, contasNovas: 0, links: [] } });
    expect(await db.select().from(s.produtos_matriculas).where(eq(s.produtos_matriculas.criador_id, a.id))).toHaveLength(4);
  });

  it("falha no meio desfaz tudo; só inválidas, cabeçalho errado e ALUNO são recusados", async () => {
    const a = await novoCriador("Criador A");
    const dono = await novoUsuario();
    await vincular(a.id, dono.id, "DONO");
    const p = await produto(a.id, 1);
    req.h = await cabecalhosLogados(dono.email, a.slug);
    const n = Date.now();
    const p2 = await produto(a.id, 2);
    falha.produtoId = p2.id;
    const csv = `nome,email,produto\nAna,ana-${n}@teste.local,1\nBia,bia-${n}@teste.local,2`;
    expect(await imp.acaoImportarMatriculas({ csv })).toMatchObject({ ok: false });
    expect(await db.select().from(s.usuarios).where(inArray(s.usuarios.email, [`ana-${n}@teste.local`, `bia-${n}@teste.local`]))).toEqual([]);
    expect(await db.select().from(s.produtos_matriculas).where(eq(s.produtos_matriculas.criador_id, a.id))).toEqual([]);
    falha.produtoId = "";

    // Produto removido entre a prévia e a gravação: a linha vira inválida.
    await db.update(s.produtos).set({ is_deleted: true }).where(eq(s.produtos.id, p.id));
    expect(await imp.acaoImportarMatriculas({ csv: `nome,email,produto\nAna,ana-${n}@teste.local,1` })).toMatchObject({ ok: false, erro: expect.stringMatching(/Nenhuma linha válida/) });
    expect(await db.select().from(s.usuarios).where(eq(s.usuarios.email, `ana-${n}@teste.local`))).toEqual([]);
    expect(await imp.acaoImportarMatriculas({ csv: "nome,email\nA,a@x.com" })).toMatchObject({ ok: false, erro: expect.stringMatching(/Cabeçalho/) });

    const aluno = await novoUsuario();
    await vincular(a.id, aluno.id, "ALUNO");
    req.h = await cabecalhosLogados(aluno.email, a.slug);
    expect(await imp.acaoImportarMatriculas({ csv: `nome,email,produto\nAna,ana2-${n}@teste.local,1` })).toMatchObject({ ok: false, erro: expect.stringMatching(/permissão/) });
  });
});
