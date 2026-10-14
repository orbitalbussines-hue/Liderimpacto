/**
 * Certificados (passo 7, RN-127 a RN-129) no PostgreSQL real: emissão automática quando as
 * condições fecham (e NÃO antes), idempotência sob concorrência, versões do PDF (v1, v2...), PDF
 * válido com nome e código, worker gravando no storage (se o S3 estiver no ar), revogação,
 * verificação pública sem dados sensíveis, tela do aluno, perfil, isolamento A×B e ALUNO recusado.
 */
import { and, asc, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador } from "./_apoio";
import { ok } from "./_catalogo";
import { avaliacaoPronta, concluirAulas, respostasCertas } from "./_passo7";
import { alunoMatriculado, cursoPronto, membroCom, quem } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

const S3 = ["S3_ENDPOINT", "S3_REGIAO", "S3_CHAVE", "S3_SEGREDO", "S3_BUCKET_ARQUIVOS"];
const s3NoAr = S3.every((v) => !!process.env[v]) && (await fetch(`${process.env.S3_ENDPOINT}/healthz`).then((r) => r.ok).catch(() => false));
it.runIf(!s3NoAr)("AVISO: worker de certificados com storage real PULADO", () => {
  process.stderr.write("\nAVISO: certificados.test.ts — partes com storage PULADAS (S3 fora do ar).\n");
});

let em: typeof import("@/lib/certificados/emissao");
let con: typeof import("@/lib/certificados/consultas");
let pdf: typeof import("@/lib/certificados/pdf");
let worker: typeof import("@/lib/certificados/worker");
let acoes: typeof import("@/lib/actions/certificados");
let t: typeof import("@/lib/avaliacoes/tentativas");
let perfil: typeof import("@/lib/progresso/consultas");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  em = await import("@/lib/certificados/emissao");
  con = await import("@/lib/certificados/consultas");
  pdf = await import("@/lib/certificados/pdf");
  worker = await import("@/lib/certificados/worker");
  acoes = await import("@/lib/actions/certificados");
  t = await import("@/lib/avaliacoes/tentativas");
  perfil = await import("@/lib/progresso/consultas");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const certificadosDe = (membroId: string) => db.select().from(s.produtos_certificados).where(eq(s.produtos_certificados.membro_id, membroId));
const versoesDe = (certificadoId: string) =>
  db.select().from(s.produtos_certificados_versoes).where(eq(s.produtos_certificados_versoes.certificado_id, certificadoId)).orderBy(asc(s.produtos_certificados_versoes.versao));

/** Curso de 2 aulas, aluno matriculado. */
async function cenario() {
  const cr = await novoCriador("Escola Certificadora");
  const cu = await cursoPronto(cr.id, { aulas: 2, duracao: 5400 });
  const aluno = await alunoMatriculado(cr.id, cu.produto.id);
  return { cr, cu, aluno, q: quem(cr.id, aluno) };
}

async function aprovar(criadorId: string, aluno: Awaited<ReturnType<typeof alunoMatriculado>>, av: Awaited<ReturnType<typeof avaliacaoPronta>>) {
  const f = { criadorId, membroId: aluno.membro.id, papel: "ALUNO" as const, usuarioId: aluno.usuario.id };
  const { tentativaId } = await t.iniciarTentativa(f, av.avaliacao.id);
  for (const r of respostasCertas(av.questoes)) await t.responder(f, { tentativaId, ...r });
  return t.finalizarTentativa(f, tentativaId, "ALUNO");
}

describe("emissão automática", () => {
  it("só quando a matrícula conclui E a obrigatória é aprovada (nem antes); v1 PENDENTE; trilha", async () => {
    const x = await cenario();
    const obrig = await avaliacaoPronta(x.cr.id, x.cu.produto.id, { obrigatoria: true });
    await avaliacaoPronta(x.cr.id, x.cu.produto.id, { obrigatoria: false, notaMinima: 100 });
    await concluirAulas(x.cr.id, x.aluno, x.cu.aulas.slice(0, 1));
    expect(await certificadosDe(x.aluno.membro.id)).toHaveLength(0);
    await concluirAulas(x.cr.id, x.aluno, x.cu.aulas.slice(1));
    expect(await certificadosDe(x.aluno.membro.id)).toHaveLength(0); // falta a obrigatória
    const tela = await con.certificadosDoAluno(x.q);
    expect(tela.emitidos).toHaveLength(0);
    expect(tela.bloqueados[0]).toMatchObject({ percentual: 100, aulasRestantes: 0, avaliacoesPendentes: [{ id: obrig.avaliacao.id, titulo: obrig.avaliacao.titulo }] });
    await aprovar(x.cr.id, x.aluno, obrig);
    const [c] = await certificadosDe(x.aluno.membro.id);
    expect(c).toMatchObject({ situacao: "EMITIDO", produto_id: x.cu.produto.id, modified_by: x.aluno.usuario.id });
    expect(c.codigo).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/);
    const [v1] = await versoesDe(c.id);
    expect(v1).toMatchObject({ versao: 1, situacao: "PENDENTE" });
    expect(v1.dados).toMatchObject({ nome: "Pessoa de Teste", curso: x.cu.produto.titulo, cargaHorariaSeg: 10800, criador: "Escola Certificadora", codigo: c.codigo });
    expect(v1.dados.texto).toContain("com carga horária de 3 horas");
    // Origem real da plataforma (BETTER_AUTH_URL do ambiente de teste), com protocolo e porta.
    const base = new URL(process.env.BETTER_AUTH_URL ?? "https://localhost");
    expect(v1.dados.urlVerificacao).toBe(`${base.protocol}//${x.cr.slug}.${base.host}/certificado/${c.codigo}`);
    const [tr] = await db.select().from(s.auditoria).where(and(eq(s.auditoria.tabela, "produtos_certificados"), eq(s.auditoria.registro_id, c.id)));
    expect(tr).toMatchObject({ acao: "criar", user_id: null });
    const tela2 = await con.certificadosDoAluno(x.q);
    expect(tela2).toMatchObject({ bloqueados: [], emitidos: [{ id: c.id, codigo: c.codigo, situacao: "EMITIDO", pdf: { versao: 1, situacao: "PENDENTE" }, cargaHoraria: "3 horas" }] });
    expect((await perfil.numerosDoPerfil(x.q)).certificados).toBe(1);
  });

  it("sem avaliação obrigatória, a conclusão da última aula emite (gatilho do progresso)", async () => {
    const x = await cenario();
    await concluirAulas(x.cr.id, x.aluno, x.cu.aulas);
    expect(await certificadosDe(x.aluno.membro.id)).toHaveLength(1);
  });

  it("idempotente: 6 conclusões simultâneas = 1 certificado e 1 versão", async () => {
    const x = await cenario();
    await db.update(s.produtos_matriculas).set({ concluida_em: new Date() }).where(eq(s.produtos_matriculas.membro_id, x.aluno.membro.id));
    const r = await Promise.all(Array.from({ length: 6 }, () => em.emitir(x.cr.id, x.aluno.membro.id, x.cu.produto.id)));
    expect(r.filter((e) => e?.novo)).toHaveLength(1);
    expect(new Set(r.map((e) => e?.certificadoId)).size).toBe(1);
    const cs = await certificadosDe(x.aluno.membro.id);
    expect(cs).toHaveLength(1);
    expect(await versoesDe(cs[0].id)).toHaveLength(1);
    // Matrícula cancelada: não emite.
    const outro = await alunoMatriculado(x.cr.id, x.cu.produto.id);
    await db.update(s.produtos_matriculas).set({ concluida_em: new Date(), status: "CANCELADA", motivo_cancelamento: "teste" }).where(eq(s.produtos_matriculas.membro_id, outro.membro.id));
    expect(await em.emitir(x.cr.id, outro.membro.id, x.cu.produto.id)).toBeNull();
  });
});

describe("PDF, versões, revogação e verificação pública", () => {
  it("PDF abre (pdf-lib), A4 paisagem, com o nome e o código", async () => {
    const x = await cenario();
    await concluirAulas(x.cr.id, x.aluno, x.cu.aulas);
    const [c] = await certificadosDe(x.aluno.membro.id);
    const [v] = await versoesDe(c.id);
    const doc = await PDFDocument.load(await pdf.gerarPdfCertificado(v.dados));
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([842, 595]);
    expect(doc.getTitle()).toContain("Pessoa de Teste");
    expect(doc.getSubject()).toContain(c.codigo);
  });

  it("nova versão incrementa (mesmo sem mudança); worker grava no storage e o download serve a última", async () => {
    const x = await cenario();
    await concluirAulas(x.cr.id, x.aluno, x.cu.aulas);
    const [c] = await certificadosDe(x.aluno.membro.id);
    const admin = await membroCom(x.cr.id, "ADMIN");
    req.h = await cabecalhosLogados(admin.usuario.email, x.cr.slug);
    expect(ok(await acoes.acaoGerarNovaVersaoCertificado({ certificadoId: c.id }))).toMatchObject({ versao: 2 });
    expect(ok(await acoes.acaoGerarNovaVersaoCertificado({ certificadoId: c.id }))).toMatchObject({ versao: 3 });
    const vs = await versoesDe(c.id);
    expect(vs.map((v) => v.versao)).toEqual([1, 2, 3]);
    if (!s3NoAr) return;
    for (const v of vs.slice(0, 2)) expect(await worker.processarVersao(v.id)).toBe("pronta");
    expect(await worker.processarVersao(vs[0].id)).toBe("ja-pronta");
    const [v1] = await versoesDe(c.id);
    const [arq] = await db.select().from(s.arquivos).where(eq(s.arquivos.id, v1.arquivo_id!));
    expect(arq).toMatchObject({ finalidade: "CERTIFICADO", mime: "application/pdf", status: "DISPONIVEL", chave: `criadores/${x.cr.id}/certificados/${c.id}/v1.pdf` });
    // Serve a última PRONTA (v2; a v3 ainda está pendente).
    const link = ok(await acoes.acaoBaixarCertificado({ certificadoId: c.id }));
    expect(link.versao).toBe(2);
    const baixado = await fetch(link.url);
    expect(baixado.ok).toBe(true);
    expect((await PDFDocument.load(new Uint8Array(await baixado.arrayBuffer()))).getSubject()).toContain(c.codigo);
    // Aluno baixa o próprio; outro aluno não.
    req.h = await cabecalhosLogados(x.aluno.usuario.email, x.cr.slug);
    expect(ok(await acoes.acaoBaixarCertificado({ certificadoId: c.id })).versao).toBe(2);
    const outro = await membroCom(x.cr.id, "ALUNO");
    req.h = await cabecalhosLogados(outro.usuario.email, x.cr.slug);
    expect(await acoes.acaoBaixarCertificado({ certificadoId: c.id })).toMatchObject({ ok: false, erro: "Certificado não encontrado." });
    expect((await con.urlDoPdfPorCodigo(x.cr.id, c.codigo.toLowerCase()))?.versao).toBe(2);
  });

  it("revogar (equipe, trava, motivo): público diz REVOGADO, sem PDF; ALUNO não revoga; verificação sem dados sensíveis", async () => {
    const x = await cenario();
    await concluirAulas(x.cr.id, x.aluno, x.cu.aulas);
    const [c] = await certificadosDe(x.aluno.membro.id);
    const pub = await con.verificarPublico(x.cr.id, `${c.codigo.slice(0, 5)}-${c.codigo.slice(5)}`.toLowerCase());
    expect(Object.keys(pub!).sort()).toEqual(["cargaHoraria", "codigo", "codigoLegivel", "concluidoEm", "criador", "curso", "emitidoEm", "nome", "revogadoEm", "situacao", "temPdf"]);
    expect(pub).toMatchObject({ situacao: "VALIDO", nome: "Pessoa de Teste", curso: x.cu.produto.titulo, criador: "Escola Certificadora", revogadoEm: null });
    expect(JSON.stringify(pub)).not.toContain(x.aluno.usuario.email);
    expect(JSON.stringify(pub)).not.toContain(x.aluno.membro.id);
    req.h = await cabecalhosLogados(x.aluno.usuario.email, x.cr.slug);
    expect(await acoes.acaoRevogarCertificado({ certificadoId: c.id, versao: c.updated_at.toISOString(), motivo: "fraude" })).toMatchObject({ ok: false, erro: "Sem permissão para esta ação." });
    expect(await acoes.acaoGerarNovaVersaoCertificado({ certificadoId: c.id })).toMatchObject({ ok: false, erro: "Sem permissão para esta ação." });
    const dono = await membroCom(x.cr.id, "DONO");
    req.h = await cabecalhosLogados(dono.usuario.email, x.cr.slug);
    ok(await acoes.acaoRevogarCertificado({ certificadoId: c.id, versao: c.updated_at.toISOString(), motivo: "Emitido por engano" }));
    expect(await acoes.acaoRevogarCertificado({ certificadoId: c.id, versao: c.updated_at.toISOString(), motivo: "de novo" })).toMatchObject({ ok: false, erro: /alterado por outro/ });
    expect(await con.verificarPublico(x.cr.id, c.codigo)).toMatchObject({ situacao: "REVOGADO", temPdf: false, revogadoEm: expect.any(Date) });
    expect(JSON.stringify(await con.verificarPublico(x.cr.id, c.codigo))).not.toContain("Emitido por engano");
    expect(await con.urlDoPdfPorCodigo(x.cr.id, c.codigo)).toBeNull();
    expect(await acoes.acaoGerarNovaVersaoCertificado({ certificadoId: c.id })).toMatchObject({ ok: false, erro: /revogado/ });
    expect((await perfil.numerosDoPerfil(x.q)).certificados).toBe(0);
    // Não reemite depois de revogado.
    expect(await em.emitir(x.cr.id, x.aluno.membro.id, x.cu.produto.id)).toMatchObject({ novo: false });
    const lista = await con.certificadosDoAdmin(x.cr.id, { busca: c.codigo.toLowerCase(), pagina: 1, porPagina: 20 });
    expect(lista).toMatchObject({ total: 1, resumo: { emitidos: 0, revogados: 1 }, linhas: [{ id: c.id, situacao: "REVOGADO", motivoRevogacao: "Emitido por engano" }] });
  });

  it("isolamento A×B: código de B no host de A = null; admin de A não revoga/gera em B; modelo por curso de B recusado", async () => {
    const A = await novoCriador();
    const x = await cenario();
    await concluirAulas(x.cr.id, x.aluno, x.cu.aulas);
    const [c] = await certificadosDe(x.aluno.membro.id);
    expect(await con.verificarPublico(A.id, c.codigo)).toBeNull();
    expect(await con.urlDoPdfPorCodigo(A.id, c.codigo)).toBeNull();
    const adminA = await membroCom(A.id, "ADMIN");
    req.h = await cabecalhosLogados(adminA.usuario.email, A.slug);
    expect(await acoes.acaoRevogarCertificado({ certificadoId: c.id, versao: c.updated_at.toISOString(), motivo: "invasão" })).toMatchObject({ ok: false });
    expect(await acoes.acaoGerarNovaVersaoCertificado({ certificadoId: c.id })).toMatchObject({ ok: false, erro: "Certificado não encontrado." });
    expect(await acoes.acaoBaixarCertificado({ certificadoId: c.id })).toMatchObject({ ok: false });
    const modelo = { produtoId: x.cu.produto.id, versao: null, titulo: "Certificado", texto: "Certificamos que {nome} concluiu {curso}.", assinaturaNome: "Alguém" };
    expect(await acoes.acaoSalvarModeloCertificado(modelo)).toMatchObject({ ok: false, erro: /Curso não encontrado/ });
    expect((await con.certificadosDoAdmin(A.id, { pagina: 1, porPagina: 20 })).total).toBe(0);
  });

  it("modelo do curso > padrão do criador > embutido; trava; vale para a próxima versão", async () => {
    const x = await cenario();
    const dono = await membroCom(x.cr.id, "DONO");
    req.h = await cabecalhosLogados(dono.usuario.email, x.cr.slug);
    expect((await con.modeloDeCertificado(x.cr.id, x.cu.produto.id)).origem).toBe("EMBUTIDO");
    const padrao = ok(await acoes.acaoSalvarModeloCertificado({ produtoId: null, versao: null, titulo: "Certificado", texto: "Certificamos que {nome} terminou {curso} em {data}.", assinaturaNome: "Valmer", cor: "#336699" }));
    expect(await acoes.acaoSalvarModeloCertificado({ produtoId: null, versao: null, titulo: "Outro", texto: "Certificamos que {nome} fez.", assinaturaNome: "X" })).toMatchObject({ ok: false });
    expect(await con.modeloDeCertificado(x.cr.id, x.cu.produto.id)).toMatchObject({ origem: "PADRAO_DO_CRIADOR", assinaturaNome: "Valmer", versao: null });
    ok(await acoes.acaoSalvarModeloCertificado({ produtoId: null, versao: padrao.versao, titulo: "Certificado", texto: "Certificamos que {nome} terminou {curso}.", assinaturaNome: "Valmer A." }));
    ok(await acoes.acaoSalvarModeloCertificado({ produtoId: x.cu.produto.id, versao: null, titulo: "Diploma", texto: "Diploma de {nome} em {curso} ({carga_horaria}).", assinaturaNome: "Prof." }));
    await concluirAulas(x.cr.id, x.aluno, x.cu.aulas);
    const [c] = await certificadosDe(x.aluno.membro.id);
    const [v] = await versoesDe(c.id);
    expect(v.dados).toMatchObject({ titulo: "Diploma", texto: `Diploma de Pessoa de Teste em ${x.cu.produto.titulo} (3 horas).`, assinaturaNome: "Prof." });
  });
});
