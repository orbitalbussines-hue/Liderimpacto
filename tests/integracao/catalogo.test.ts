/**
 * Catalogo (produtos > modulos > aulas > materiais) no PostgreSQL real, pelas Server Actions com
 * `headers()` simulado. Prova: CRUD com trava, codigo sequencial, slug unico, reordenacao sem
 * buraco nem duplicata, publicacao com pre-requisitos, aula (capitulos, pre-requisito, materiais),
 * papeis DONO/ADMIN/ALUNO e trilha. Isolamento A x B em catalogo-isolamento.test.ts.
 */
import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador, novoUsuario, vincular } from "./_apoio";
import { arquivoPronto, ok, versaoDe } from "./_catalogo";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let prod: typeof import("@/lib/actions/produtos");
let est: typeof import("@/lib/actions/produtos-estrutura");
let aulas: typeof import("@/lib/actions/aulas");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  prod = await import("@/lib/actions/produtos");
  est = await import("@/lib/actions/produtos-estrutura");
  aulas = await import("@/lib/actions/aulas");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

async function area() {
  const c = await novoCriador("Criador Catálogo");
  const dono = await novoUsuario();
  const admin = await novoUsuario();
  const aluno = await novoUsuario();
  const vDono = await vincular(c.id, dono.id, "DONO");
  await vincular(c.id, admin.id, "ADMIN");
  await vincular(c.id, aluno.id, "ALUNO");
  return { c, dono, admin, aluno, vDono };
}

const ordemDosModulos = async (produtoId: string) =>
  (await db.select().from(s.produtos_modulos).where(and(eq(s.produtos_modulos.produto_id, produtoId), eq(s.produtos_modulos.is_deleted, false))).orderBy(asc(s.produtos_modulos.ordem))).map(
    (m) => [m.titulo, m.ordem] as const,
  );
const ordemDasAulas = async (moduloId: string) =>
  (await db.select().from(s.produtos_modulos_aulas).where(and(eq(s.produtos_modulos_aulas.modulo_id, moduloId), eq(s.produtos_modulos_aulas.is_deleted, false))).orderBy(asc(s.produtos_modulos_aulas.ordem))).map(
    (a) => [a.titulo, a.ordem] as const,
  );
const lerProduto = async (id: string) => (await db.select().from(s.produtos).where(eq(s.produtos.id, id)))[0];

describe("produtos", () => {
  it("cria com codigo sequencial e slug sugerido; edita com trava; recusa slug repetido; trilha antes -> depois", async () => {
    const x = await area();
    req.h = await cabecalhosLogados(x.admin.email, x.c.slug);
    const p1 = ok(await prod.acaoCriarProduto({ titulo: "Líder de Impacto 2.0", tipo: "CURSO" }));
    const p2 = ok(await prod.acaoCriarProduto({ titulo: "Mentoria Signature", tipo: "MENTORIA", slug: "signature" }));
    const [l1, l2] = [await lerProduto(p1.id), await lerProduto(p2.id)];
    expect(l1).toMatchObject({ codigo: 1, slug: "lider-de-impacto-2-0", status: "RASCUNHO", criador_id: x.c.id, modified_by: x.admin.id });
    expect(l2.codigo).toBe(2);
    expect(await prod.acaoCriarProduto({ titulo: "Outro", tipo: "CURSO", slug: "signature" })).toMatchObject({ ok: false, erro: expect.stringMatching(/endereço já é usado/) });
    expect(await prod.acaoCriarProduto({ titulo: "X", tipo: "CURSO" })).toMatchObject({ ok: false });
    expect(await prod.acaoCriarProduto({ titulo: "Válido", tipo: "CURSO", slug: "Não Vale!" })).toMatchObject({ ok: false });

    const base = { produtoId: p1.id, titulo: "Líder de Impacto", slug: "lider", descricao: "Formação", tipo: "CURSO", professorMembroId: x.vDono.id, corMarca: "#2F6FDE" };
    const v1 = l1.updated_at.toISOString();
    const salvo = ok(await prod.acaoSalvarProduto({ ...base, versao: v1 }));
    expect(await lerProduto(p1.id)).toMatchObject({ titulo: "Líder de Impacto", slug: "lider", cor_marca: "#2f6fde", professor_membro_id: x.vDono.id });
    // Versao velha: colisao. Slug de outro produto: recusado.
    expect(await prod.acaoSalvarProduto({ ...base, titulo: "Outra", versao: v1 })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro/) });
    expect(await prod.acaoSalvarProduto({ ...base, slug: "signature", versao: salvo.versao })).toMatchObject({ ok: false, erro: expect.stringMatching(/endereço/) });
    // Professor tem de ser da equipe (ALUNO nao vale).
    const [vAluno] = await db.select().from(s.criadores_membros).where(eq(s.criadores_membros.usuario_id, x.aluno.id));
    expect(await prod.acaoSalvarProduto({ ...base, professorMembroId: vAluno.id, versao: salvo.versao })).toMatchObject({ ok: false, erro: expect.stringMatching(/Professor/) });

    const trilha = await db.select().from(s.auditoria).where(and(eq(s.auditoria.registro_id, p1.id), eq(s.auditoria.acao, "atualizar")));
    expect(trilha[0]).toMatchObject({ user_id: x.admin.id, criador_id: x.c.id });
    expect(trilha[0].dados_anteriores).toMatchObject({ titulo: "Líder de Impacto 2.0", slug: "lider-de-impacto-2-0" });
    expect(trilha[0].dados_novos).toMatchObject({ titulo: "Líder de Impacto", slug: "lider" });
  });

  it("ALUNO nao usa nenhuma action do catalogo; ADMIN e DONO usam", async () => {
    const x = await area();
    req.h = await cabecalhosLogados(x.dono.email, x.c.slug);
    const p = ok(await prod.acaoCriarProduto({ titulo: "Do Dono", tipo: "EVENTO" }));
    const m = ok(await est.acaoCriarModulo({ produtoId: p.id, titulo: "Módulo 1" }));
    const a = ok(await est.acaoCriarAula({ moduloId: m.id, titulo: "Aula 1" }));
    const vp = await versaoDe(s.produtos, p.id);
    const vm = await versaoDe(s.produtos_modulos, m.id);
    const va = await versaoDe(s.produtos_modulos_aulas, a.id);

    req.h = await cabecalhosLogados(x.aluno.email, x.c.slug);
    const tentativas = [
      prod.acaoCriarProduto({ titulo: "Do Aluno", tipo: "CURSO" }),
      prod.acaoSalvarProduto({ produtoId: p.id, versao: vp, titulo: "Hack", slug: "hack", descricao: "", tipo: "CURSO", professorMembroId: null, corMarca: null }),
      prod.acaoAlterarSituacaoProduto({ produtoId: p.id, versao: vp, status: "PUBLICADO" }),
      prod.acaoDefinirCapaProduto({ produtoId: p.id, versao: vp, formato: "16x9", arquivoId: null }),
      prod.acaoRemoverProduto({ produtoId: p.id, versao: vp }),
      est.acaoCriarModulo({ produtoId: p.id, titulo: "Invasor" }),
      est.acaoEditarModulo({ moduloId: m.id, versao: vm, titulo: "Hack", status: "RASCUNHO" }),
      est.acaoRemoverModulo({ moduloId: m.id, versao: vm }),
      est.acaoReordenarModulos({ produtoId: p.id, itens: [{ id: m.id, versao: vm }] }),
      est.acaoCriarAula({ moduloId: m.id, titulo: "Invasora" }),
      est.acaoRemoverAula({ aulaId: a.id, versao: va }),
      est.acaoReordenarAulas({ moduloId: m.id, itens: [{ id: a.id, versao: va }] }),
      aulas.acaoSalvarAula({ aulaId: a.id, versao: va, titulo: "Hack", descricao: "", liberaEm: null, preRequisitoAulaId: null, capitulos: [] }),
      aulas.acaoAdicionarMaterial({ aulaId: a.id, nome: "Link", url: "https://exemplo.com" }),
    ];
    for (const r of await Promise.all(tentativas)) expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/permissão/) });
    expect(await lerProduto(p.id)).toMatchObject({ titulo: "Do Dono", is_deleted: false });
  });
});

describe("estrutura", () => {
  it("ordem 1..n; reordena com trava; remover fecha o buraco; modulo com aula nao sai", async () => {
    const x = await area();
    req.h = await cabecalhosLogados(x.admin.email, x.c.slug);
    const p = ok(await prod.acaoCriarProduto({ titulo: "Curso Ordem", tipo: "CURSO" }));
    const ids: string[] = [];
    for (const t of ["A", "B", "C", "D"]) ids.push(ok(await est.acaoCriarModulo({ produtoId: p.id, titulo: `Módulo ${t}` })).id);
    expect(await ordemDosModulos(p.id)).toEqual([["Módulo A", 1], ["Módulo B", 2], ["Módulo C", 3], ["Módulo D", 4]]);

    // D, A, C, B — troca total, sem violar o unico (pai, ordem).
    const itens = async (lista: string[]) => Promise.all(lista.map(async (id) => ({ id, versao: await versaoDe(s.produtos_modulos, id) })));
    const velhos = await itens([ids[3], ids[0], ids[2], ids[1]]);
    const r = ok(await est.acaoReordenarModulos({ produtoId: p.id, itens: velhos }));
    expect(await ordemDosModulos(p.id)).toEqual([["Módulo D", 1], ["Módulo A", 2], ["Módulo C", 3], ["Módulo B", 4]]);
    // A versao devolvida vale para todos: da para reordenar de novo sem recarregar.
    expect(await est.acaoReordenarModulos({ produtoId: p.id, itens: ids.map((id) => ({ id, versao: r.versao })) })).toMatchObject({ ok: true });
    // Versoes velhas, lista incompleta ou repetida: recusado, nada muda.
    expect(await est.acaoReordenarModulos({ produtoId: p.id, itens: velhos })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro/) });
    const atuais = await itens(ids);
    expect(await est.acaoReordenarModulos({ produtoId: p.id, itens: atuais.slice(0, 3) })).toMatchObject({ ok: false });
    expect(await est.acaoReordenarModulos({ produtoId: p.id, itens: [...atuais.slice(0, 3), atuais[0]] })).toMatchObject({ ok: false, erro: expect.stringMatching(/repetido/) });
    expect(await ordemDosModulos(p.id)).toEqual([["Módulo A", 1], ["Módulo B", 2], ["Módulo C", 3], ["Módulo D", 4]]);

    // Aulas no modulo B.
    const aulasB: string[] = [];
    for (const t of ["1", "2", "3"]) aulasB.push(ok(await est.acaoCriarAula({ moduloId: ids[1], titulo: `Aula ${t}` })).id);
    const versoesAulas = await Promise.all(aulasB.map(async (id) => ({ id, versao: await versaoDe(s.produtos_modulos_aulas, id) })));
    ok(await est.acaoReordenarAulas({ moduloId: ids[1], itens: [versoesAulas[2], versoesAulas[0], versoesAulas[1]] }));
    expect(await ordemDasAulas(ids[1])).toEqual([["Aula 3", 1], ["Aula 1", 2], ["Aula 2", 3]]);
    // Aula de outro modulo na lista: recusado.
    expect(await est.acaoReordenarAulas({ moduloId: ids[0], itens: [{ id: aulasB[0], versao: await versaoDe(s.produtos_modulos_aulas, aulasB[0]) }] })).toMatchObject({ ok: false });

    // Remover modulo com aula: recusado. Remover aula do meio: 1..n de novo.
    expect(await est.acaoRemoverModulo({ moduloId: ids[1], versao: await versaoDe(s.produtos_modulos, ids[1]) })).toMatchObject({ ok: false, erro: expect.stringMatching(/tem 3 aulas/) });
    ok(await est.acaoRemoverAula({ aulaId: aulasB[0], versao: await versaoDe(s.produtos_modulos_aulas, aulasB[0]) }));
    expect(await ordemDasAulas(ids[1])).toEqual([["Aula 3", 1], ["Aula 2", 2]]);
    ok(await est.acaoRemoverModulo({ moduloId: ids[0], versao: await versaoDe(s.produtos_modulos, ids[0]) }));
    expect(await ordemDosModulos(p.id)).toEqual([["Módulo B", 1], ["Módulo C", 2], ["Módulo D", 3]]);
    // Criar depois de remover continua no fim, sem buraco.
    ok(await est.acaoCriarModulo({ produtoId: p.id, titulo: "Módulo E" }));
    expect((await ordemDosModulos(p.id)).map(([, o]) => o)).toEqual([1, 2, 3, 4]);

    // Renomear/ocultar com trava.
    const vC = await versaoDe(s.produtos_modulos, ids[2]);
    ok(await est.acaoEditarModulo({ moduloId: ids[2], versao: vC, titulo: "Módulo C2", status: "RASCUNHO" }));
    expect(await est.acaoEditarModulo({ moduloId: ids[2], versao: vC, titulo: "Módulo C3", status: "RASCUNHO" })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro/) });
    const trilha = await db.select().from(s.auditoria).where(and(eq(s.auditoria.registro_id, p.id), eq(s.auditoria.acao, "reordenar")));
    expect(trilha.length).toBeGreaterThanOrEqual(2);
  });
});

describe("publicacao", () => {
  it("exige titulo, modulo publicado com aula e capa 16:9; publicado nao perde a ultima aula nem a capa", async () => {
    const x = await area();
    req.h = await cabecalhosLogados(x.dono.email, x.c.slug);
    const p = ok(await prod.acaoCriarProduto({ titulo: "Para Publicar", tipo: "CURSO" }));
    const publicar = async (status = "PUBLICADO") => prod.acaoAlterarSituacaoProduto({ produtoId: p.id, versao: await versaoDe(s.produtos, p.id), status });

    const r1 = await publicar();
    expect(r1).toMatchObject({ ok: false, erro: expect.stringMatching(/ao menos 1 módulo publicado com 1 aula.*capa 16:9/) });
    const m = ok(await est.acaoCriarModulo({ produtoId: p.id, titulo: "Módulo" }));
    expect(await publicar("NAO_LISTADO")).toMatchObject({ ok: false, erro: expect.stringMatching(/1 módulo/) });
    const a = ok(await est.acaoCriarAula({ moduloId: m.id, titulo: "Aula" }));
    expect(await publicar()).toMatchObject({ ok: false, erro: expect.stringMatching(/^Para publicar, falta: capa 16:9\.$/) });

    // Modulo oculto nao conta.
    ok(await est.acaoEditarModulo({ moduloId: m.id, versao: await versaoDe(s.produtos_modulos, m.id), titulo: "Módulo", status: "RASCUNHO" }));
    const capa = await arquivoPronto(x.c.id);
    ok(await prod.acaoDefinirCapaProduto({ produtoId: p.id, versao: await versaoDe(s.produtos, p.id), formato: "16x9", arquivoId: capa.id }));
    expect(await publicar()).toMatchObject({ ok: false, erro: expect.stringMatching(/1 módulo/) });
    ok(await est.acaoEditarModulo({ moduloId: m.id, versao: await versaoDe(s.produtos_modulos, m.id), titulo: "Módulo", status: "PUBLICADO" }));
    expect(await publicar()).toMatchObject({ ok: true });
    expect((await lerProduto(p.id)).status).toBe("PUBLICADO");
    const [trilha] = await db.select().from(s.auditoria).where(and(eq(s.auditoria.registro_id, p.id), eq(s.auditoria.acao, "publicar")));
    expect(trilha.detalhes).toMatch(/Rascunho → Publicado/);

    // Publicado: nao remove a capa 16:9, nao remove a ultima aula, nao oculta o ultimo modulo, nao remove o produto.
    expect(await prod.acaoDefinirCapaProduto({ produtoId: p.id, versao: await versaoDe(s.produtos, p.id), formato: "16x9", arquivoId: null })).toMatchObject({ ok: false, erro: expect.stringMatching(/capa 16:9/) });
    expect(await est.acaoRemoverAula({ aulaId: a.id, versao: await versaoDe(s.produtos_modulos_aulas, a.id) })).toMatchObject({ ok: false, erro: expect.stringMatching(/publicado/) });
    expect(await est.acaoEditarModulo({ moduloId: m.id, versao: await versaoDe(s.produtos_modulos, m.id), titulo: "Módulo", status: "RASCUNHO" })).toMatchObject({ ok: false });
    expect(await prod.acaoRemoverProduto({ produtoId: p.id, versao: await versaoDe(s.produtos, p.id) })).toMatchObject({ ok: false, erro: expect.stringMatching(/rascunho/) });
    expect((await db.select().from(s.produtos_modulos_aulas).where(eq(s.produtos_modulos_aulas.id, a.id)))[0].is_deleted).toBe(false);

    // Trocar a capa: a anterior e descartada (soft delete do registro).
    const nova = await arquivoPronto(x.c.id);
    ok(await prod.acaoDefinirCapaProduto({ produtoId: p.id, versao: await versaoDe(s.produtos, p.id), formato: "16x9", arquivoId: nova.id }));
    expect((await db.select().from(s.arquivos).where(eq(s.arquivos.id, capa.id)))[0]).toMatchObject({ is_deleted: true, modified_by: x.dono.id });
    // O mesmo arquivo nao vira duas capas (trocar uma apagaria a outra).
    expect(await prod.acaoDefinirCapaProduto({ produtoId: p.id, versao: await versaoDe(s.produtos, p.id), formato: "3x4", arquivoId: nova.id })).toMatchObject({ ok: false, erro: expect.stringMatching(/Arquivo inválido/) });

    // Volta para rascunho e remove com a estrutura toda (exclusao logica em cascata).
    ok(await publicar("RASCUNHO"));
    ok(await prod.acaoRemoverProduto({ produtoId: p.id, versao: await versaoDe(s.produtos, p.id) }));
    expect(await lerProduto(p.id)).toMatchObject({ is_deleted: true });
    expect((await db.select().from(s.produtos_modulos_aulas).where(eq(s.produtos_modulos_aulas.id, a.id)))[0].is_deleted).toBe(true);
    expect((await db.select().from(s.arquivos).where(eq(s.arquivos.id, nova.id)))[0].is_deleted).toBe(true);
  });
});

describe("aula", () => {
  it("capitulos ordenados e dentro da duracao; pre-requisito do mesmo produto sem ciclo; materiais", async () => {
    const x = await area();
    req.h = await cabecalhosLogados(x.admin.email, x.c.slug);
    const p = ok(await prod.acaoCriarProduto({ titulo: "Curso Aulas", tipo: "CURSO" }));
    const outro = ok(await prod.acaoCriarProduto({ titulo: "Outro Curso", tipo: "CURSO" }));
    const m = ok(await est.acaoCriarModulo({ produtoId: p.id, titulo: "Módulo" }));
    const mo = ok(await est.acaoCriarModulo({ produtoId: outro.id, titulo: "Módulo" }));
    const a1 = ok(await est.acaoCriarAula({ moduloId: m.id, titulo: "Aula 1" }));
    const a2 = ok(await est.acaoCriarAula({ moduloId: m.id, titulo: "Aula 2" }));
    const fora = ok(await est.acaoCriarAula({ moduloId: mo.id, titulo: "De outro produto" }));
    const salvar = async (aulaId: string, extra: Record<string, unknown>) =>
      aulas.acaoSalvarAula({ aulaId, versao: await versaoDe(s.produtos_modulos_aulas, aulaId), titulo: "Aula", descricao: "", liberaEm: null, preRequisitoAulaId: null, capitulos: [], ...extra });

    // Capitulos chegam fora de ordem e sao gravados em ordem; tempo repetido e recusado.
    ok(await salvar(a2.id, { capitulos: [{ inicioSeg: 120, titulo: "Fim" }, { inicioSeg: 0, titulo: "Início" }], liberaEm: "2026-11-01T12:00:00.000Z", preRequisitoAulaId: a1.id }));
    const [l2] = await db.select().from(s.produtos_modulos_aulas).where(eq(s.produtos_modulos_aulas.id, a2.id));
    expect(l2.capitulos).toEqual([{ inicioSeg: 0, titulo: "Início" }, { inicioSeg: 120, titulo: "Fim" }]);
    expect(l2).toMatchObject({ pre_requisito_aula_id: a1.id, libera_em: new Date("2026-11-01T12:00:00.000Z") });
    expect(await salvar(a2.id, { capitulos: [{ inicioSeg: 5, titulo: "A" }, { inicioSeg: 5, titulo: "B" }] })).toMatchObject({ ok: false, erro: expect.stringMatching(/mesmo tempo/) });
    // Com duracao conhecida (pipeline de video), capitulo depois do fim e recusado.
    await db.update(s.produtos_modulos_aulas).set({ duracao_seg: 100 }).where(eq(s.produtos_modulos_aulas.id, a1.id));
    expect(await salvar(a1.id, { capitulos: [{ inicioSeg: 100, titulo: "Depois" }] })).toMatchObject({ ok: false, erro: expect.stringMatching(/passa da duração/) });

    // Pre-requisito: nao a propria, nao de outro produto, sem ciclo.
    expect(await salvar(a1.id, { preRequisitoAulaId: a1.id })).toMatchObject({ ok: false, erro: expect.stringMatching(/si mesma/) });
    expect(await salvar(a1.id, { preRequisitoAulaId: fora.id })).toMatchObject({ ok: false, erro: expect.stringMatching(/deste produto/) });
    expect(await salvar(a1.id, { preRequisitoAulaId: a2.id })).toMatchObject({ ok: false, erro: expect.stringMatching(/ciclo/) });
    // a1 e pre-requisito de a2: nao pode ser removida.
    expect(await est.acaoRemoverAula({ aulaId: a1.id, versao: await versaoDe(s.produtos_modulos_aulas, a1.id) })).toMatchObject({ ok: false, erro: expect.stringMatching(/pré-requisito de "Aula"/) });

    // Materiais: link https, arquivo PDF; http e javascript: recusados; renomear com trava; remover descarta o arquivo.
    ok(await aulas.acaoAdicionarMaterial({ aulaId: a1.id, nome: "Site", url: "https://liderdeimpacto.com.br/guia" }));
    for (const url of ["http://exemplo.com", "javascript:alert(1)", "https://"]) {
      expect(await aulas.acaoAdicionarMaterial({ aulaId: a1.id, nome: "Ruim", url })).toMatchObject({ ok: false });
    }
    const pdf = await arquivoPronto(x.c.id, "MATERIAL");
    const mat = ok(await aulas.acaoAdicionarMaterial({ aulaId: a1.id, nome: "Apostila", arquivoId: pdf.id }));
    expect(await aulas.acaoAdicionarMaterial({ aulaId: a2.id, nome: "De novo", arquivoId: pdf.id })).toMatchObject({ ok: false });
    // Imagem nao vira material (finalidade errada).
    expect(await aulas.acaoAdicionarMaterial({ aulaId: a1.id, nome: "Img", arquivoId: (await arquivoPronto(x.c.id, "IMAGEM")).id })).toMatchObject({ ok: false });
    const [lm] = await db.select().from(s.produtos_modulos_aulas_materiais).where(eq(s.produtos_modulos_aulas_materiais.id, mat.id));
    expect(lm).toMatchObject({ tipo: "PDF", arquivo_id: pdf.id, url: null });
    const vm = lm.updated_at.toISOString();
    ok(await aulas.acaoRenomearMaterial({ materialId: mat.id, versao: vm, nome: "Apostila v2" }));
    expect(await aulas.acaoRenomearMaterial({ materialId: mat.id, versao: vm, nome: "Apostila v3" })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro/) });
    ok(await aulas.acaoRemoverMaterial({ materialId: mat.id, versao: await versaoDe(s.produtos_modulos_aulas_materiais, mat.id) }));
    expect((await db.select().from(s.arquivos).where(eq(s.arquivos.id, pdf.id)))[0].is_deleted).toBe(true);

    // Thumb: imagem do criador; material (PDF) nao vale.
    expect(await aulas.acaoDefinirThumbAula({ aulaId: a1.id, versao: await versaoDe(s.produtos_modulos_aulas, a1.id), arquivoId: (await arquivoPronto(x.c.id, "MATERIAL")).id })).toMatchObject({ ok: false });
    ok(await aulas.acaoDefinirThumbAula({ aulaId: a1.id, versao: await versaoDe(s.produtos_modulos_aulas, a1.id), arquivoId: (await arquivoPronto(x.c.id)).id }));
  });
});
