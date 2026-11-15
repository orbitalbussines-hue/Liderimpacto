/**
 * Conteúdo da aula em blocos (RN-275) no PostgreSQL REAL: a action só aceita imagem DESTE criador,
 * IMAGEM, disponível e sem outro uso; a trilha registra o resumo (não o JSON); a imagem que sai é
 * descartada; aula bloqueada não entrega blocos nem URL; aula de leitura conclui pelo botão e
 * aparece como "Leitura" na estrutura (aluno e admin).
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { BlocoConteudo } from "@/lib/catalogo/conteudo-aula";
import { cabecalhosLogados, novoCriador } from "./_apoio";
import { arquivoPronto, ok, versaoDe } from "./_catalogo";
import { cursoPronto, matricular, membroCom, novaAula, progressoDe, quem } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let aulas: typeof import("@/lib/actions/aulas");
let estrutura: typeof import("@/lib/actions/produtos-estrutura");
let progresso: typeof import("@/lib/actions/progresso");
let curso: typeof import("@/lib/progresso/consultas-curso");
let catalogo: typeof import("@/lib/catalogo/consultas");
let MSG_ARQUIVO_INVALIDO: string;
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  aulas = await import("@/lib/actions/aulas");
  estrutura = await import("@/lib/actions/produtos-estrutura");
  progresso = await import("@/lib/actions/progresso");
  curso = await import("@/lib/progresso/consultas-curso");
  catalogo = await import("@/lib/catalogo/consultas");
  MSG_ARQUIVO_INVALIDO = (await import("@/lib/armazenamento/arquivos")).MSG_ARQUIVO_INVALIDO;
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const VIDEO: BlocoConteudo = { tipo: "VIDEO", provedor: "YOUTUBE", id: "dQw4w9WgXcQ" };

/** Curso de 3 aulas; dono logado; Ana matriculada. */
async function cenario() {
  const cr = await novoCriador();
  const c = await cursoPronto(cr.id, { aulas: 3 });
  const dono = await membroCom(cr.id, "DONO");
  const ana = await membroCom(cr.id, "ALUNO");
  await matricular(cr.id, ana.membro.id, c.produto.id);
  req.h = await cabecalhosLogados(dono.usuario.email, cr.slug);
  const aula = c.aulas[0].id;
  const salvar = async (extra: Record<string, unknown>, aulaId = aula) =>
    aulas.acaoSalvarAula({ aulaId, versao: await versaoDe(s.produtos_modulos_aulas, aulaId), titulo: "Aula 1", descricao: "", liberaEm: null, preRequisitoAulaId: null, capitulos: [], ...extra });
  const linha = async (aulaId = aula) => (await db.select().from(s.produtos_modulos_aulas).where(eq(s.produtos_modulos_aulas.id, aulaId)))[0];
  const arquivo = async (id: string) => (await db.select().from(s.arquivos).where(eq(s.arquivos.id, id)))[0];
  return { cr, c, dono, ana, aula, salvar, linha, arquivo };
}

describe("salvar o conteúdo (action)", () => {
  it("recusa imagem de outro criador e arquivo que não é IMAGEM", async () => {
    const x = await cenario();
    const deOutro = await arquivoPronto((await novoCriador()).id);
    const material = await arquivoPronto(x.cr.id, "MATERIAL");
    expect(await x.salvar({ conteudo: [{ tipo: "IMAGEM", arquivoId: deOutro.id, alt: "Mapa" }] })).toEqual({ ok: false, erro: MSG_ARQUIVO_INVALIDO });
    expect(await x.salvar({ conteudo: [{ tipo: "IMAGEM", arquivoId: material.id, alt: "Mapa" }] })).toEqual({ ok: false, erro: MSG_ARQUIVO_INVALIDO });
    expect(await x.salvar({ conteudo: [{ tipo: "VIDEO", provedor: "YOUTUBE", id: "<script>" }] })).toMatchObject({ ok: false });
    expect((await x.linha()).conteudo).toBeNull();
  });

  it("grava os blocos, deriva a descrição, resume na trilha, mantém, troca e descarta a imagem", async () => {
    const x = await cenario();
    const img = await arquivoPronto(x.cr.id);
    const blocos: BlocoConteudo[] = [{ tipo: "TEXTO", texto: "Introdução" }, { tipo: "IMAGEM", arquivoId: img.id, alt: "Mapa", legenda: "Figura 1" }, VIDEO, { tipo: "TEXTO", texto: "Fim" }];
    ok(await x.salvar({ descricao: "ignorada pelo servidor", conteudo: blocos }));
    expect(await x.linha()).toMatchObject({ conteudo: blocos, descricao: "Introdução\n\nFim" });

    const [t] = await db
      .select()
      .from(s.auditoria)
      .where(and(eq(s.auditoria.tabela, "produtos_modulos_aulas"), eq(s.auditoria.registro_id, x.aula), eq(s.auditoria.user_id, x.dono.usuario.id)));
    expect(t.detalhes).toContain("conteudo: vazio → 4 blocos (1 imagem, 1 vídeo)");
    expect((t.dados_novos as Record<string, unknown>).conteudo).toBe("4 blocos (1 imagem, 1 vídeo)");

    // A mesma imagem de novo (mantida, em outra ordem) passa; chamada antiga (sem `conteudo`) não mexe.
    ok(await x.salvar({ conteudo: [blocos[1], blocos[0]] }));
    ok(await x.salvar({ descricao: "texto solto" }));
    expect((await x.linha()).conteudo).toEqual([blocos[1], blocos[0]]);
    expect((await x.linha()).descricao).toBe("texto solto");

    // Imagem do conteúdo é um uso: não vira thumb.
    expect(await aulas.acaoDefinirThumbAula({ aulaId: x.aula, versao: await versaoDe(s.produtos_modulos_aulas, x.aula), arquivoId: img.id })).toEqual({ ok: false, erro: MSG_ARQUIVO_INVALIDO });

    // Remover o bloco: o arquivo é descartado; conteúdo vazio vira null.
    ok(await x.salvar({ conteudo: [] }));
    expect((await x.linha()).conteudo).toBeNull();
    expect((await x.linha()).descricao).toBe("");
    expect((await x.arquivo(img.id)).is_deleted).toBe(true);
  });

  it("excluir a aula descarta as imagens do conteúdo", async () => {
    const x = await cenario();
    const img = await arquivoPronto(x.cr.id);
    ok(await x.salvar({ conteudo: [{ tipo: "IMAGEM", arquivoId: img.id, alt: "Mapa" }] }));
    // Publicado sem capa recusaria a remoção (garantirPublicavel): rascunho, que não é o assunto aqui.
    await db.update(s.produtos).set({ status: "RASCUNHO" }).where(eq(s.produtos.id, x.c.produto.id));
    ok(await estrutura.acaoRemoverAula({ aulaId: x.aula, versao: await versaoDe(s.produtos_modulos_aulas, x.aula) }));
    expect((await x.arquivo(img.id)).is_deleted).toBe(true);
  });
});

describe("o que o aluno recebe", () => {
  it("aula bloqueada (liberação futura) não devolve blocos, URL nem descrição; a equipe vê", async () => {
    const x = await cenario();
    const img = await arquivoPronto(x.cr.id);
    ok(await x.salvar({ conteudo: [{ tipo: "TEXTO", texto: "Segredo" }, { tipo: "IMAGEM", arquivoId: img.id, alt: "Mapa" }] }));
    await db.update(s.produtos_modulos_aulas).set({ libera_em: new Date(Date.now() + 10 * 86_400_000) }).where(eq(s.produtos_modulos_aulas.id, x.aula));

    const daAna = await curso.aulaParaPlayer(quem(x.cr.id, x.ana), x.aula);
    expect(daAna).toMatchObject({ pode: false, conteudo: null, leitura: false });
    expect(daAna?.aula.descricao).toBeNull();
    expect(JSON.stringify(daAna)).not.toContain(img.id);

    const doDono = await curso.aulaParaPlayer(quem(x.cr.id, x.dono), x.aula);
    expect(doDono?.conteudo?.blocos).toHaveLength(2);
    expect(Object.keys(doDono?.conteudo?.imagens ?? {})).toEqual([img.id]);
  });

  it("aula de leitura: sem vídeo e com conteúdo, conclui pelo botão e sai como Leitura na estrutura", async () => {
    const x = await cenario();
    const leitura = await novaAula(x.cr.id, x.c.modulo.id, 4, null);
    const comVideo = x.c.aulas[1].id;
    const conteudo: BlocoConteudo[] = [{ tipo: "TEXTO", texto: "Leia com calma." }];
    await db.update(s.produtos_modulos_aulas).set({ conteudo }).where(eq(s.produtos_modulos_aulas.id, leitura.id));
    await db.update(s.produtos_modulos_aulas).set({ conteudo }).where(eq(s.produtos_modulos_aulas.id, comVideo));
    await db.insert(s.produtos_modulos_aulas_videos).values({
      criador_id: x.cr.id,
      aula_id: comVideo,
      situacao: "PRONTO",
      nome_original: "aula.mp4",
      mime: "video/mp4",
      tamanho_bytes: 10,
      chave_origem: `criadores/${x.cr.id}/videos/${randomUUID()}/original.mp4`,
      chave_cifrada: "x",
      modified_by: x.dono.usuario.id,
    });

    const p = await curso.aulaParaPlayer(quem(x.cr.id, x.ana), leitura.id);
    expect(p).toMatchObject({ pode: true, leitura: true, concluirManual: true, video: null });
    expect(p?.conteudo?.blocos).toEqual(conteudo);
    // Com vídeo, o conteúdo vai na aba Descrição (não é leitura).
    expect(await curso.aulaParaPlayer(quem(x.cr.id, x.ana), comVideo)).toMatchObject({ leitura: false, conteudo: { blocos: conteudo } });

    const lista = (await curso.cursoDoAluno(quem(x.cr.id, x.ana), x.c.produto.slug))!.modulos[0].aulas;
    expect(lista.map((a) => a.leitura)).toEqual([false, false, false, true]);
    const admin = (await catalogo.produtoParaEditar(x.cr.id, x.c.produto.id))!.modulos[0].aulas;
    expect(admin.map((a) => a.leitura)).toEqual([false, false, false, true]);

    req.h = await cabecalhosLogados(x.ana.usuario.email, x.cr.slug);
    ok(await progresso.acaoConcluirAula({ aulaId: leitura.id }));
    expect(await progressoDe(x.ana.membro.id, leitura.id)).toMatchObject({ concluida: true, concluida_por: "MANUAL" });
  });
});
