/**
 * Isolamento A x B no catalogo e nos arquivos: a equipe de A (no host de A) chama TODAS as actions
 * com ids de B e nada de B muda; arquivo de A nao e aceito no host de B (capa, thumb, material,
 * confirmacao). O banco tambem recusa (FKs compostas com criador_id).
 */
import { eq, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador, novoUsuario, vincular } from "./_apoio";
import { arquivoPronto, ok, versaoDe } from "./_catalogo";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let prod: typeof import("@/lib/actions/produtos");
let est: typeof import("@/lib/actions/produtos-estrutura");
let aulas: typeof import("@/lib/actions/aulas");
let arq: typeof import("@/lib/actions/arquivos");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  prod = await import("@/lib/actions/produtos");
  est = await import("@/lib/actions/produtos-estrutura");
  aulas = await import("@/lib/actions/aulas");
  arq = await import("@/lib/actions/arquivos");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

/** Retrato de tudo que B tem (para provar que nada mudou). */
async function retrato(criadorId: string) {
  return {
    produtos: await db.select().from(s.produtos).where(eq(s.produtos.criador_id, criadorId)),
    modulos: await db.select().from(s.produtos_modulos).where(eq(s.produtos_modulos.criador_id, criadorId)),
    aulas: await db.select().from(s.produtos_modulos_aulas).where(eq(s.produtos_modulos_aulas.criador_id, criadorId)),
    materiais: await db.select().from(s.produtos_modulos_aulas_materiais).where(eq(s.produtos_modulos_aulas_materiais.criador_id, criadorId)),
    arquivos: await db.select().from(s.arquivos).where(eq(s.arquivos.criador_id, criadorId)),
  };
}

describe("isolamento A x B", () => {
  it("a equipe de A nao le nem mexe em nada de B por nenhuma action", async () => {
    const a = await novoCriador("Criador A");
    const b = await novoCriador("Criador B");
    const donoA = await novoUsuario();
    const donoB = await novoUsuario();
    const vDonoA = await vincular(a.id, donoA.id, "DONO");
    await vincular(b.id, donoB.id, "DONO");

    // B monta um produto completo pelo host de B.
    req.h = await cabecalhosLogados(donoB.email, b.slug);
    const p = ok(await prod.acaoCriarProduto({ titulo: "Curso de B", tipo: "CURSO" }));
    const m = ok(await est.acaoCriarModulo({ produtoId: p.id, titulo: "Módulo de B" }));
    const aula = ok(await est.acaoCriarAula({ moduloId: m.id, titulo: "Aula de B" }));
    const capaB = await arquivoPronto(b.id);
    ok(await prod.acaoDefinirCapaProduto({ produtoId: p.id, versao: await versaoDe(s.produtos, p.id), formato: "16x9", arquivoId: capaB.id }));
    const mat = ok(await aulas.acaoAdicionarMaterial({ aulaId: aula.id, nome: "Link de B", url: "https://b.exemplo.com" }));
    const pendenteB = await arquivoPronto(b.id);
    await db.update(s.arquivos).set({ status: "ENVIADO_PENDENTE" }).where(eq(s.arquivos.id, pendenteB.id));
    const soltoB = await arquivoPronto(b.id);
    const antes = await retrato(b.id);

    // A tenta tudo, no host de A, com os ids de B (versoes CORRETAS: so o criador barra).
    req.h = await cabecalhosLogados(donoA.email, a.slug);
    const vp = await versaoDe(s.produtos, p.id);
    const vm = await versaoDe(s.produtos_modulos, m.id);
    const va = await versaoDe(s.produtos_modulos_aulas, aula.id);
    const vmat = await versaoDe(s.produtos_modulos_aulas_materiais, mat.id);
    const pA = ok(await prod.acaoCriarProduto({ titulo: "Curso de A", tipo: "CURSO" }));
    const mA = ok(await est.acaoCriarModulo({ produtoId: pA.id, titulo: "Módulo de A" }));
    const aulaA = ok(await est.acaoCriarAula({ moduloId: mA.id, titulo: "Aula de A" }));
    const vpA = await versaoDe(s.produtos, pA.id);
    const vaA = await versaoDe(s.produtos_modulos_aulas, aulaA.id);

    const tentativas = {
      salvarProduto: prod.acaoSalvarProduto({ produtoId: p.id, versao: vp, titulo: "Invadido", slug: "invadido", descricao: "", tipo: "CURSO", professorMembroId: null, corMarca: null }),
      situacao: prod.acaoAlterarSituacaoProduto({ produtoId: p.id, versao: vp, status: "PUBLICADO" }),
      capa: prod.acaoDefinirCapaProduto({ produtoId: p.id, versao: vp, formato: "3x4", arquivoId: null }),
      removerProduto: prod.acaoRemoverProduto({ produtoId: p.id, versao: vp }),
      criarModulo: est.acaoCriarModulo({ produtoId: p.id, titulo: "Intruso" }),
      editarModulo: est.acaoEditarModulo({ moduloId: m.id, versao: vm, titulo: "Invadido", status: "RASCUNHO" }),
      removerModulo: est.acaoRemoverModulo({ moduloId: m.id, versao: vm }),
      reordenarModulos: est.acaoReordenarModulos({ produtoId: p.id, itens: [{ id: m.id, versao: vm }] }),
      criarAula: est.acaoCriarAula({ moduloId: m.id, titulo: "Intrusa" }),
      removerAula: est.acaoRemoverAula({ aulaId: aula.id, versao: va }),
      reordenarAulas: est.acaoReordenarAulas({ moduloId: m.id, itens: [{ id: aula.id, versao: va }] }),
      salvarAula: aulas.acaoSalvarAula({ aulaId: aula.id, versao: va, titulo: "Invadida", descricao: "", liberaEm: null, preRequisitoAulaId: null, capitulos: [] }),
      thumb: aulas.acaoDefinirThumbAula({ aulaId: aula.id, versao: va, arquivoId: null }),
      material: aulas.acaoAdicionarMaterial({ aulaId: aula.id, nome: "Intruso", url: "https://a.exemplo.com" }),
      renomearMaterial: aulas.acaoRenomearMaterial({ materialId: mat.id, versao: vmat, nome: "Invadido" }),
      removerMaterial: aulas.acaoRemoverMaterial({ materialId: mat.id, versao: vmat }),
      confirmarEnvio: arq.acaoConfirmarEnvio({ arquivoId: pendenteB.id }),
      // Ids de B dentro de registros de A.
      capaDeB: prod.acaoDefinirCapaProduto({ produtoId: pA.id, versao: vpA, formato: "3x4", arquivoId: soltoB.id }),
      thumbDeB: aulas.acaoDefinirThumbAula({ aulaId: aulaA.id, versao: vaA, arquivoId: soltoB.id }),
      materialDeB: aulas.acaoAdicionarMaterial({ aulaId: aulaA.id, nome: "Arquivo de B", arquivoId: soltoB.id }),
      preRequisitoDeB: aulas.acaoSalvarAula({ aulaId: aulaA.id, versao: vaA, titulo: "Aula de A", descricao: "", liberaEm: null, preRequisitoAulaId: aula.id, capitulos: [] }),
      reordenarComAulaDeB: est.acaoReordenarAulas({ moduloId: mA.id, itens: [{ id: aula.id, versao: va }] }),
    };
    for (const [nome, promessa] of Object.entries(tentativas)) {
      const r = await promessa;
      expect(r.ok, `${nome} deveria ser recusada`).toBe(false);
    }
    expect(await retrato(b.id)).toEqual(antes);

    // Professor de outro criador tambem e recusado.
    const [vDonoB] = await db.select().from(s.criadores_membros).where(eq(s.criadores_membros.usuario_id, donoB.id));
    const vpA2 = await versaoDe(s.produtos, pA.id);
    expect(await prod.acaoSalvarProduto({ produtoId: pA.id, versao: vpA2, titulo: "Curso de A", slug: "curso-de-a", descricao: "", tipo: "CURSO", professorMembroId: vDonoB.id, corMarca: null })).toMatchObject({
      ok: false,
      erro: expect.stringMatching(/Professor/),
    });
    expect(await prod.acaoSalvarProduto({ produtoId: pA.id, versao: vpA2, titulo: "Curso de A", slug: "curso-de-a", descricao: "", tipo: "CURSO", professorMembroId: vDonoA.id, corMarca: null })).toMatchObject({ ok: true });
  });

  it("o banco recusa mistura de criadores mesmo sem a action (FKs compostas)", async () => {
    const a = await novoCriador("Criador A");
    const b = await novoCriador("Criador B");
    const capaB = await arquivoPronto(b.id);
    const autor = (await novoUsuario()).id;
    const [pA] = await db.insert(s.produtos).values({ criador_id: a.id, codigo: 1, titulo: "A", slug: "a", modified_by: autor }).returning();
    await expect(db.update(s.produtos).set({ capa_16x9_arquivo_id: capaB.id }).where(eq(s.produtos.id, pA.id))).rejects.toThrow();
    await expect(db.insert(s.produtos_modulos).values({ criador_id: b.id, produto_id: pA.id, ordem: 1, titulo: "x", modified_by: autor })).rejects.toThrow();
    // Chave fora do prefixo do criador: CHECK do banco.
    await expect(
      db.insert(s.arquivos).values({ criador_id: a.id, chave: `criadores/${b.id}/imagens/x.png`, finalidade: "IMAGEM", nome_original: "x.png", mime: "image/png", tamanho_bytes: 1, modified_by: autor }),
    ).rejects.toThrow();
    expect(await db.select().from(s.produtos_modulos).where(inArray(s.produtos_modulos.produto_id, [pA.id]))).toEqual([]);
  });
});
