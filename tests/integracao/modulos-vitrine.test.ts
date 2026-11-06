/**
 * Capa 3:4 do módulo e fileira "Módulos do curso" (RN-270 a RN-273) no PostgreSQL real: action com
 * trava pela versão do módulo, arquivo em uso/de outro criador recusado, anterior descartada,
 * trilha legível; remover módulo descarta a capa; `cursoDoAluno` devolve a chave por módulo; a
 * fileira MODULOS mostra só os módulos PUBLICADOS ao aluno (equipe vê todos), na ordem, com selo,
 * progresso e link para o módulo; curso em rascunho = fileira vazia; curso de outro criador recusado.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador } from "./_apoio";
import { arquivoPronto, ok, versaoDe } from "./_catalogo";
import { concluirAulas } from "./_passo7";
import { alunoMatriculado, cursoPronto, membroCom, novaAula, novoModulo, quem } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));
vi.mock("next/cache", () => ({ cacheTag: () => {}, cacheLife: () => {}, updateTag: () => {}, revalidateTag: () => {}, revalidatePath: () => {} }));

let est: typeof import("@/lib/actions/produtos-estrutura");
let vit: typeof import("@/lib/actions/vitrine");
let res: typeof import("@/lib/vitrine/resolver");
let cfg: typeof import("@/lib/vitrine/config");
let cons: typeof import("@/lib/progresso/consultas");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  est = await import("@/lib/actions/produtos-estrutura");
  vit = await import("@/lib/actions/vitrine");
  res = await import("@/lib/vitrine/resolver");
  cfg = await import("@/lib/vitrine/config");
  cons = await import("@/lib/progresso/consultas");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

/** Curso publicado com 3 módulos (o 3º em rascunho), aluno matriculado e admin logado no host. */
async function cenario() {
  const cr = await novoCriador();
  const curso = await cursoPronto(cr.id, { aulas: 2 });
  const m2 = await novoModulo(cr.id, curso.produto.id, 2);
  const aulasM2 = [await novaAula(cr.id, m2.id, 1)];
  const m3 = await novoModulo(cr.id, curso.produto.id, 3, "RASCUNHO");
  await novaAula(cr.id, m3.id, 1);
  const aluno = await alunoMatriculado(cr.id, curso.produto.id);
  const admin = await membroCom(cr.id, "ADMIN");
  req.h = await cabecalhosLogados(admin.usuario.email, cr.slug);
  const qAluno = { ...quem(cr.id, aluno), usuario: { id: aluno.usuario.id, nome: "Ana" } };
  const qAdmin = { ...quem(cr.id, admin), usuario: { id: admin.usuario.id, nome: "Admin" } };
  return { cr, curso, m1: curso.modulo, m2, m3, aulasM2, aluno, admin, qAluno, qAdmin };
}

const arquivoVivo = async (id: string) => (await db.select({ morto: s.arquivos.is_deleted }).from(s.arquivos).where(eq(s.arquivos.id, id)))[0]?.morto === false;
const capaDe = async (moduloId: string) => (await db.select({ c: s.produtos_modulos.capa_arquivo_id }).from(s.produtos_modulos).where(eq(s.produtos_modulos.id, moduloId)))[0].c;

describe("capa 3:4 do módulo (action)", () => {
  it("define, recusa versão velha, troca (descarta a anterior), recusa arquivo em uso ou de outro criador e remove", async () => {
    const x = await cenario();
    const capa1 = await arquivoPronto(x.cr.id);
    const versao0 = await versaoDe(s.produtos_modulos, x.m1.id);
    const v1 = ok(await est.acaoDefinirCapaModulo({ moduloId: x.m1.id, versao: versao0, arquivoId: capa1.id })).versao;
    expect(await capaDe(x.m1.id)).toBe(capa1.id);
    const [trilha] = await db
      .select({ detalhes: s.auditoria.detalhes })
      .from(s.auditoria)
      .where(and(eq(s.auditoria.registro_id, x.m1.id), eq(s.auditoria.tabela, "produtos_modulos")));
    expect(trilha.detalhes).toBe(`Definiu a capa 3:4 do módulo "${x.m1.titulo}" de "${x.curso.produto.titulo}"`);

    // Trava: a versão que a tela abriu já mudou.
    const capa2 = await arquivoPronto(x.cr.id);
    expect(await est.acaoDefinirCapaModulo({ moduloId: x.m1.id, versao: versao0, arquivoId: capa2.id })).toMatchObject({ ok: false, erro: /alterado por outro usuario|Recarregue/i });

    ok(await est.acaoDefinirCapaModulo({ moduloId: x.m1.id, versao: v1, arquivoId: capa2.id }));
    expect(await capaDe(x.m1.id)).toBe(capa2.id);
    expect(await arquivoVivo(capa1.id)).toBe(false);

    // capa2 já é usada pelo módulo 1: outro módulo não a reaproveita; arquivo de outro criador também cai.
    expect(await est.acaoDefinirCapaModulo({ moduloId: x.m2.id, versao: await versaoDe(s.produtos_modulos, x.m2.id), arquivoId: capa2.id })).toMatchObject({ ok: false });
    const outro = await novoCriador("Outro");
    const deOutro = await arquivoPronto(outro.id);
    expect(await est.acaoDefinirCapaModulo({ moduloId: x.m2.id, versao: await versaoDe(s.produtos_modulos, x.m2.id), arquivoId: deOutro.id })).toMatchObject({ ok: false });
    expect(await capaDe(x.m2.id)).toBeNull();

    ok(await est.acaoDefinirCapaModulo({ moduloId: x.m1.id, versao: await versaoDe(s.produtos_modulos, x.m1.id), arquivoId: null }));
    expect(await capaDe(x.m1.id)).toBeNull();
    expect(await arquivoVivo(capa2.id)).toBe(false);
  });

  it("o banco recusa capa de outro criador (FK composta) e remover módulo vazio descarta a capa", async () => {
    const x = await cenario();
    const outro = await novoCriador("Outro");
    const deOutro = await arquivoPronto(outro.id);
    await expect(db.update(s.produtos_modulos).set({ capa_arquivo_id: deOutro.id }).where(eq(s.produtos_modulos.id, x.m1.id))).rejects.toThrow();

    const vazio = await novoModulo(x.cr.id, x.curso.produto.id, 4);
    const capa = await arquivoPronto(x.cr.id);
    ok(await est.acaoDefinirCapaModulo({ moduloId: vazio.id, versao: await versaoDe(s.produtos_modulos, vazio.id), arquivoId: capa.id }));
    ok(await est.acaoRemoverModulo({ moduloId: vazio.id, versao: await versaoDe(s.produtos_modulos, vazio.id) }));
    expect(await arquivoVivo(capa.id)).toBe(false);
  });
});

describe("fileira Módulos do curso (resolver)", () => {
  it("aluno: só publicados, na ordem, selo, capa do módulo e progresso; equipe vê todos; rascunho some", async () => {
    const x = await cenario();
    const capa = await arquivoPronto(x.cr.id);
    ok(await est.acaoDefinirCapaModulo({ moduloId: x.m2.id, versao: await versaoDe(s.produtos_modulos, x.m2.id), arquivoId: capa.id }));
    await concluirAulas(x.cr.id, x.aluno, x.aulasM2);

    const curso = await cons.cursoDoAluno(x.qAluno, x.curso.produto.slug);
    expect(curso!.modulos.map((m) => m.capaChave)).toEqual([null, capa.chave]);

    // Aviso do construtor conta o que o aluno vê: publicado e com aula (rascunho e vazio ficam fora).
    await novoModulo(x.cr.id, x.curso.produto.id, 4);
    const { opcoesDoConstrutor } = await import("@/lib/vitrine/dados");
    expect((await opcoesDoConstrutor(x.cr.id)).cursos.find((c) => c.id === x.curso.produto.id)).toMatchObject({ modulos: 2, modulosComCapa: 1 });

    const f = cfg.fileiraDeModulos("mods", x.curso.produto.id);
    const r = await res.resolverFileira(x.qAluno, f);
    expect(r.variante).toBe("modulo");
    expect(r.itens.map((i) => [i.id, i.selo, i.progresso])).toEqual([
      [x.m1.id, "MÓDULO 1", 0],
      [x.m2.id, "MÓDULO 2", 100],
    ]);
    expect(r.itens[0]).toMatchObject({ titulo: x.m1.titulo, href: `/cursos/${x.curso.produto.slug}#modulo-${x.m1.id}`, imagemUrl: undefined });
    expect((await res.resolverFileira(x.qAluno, { ...f, quantidade: 3 })).itens).toHaveLength(2);
    expect((await res.resolverFileira(x.qAdmin, f)).itens.map((i) => i.id)).toEqual([x.m1.id, x.m2.id, x.m3.id]);

    await db.update(s.produtos).set({ status: "RASCUNHO" }).where(eq(s.produtos.id, x.curso.produto.id));
    expect((await res.resolverFileira(x.qAluno, f)).itens).toEqual([]);
    expect((await res.resolverFileira(x.qAdmin, f)).itens).toHaveLength(3);
    expect((await res.resolverFileira(x.qAluno, cfg.fileiraDeModulos("mods", "00000000-0000-4000-8000-000000000000"))).itens).toEqual([]);
  });

  it("salvar rascunho: MODULOS com curso desta área passa; de outro criador é recusado", async () => {
    const x = await cenario();
    const base = cfg.configPadrao({ id: x.curso.produto.id, titulo: x.curso.produto.titulo, descricao: null });
    const modelo = cfg.aplicarModeloModulos(base, { id: x.curso.produto.id, titulo: x.curso.produto.titulo, descricao: null }, "mods");
    const v = ok(await vit.acaoSalvarRascunhoVitrine({ versao: null, config: modelo })).versao;
    const outro = await novoCriador("Outro");
    const deOutro = await cursoPronto(outro.id);
    const ruim = { ...modelo, fileiras: [cfg.fileiraDeModulos("mods", deOutro.produto.id), ...modelo.fileiras.slice(1)] };
    expect(await vit.acaoSalvarRascunhoVitrine({ versao: v, config: ruim })).toMatchObject({ ok: false, erro: /não é desta área/ });
  });
});
