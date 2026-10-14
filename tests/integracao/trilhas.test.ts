/**
 * Trilhas (passo 7, RN-126) no PostgreSQL real: CRUD da equipe pelas actions (itens, ordem com
 * trava, publicar exige etapa), estados e motivos por item para o aluno (concluído, andamento,
 * "Conclua a etapa anterior", "Matricule-se", aulas pendentes), visibilidade (matrícula em ao
 * menos 1 curso), fileira da vitrine, isolamento A×B e ALUNO recusado.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador } from "./_apoio";
import { arquivoPronto, ok } from "./_catalogo";
import { avaliacaoPronta, concluirAulas, respostasCertas } from "./_passo7";
import { alunoMatriculado, cursoPronto, matricular, membroCom, quem } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let acoes: typeof import("@/lib/actions/trilhas");
let con: typeof import("@/lib/trilhas/consultas");
let t: typeof import("@/lib/avaliacoes/tentativas");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  acoes = await import("@/lib/actions/trilhas");
  con = await import("@/lib/trilhas/consultas");
  t = await import("@/lib/avaliacoes/tentativas");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

/** Trilha publicada: [curso 1] → [avaliação do curso 1, exige aulas] → [curso 2 (sem matrícula), não exige anterior]. */
async function cenario() {
  const cr = await novoCriador();
  const c1 = await cursoPronto(cr.id, { aulas: 2 });
  const c2 = await cursoPronto(cr.id, { aulas: 1 });
  const av = await avaliacaoPronta(cr.id, c1.produto.id, { exigeAulas: true });
  const aluno = await alunoMatriculado(cr.id, c1.produto.id);
  const admin = await membroCom(cr.id, "ADMIN");
  req.h = await cabecalhosLogados(admin.usuario.email, cr.slug);
  const tr = ok(await acoes.acaoCriarTrilha({ titulo: "Trilha do Líder", descricao: "Do zero ao avançado", tag: "Liderança" }));
  const i1 = ok(await acoes.acaoAdicionarItemTrilha({ trilhaId: tr.id, tipo: "PRODUTO", produtoId: c1.produto.id }));
  const i2 = ok(await acoes.acaoAdicionarItemTrilha({ trilhaId: tr.id, tipo: "AVALIACAO", avaliacaoId: av.avaliacao.id }));
  const i3 = ok(await acoes.acaoAdicionarItemTrilha({ trilhaId: tr.id, tipo: "PRODUTO", produtoId: c2.produto.id, exigeAnterior: false }));
  ok(await acoes.acaoAlterarSituacaoTrilha({ trilhaId: tr.id, versao: tr.versao, status: "PUBLICADA" }));
  return { cr, c1, c2, av, aluno, admin, tr, itens: [i1, i2, i3], q: quem(cr.id, aluno) };
}

describe("trilha do aluno", () => {
  it("estados e motivos por item; progresso, CTA e próximo passo acompanham", async () => {
    const x = await cenario();
    const ver = async () => (await con.trilhaDoAluno(x.q, x.tr.id))!;
    let tr = await ver();
    expect(tr).toMatchObject({ titulo: "Trilha do Líder", tag: "Liderança", etapas: 3, concluidas: 0, textoEtapas: "0 de 3 etapas", cta: "Iniciar" });
    expect(tr.itens.map((i) => [i.numero, i.tipo, i.estado, i.textoMotivo])).toEqual([
      [1, "PRODUTO", "disponivel", null],
      [2, "AVALIACAO", "bloqueado", "Conclua a etapa anterior"],
      [3, "PRODUTO", "bloqueado", "Matricule-se"],
    ]);
    expect(tr.itens[0]).toMatchObject({ href: `/cursos/${x.c1.produto.slug}`, percentual: 0, duracaoSeg: 200 });
    expect(tr.proximoPasso).toMatchObject({ itemId: x.itens[0].id, href: `/cursos/${x.c1.produto.slug}` });
    await concluirAulas(x.cr.id, x.aluno, x.c1.aulas.slice(0, 1));
    tr = await ver();
    expect(tr.itens[0]).toMatchObject({ estado: "andamento", percentual: 50 });
    expect(tr.cta).toBe("Continuar");
    await concluirAulas(x.cr.id, x.aluno, x.c1.aulas.slice(1));
    tr = await ver();
    expect(tr.itens.map((i) => i.estado)).toEqual(["concluido", "disponivel", "bloqueado"]);
    expect(tr.proximoPasso?.href).toBe(`/avaliacoes/${x.av.avaliacao.id}`);
    const f = { criadorId: x.cr.id, membroId: x.aluno.membro.id, papel: "ALUNO" as const, usuarioId: x.aluno.usuario.id };
    const { tentativaId } = await t.iniciarTentativa(f, x.av.avaliacao.id);
    for (const r of respostasCertas(x.av.questoes)) await t.responder(f, { tentativaId, ...r });
    await t.finalizarTentativa(f, tentativaId, "ALUNO");
    await matricular(x.cr.id, x.aluno.membro.id, x.c2.produto.id);
    tr = await ver();
    expect(tr.itens.map((i) => i.estado)).toEqual(["concluido", "concluido", "disponivel"]);
    expect(tr.itens[1].percentual).toBe(100);
    await concluirAulas(x.cr.id, x.aluno, x.c2.aulas);
    tr = await ver();
    expect(tr).toMatchObject({ concluidas: 3, percentual: 100, cta: "Rever", proximoPasso: null });
  });

  it("visível só com matrícula em ao menos 1 curso; rascunho some; vitrine no formato ItemCartao", async () => {
    const x = await cenario();
    const semNada = await membroCom(x.cr.id, "ALUNO");
    expect(await con.trilhasDoAluno(quem(x.cr.id, semNada))).toEqual([]);
    expect(await con.trilhaDoAluno(quem(x.cr.id, semNada), x.tr.id)).toBeNull();
    const soCurso2 = await alunoMatriculado(x.cr.id, x.c2.produto.id);
    const tr = (await con.trilhaDoAluno(quem(x.cr.id, soCurso2), x.tr.id))!;
    expect(tr.itens.map((i) => i.textoMotivo)).toEqual(["Matricule-se", "Conclua a etapa anterior", null]);
    expect(await con.trilhasParaVitrine(x.q)).toEqual([
      { id: x.tr.id, tipo: "TRILHA", titulo: "Trilha do Líder", subtitulo: "Liderança · 0 de 3 etapas", imagemChave: null, href: `/trilhas/${x.tr.id}`, progresso: 0 },
    ]);
    const [{ versao }] = await con.trilhasDoAdmin(x.cr.id);
    req.h = await cabecalhosLogados(x.admin.usuario.email, x.cr.slug);
    ok(await acoes.acaoAlterarSituacaoTrilha({ trilhaId: x.tr.id, versao, status: "RASCUNHO" }));
    expect(await con.trilhasDoAluno(x.q)).toEqual([]);
  });
});

describe("equipe: itens, ordem, capa, isolamento e ALUNO recusado", () => {
  it("reordena com trava, não repete item, publicada não fica vazia, capa vira uso do arquivo", async () => {
    const x = await cenario();
    req.h = await cabecalhosLogados(x.admin.usuario.email, x.cr.slug);
    expect(await acoes.acaoAdicionarItemTrilha({ trilhaId: x.tr.id, tipo: "PRODUTO", produtoId: x.c1.produto.id })).toMatchObject({ ok: false, erro: /já está nesta trilha/ });
    const ed1 = (await con.trilhaParaEditar(x.cr.id, x.tr.id))!;
    const [a, b, c] = ed1.itens;
    ok(await acoes.acaoReordenarItensTrilha({ trilhaId: x.tr.id, itens: [c, a, b].map((i) => ({ id: i.id, versao: i.versao })) }));
    expect(await acoes.acaoReordenarItensTrilha({ trilhaId: x.tr.id, itens: [a, b, c].map((i) => ({ id: i.id, versao: i.versao })) })).toMatchObject({ ok: false, erro: /alterado por outro/ });
    const ed2 = (await con.trilhaParaEditar(x.cr.id, x.tr.id))!;
    expect(ed2.itens.map((i) => [i.titulo, i.ordem])).toEqual([[x.c2.produto.titulo, 1], [x.c1.produto.titulo, 2], [x.av.avaliacao.titulo, 3]]);
    ok(await acoes.acaoSalvarItemTrilha({ itemId: ed2.itens[0].id, versao: ed2.itens[0].versao, exigeAnterior: true }));
    for (const i of ed2.itens.slice(1)) ok(await acoes.acaoRemoverItemTrilha({ itemId: i.id, versao: i.versao }));
    const ultimo = (await con.trilhaParaEditar(x.cr.id, x.tr.id))!.itens[0];
    expect(ultimo.ordem).toBe(1);
    expect(await acoes.acaoRemoverItemTrilha({ itemId: ultimo.id, versao: ultimo.versao })).toMatchObject({ ok: false, erro: /ao menos 1 etapa/ });
    const img = await arquivoPronto(x.cr.id);
    const versao = (await con.trilhaParaEditar(x.cr.id, x.tr.id))!.trilha.versao;
    ok(await acoes.acaoDefinirCapaTrilha({ trilhaId: x.tr.id, versao, arquivoId: img.id }));
    const outra = ok(await acoes.acaoCriarTrilha({ titulo: "Outra trilha" }));
    expect(await acoes.acaoDefinirCapaTrilha({ trilhaId: outra.id, versao: outra.versao, arquivoId: img.id })).toMatchObject({ ok: false, erro: /Arquivo inválido/ });
    expect((await con.trilhaParaEditar(x.cr.id, x.tr.id))!.trilha.capaChave).toBe(img.chave);
  });

  it("A×B: produto/avaliação/trilha de B recusados no host de A; ALUNO recusado em toda action da equipe", async () => {
    const x = await cenario();
    const B = await novoCriador();
    const cB = await cursoPronto(B.id);
    const avB = await avaliacaoPronta(B.id, cB.produto.id);
    req.h = await cabecalhosLogados(x.admin.usuario.email, x.cr.slug);
    expect(await acoes.acaoAdicionarItemTrilha({ trilhaId: x.tr.id, tipo: "PRODUTO", produtoId: cB.produto.id })).toMatchObject({ ok: false, erro: "Curso não encontrado nesta área." });
    expect(await acoes.acaoAdicionarItemTrilha({ trilhaId: x.tr.id, tipo: "AVALIACAO", avaliacaoId: avB.avaliacao.id })).toMatchObject({ ok: false, erro: "Avaliação não encontrada nesta área." });
    const adminB = await membroCom(B.id, "ADMIN");
    req.h = await cabecalhosLogados(adminB.usuario.email, B.slug);
    expect(await acoes.acaoSalvarTrilha({ trilhaId: x.tr.id, versao: x.tr.versao, campos: { titulo: "invadida" } })).toMatchObject({ ok: false, erro: /não encontrada/ });
    expect(await con.trilhaParaEditar(B.id, x.tr.id)).toBeNull();
    expect(await con.trilhasDoAdmin(B.id)).toEqual([]);
    req.h = await cabecalhosLogados(x.aluno.usuario.email, x.cr.slug);
    const negado = { ok: false, erro: "Sem permissão para esta ação." };
    expect(await acoes.acaoCriarTrilha({ titulo: "Minha" })).toMatchObject(negado);
    expect(await acoes.acaoAdicionarItemTrilha({ trilhaId: x.tr.id, tipo: "PRODUTO", produtoId: x.c2.produto.id })).toMatchObject(negado);
    expect(await acoes.acaoRemoverTrilha({ trilhaId: x.tr.id, versao: x.tr.versao })).toMatchObject(negado);
    // O banco recusa item cruzado mesmo por fora das actions (FK composta).
    await expect(
      db.insert(s.criadores_trilhas_itens).values({ criador_id: x.cr.id, trilha_id: x.tr.id, ordem: 99, tipo: "PRODUTO", produto_id: cB.produto.id, modified_by: x.cr.id }),
    ).rejects.toThrow();
    const [t1] = await db.select().from(s.criadores_trilhas).where(eq(s.criadores_trilhas.id, x.tr.id));
    expect(t1.titulo).toBe("Trilha do Líder");
  });
});
