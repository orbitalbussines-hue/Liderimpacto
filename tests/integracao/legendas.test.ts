/**
 * Legendas da aula (RN-180, ADR-0013) com PostgreSQL e storage S3 REAIS: envio pelo caminho de
 * verdade (URL assinada -> PUT -> confirmar -> converter), troca com histórico, remoção, rota do
 * `.vtt` (401/403/404/200), isolamento A x B, ALUNO sem permissão e trilha sem o conteúdo.
 * Sem S3 no ar, PULA com aviso (suba: npm run db:up && npm run armazenamento:preparar).
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhos, cabecalhosLogados, novoCriador, novoUsuario, trilhaDe, vincular } from "./_apoio";
import { ok, versaoDe } from "./_catalogo";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

const VARIAVEIS = ["S3_ENDPOINT", "S3_REGIAO", "S3_CHAVE", "S3_SEGREDO", "S3_BUCKET_ARQUIVOS"];
const noAr = VARIAVEIS.every((v) => !!process.env[v]) && (await fetch(`${process.env.S3_ENDPOINT}/healthz`).then((r) => r.ok).catch(() => false));
it.runIf(!noAr)("AVISO: legendas (storage real) PULADO", () => {
  process.stderr.write("\nAVISO: legendas.test.ts PULADO — storage S3 fora do ar ou variáveis S3_* ausentes.\n");
});

let est: typeof import("@/lib/actions/produtos-estrutura");
let prod: typeof import("@/lib/actions/produtos");
let arq: typeof import("@/lib/actions/arquivos");
let leg: typeof import("@/lib/actions/legendas");
let rota: typeof import("@/app/api/legendas/[id]/route");
let cliente: typeof import("@/lib/armazenamento/cliente");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  est = await import("@/lib/actions/produtos-estrutura");
  prod = await import("@/lib/actions/produtos");
  arq = await import("@/lib/actions/arquivos");
  leg = await import("@/lib/actions/legendas");
  rota = await import("@/app/api/legendas/[id]/route");
  cliente = await import("@/lib/armazenamento/cliente");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const SRT = "1\r\n00:00:01,000 --> 00:00:03,000\r\n<b>Olá</b>, turma! &lt;script&gt;\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,500\r\nSegunda <i>fala</i>\r\n";
const VTT_NORMALIZADO = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nOlá, turma! &lt;script&gt;\n\n00:00:04.000 --> 00:00:06.500\nSegunda fala\n";

/** Criador com DONO logado no host e uma aula (no produto devolvido). */
async function cenario(nome: string) {
  const c = await novoCriador(nome);
  const dono = await novoUsuario();
  await vincular(c.id, dono.id, "DONO");
  req.h = await cabecalhosLogados(dono.email, c.slug);
  const p = ok(await prod.acaoCriarProduto({ titulo: `Curso ${nome}`, tipo: "CURSO" }));
  const m = ok(await est.acaoCriarModulo({ produtoId: p.id, titulo: "Módulo" }));
  const aula = ok(await est.acaoCriarAula({ moduloId: m.id, titulo: "Aula" }));
  return { c, dono, produtoId: p.id, aula, hDono: req.h };
}

/** Caminho real do arquivo bruto: URL assinada -> PUT -> confirmar (HEAD). */
async function enviarBruto(texto: string | Uint8Array, nome = "aula.srt", mime = "application/x-subrip") {
  const corpo = new Uint8Array(typeof texto === "string" ? new TextEncoder().encode(texto) : texto);
  const r = ok(await arq.acaoIniciarEnvio({ finalidade: "LEGENDA", nome, mime, tamanho: corpo.byteLength }));
  expect((await fetch(r.envio.url, { method: "PUT", headers: r.envio.cabecalhos, body: corpo })).status).toBe(200);
  ok(await arq.acaoConfirmarEnvio({ arquivoId: r.arquivoId }));
  return r.arquivoId;
}

const legendasDaAula = (aulaId: string) => db.select().from(s.produtos_modulos_aulas_legendas).where(eq(s.produtos_modulos_aulas_legendas.aula_id, aulaId));
const pedirVtt = (h: Headers, id: string) => rota.GET(new Request(`http://x/api/legendas/${id}`, { headers: h }) as never, { params: Promise.resolve({ id }) });

describe.skipIf(!noAr)("legendas da aula (storage real)", () => {
  it("envio: SRT em CRLF vira .vtt normalizado + texto puro; bruto descartado; trilha sem o conteúdo", async () => {
    const { c, dono, aula } = await cenario("Envio");
    const arquivoId = await enviarBruto(SRT);
    const { id } = ok(await leg.acaoEnviarLegenda({ aulaId: aula.id, arquivoId, idioma: "pt-BR", rotulo: "Português", substituir: null }));

    const [l] = await legendasDaAula(aula.id);
    expect(l).toMatchObject({ id, criador_id: c.id, idioma: "pt-BR", rotulo: "Português", nome_original: "aula.srt", trechos: 2, duracao_seg: 7, enviado_por: dono.id, is_deleted: false });
    expect(l.texto).toBe("Olá, turma! <script>\nSegunda fala");
    expect(l.chave).toBe(`criadores/${c.id}/legendas/${id}.vtt`);
    const obj = await cliente.lerObjeto({ bucket: "arquivos", criadorId: c.id, chave: l.chave });
    const partes: Buffer[] = [];
    for await (const p of obj) partes.push(Buffer.from(p as Uint8Array));
    expect(Buffer.concat(partes).toString("utf8")).toBe(VTT_NORMALIZADO);

    // O bruto não sobra: registro excluído e objeto apagado.
    const [bruto] = await db.select().from(s.arquivos).where(eq(s.arquivos.id, arquivoId));
    expect(bruto.is_deleted).toBe(true);
    expect(await cliente.cabecalhoDoObjeto({ bucket: "arquivos", criadorId: c.id, chave: bruto.chave })).toBeNull();
    // O mesmo bruto não vira segunda legenda.
    expect(await leg.acaoEnviarLegenda({ aulaId: aula.id, arquivoId, idioma: "en", rotulo: "English", substituir: null })).toMatchObject({ ok: false });

    const trilha = (await trilhaDe(dono.id)).filter((t) => t.tabela === "produtos_modulos_aulas_legendas");
    expect(trilha).toHaveLength(1);
    expect(JSON.stringify(trilha[0])).not.toContain("Segunda fala");
    expect(trilha[0].dados_novos).toMatchObject({ idioma: "pt-BR", trechos: 2 });
  });

  it("recusas: conteúdo hostil/inválido, idioma inválido, latin1 aceito, legenda além do vídeo", async () => {
    const { aula } = await cenario("Recusas");
    const recusa = async (texto: string, erro: RegExp) =>
      expect(await leg.acaoEnviarLegenda({ aulaId: aula.id, arquivoId: await enviarBruto(texto), idioma: "pt-BR", rotulo: "Português", substituir: null })).toMatchObject({ ok: false, erro: expect.stringMatching(erro) });
    await recusa("<html><script>alert(1)</script></html>", /sem o tempo/);
    await recusa("1\n00:00:05,000 --> 00:00:02,000\noi\n", /fim do trecho vem antes/);
    expect(await leg.acaoEnviarLegenda({ aulaId: aula.id, arquivoId: await enviarBruto(SRT), idioma: "português", rotulo: "Português", substituir: null })).toMatchObject({ ok: false, erro: expect.stringMatching(/Idioma inválido/) });
    // Windows-1252 ("ação" em latin1) é convertido.
    const latin1 = new Uint8Array([...new TextEncoder().encode("1\n00:00:01,000 --> 00:00:02,000\na"), 0xe7, 0xe3, 0x6f, 0x0a]);
    ok(await leg.acaoEnviarLegenda({ aulaId: aula.id, arquivoId: await enviarBruto(latin1), idioma: "pt-BR", rotulo: "Português", substituir: null }));
    expect((await legendasDaAula(aula.id))[0].texto).toBe("ação");
    // Com vídeo de 4 s, legenda até 30 s é recusada.
    await db.update(s.produtos_modulos_aulas).set({ duracao_seg: 4 }).where(eq(s.produtos_modulos_aulas.id, aula.id));
    expect(
      await leg.acaoEnviarLegenda({ aulaId: aula.id, arquivoId: await enviarBruto("1\n00:00:29,000 --> 00:00:30,000\nfim\n"), idioma: "en", rotulo: "English", substituir: null }),
    ).toMatchObject({ ok: false, erro: expect.stringMatching(/vai até 00:30, mas o vídeo tem 00:04/) });
  });

  it("troca preserva o histórico (trava otimista) e remoção é lógica com modal de 3 s na tela", async () => {
    const { aula } = await cenario("Troca");
    const primeira = ok(await leg.acaoEnviarLegenda({ aulaId: aula.id, arquivoId: await enviarBruto(SRT), idioma: "pt-BR", rotulo: "Português", substituir: null }));
    // Mesmo idioma sem "Trocar": recusa.
    expect(await leg.acaoEnviarLegenda({ aulaId: aula.id, arquivoId: await enviarBruto(SRT), idioma: "pt-BR", rotulo: "Português", substituir: null })).toMatchObject({
      ok: false,
      erro: expect.stringMatching(/já tem legenda em pt-BR/),
    });
    const versao = await versaoDe(s.produtos_modulos_aulas_legendas, primeira.id);
    const novoSrt = "1\n00:00:00,500 --> 00:00:02,000\nVersão nova\n";
    // Versão velha: colisão.
    expect(
      await leg.acaoEnviarLegenda({ aulaId: aula.id, arquivoId: await enviarBruto(novoSrt), idioma: "pt-BR", rotulo: "Português", substituir: { legendaId: primeira.id, versao: new Date(Date.parse(versao) - 1000).toISOString() } }),
    ).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro/) });
    const segunda = ok(await leg.acaoEnviarLegenda({ aulaId: aula.id, arquivoId: await enviarBruto(novoSrt), idioma: "en", rotulo: "Português (revisada)", substituir: { legendaId: primeira.id, versao } }));
    const linhas = await legendasDaAula(aula.id);
    expect(linhas).toHaveLength(2);
    expect(linhas.find((l) => l.id === primeira.id)).toMatchObject({ is_deleted: true, texto: "Olá, turma! <script>\nSegunda fala" });
    // A troca herda o idioma da legenda trocada.
    expect(linhas.find((l) => l.id === segunda.id)).toMatchObject({ is_deleted: false, idioma: "pt-BR", rotulo: "Português (revisada)", texto: "Versão nova" });

    const v2 = await versaoDe(s.produtos_modulos_aulas_legendas, segunda.id);
    ok(await leg.acaoRemoverLegenda({ legendaId: segunda.id, versao: v2 }));
    expect(await leg.acaoRemoverLegenda({ legendaId: segunda.id, versao: v2 })).toMatchObject({ ok: false });
    expect((await legendasDaAula(aula.id)).every((l) => l.is_deleted)).toBe(true);
    expect((await pedirVtt(req.h, segunda.id)).status).toBe(404);
  });

  it("rota do .vtt: sem sessão 401, sem matrícula 403 (na trilha), matriculado 200, outro criador 404", async () => {
    const { c, dono, produtoId, aula, hDono } = await cenario("Rota");
    const { id } = ok(await leg.acaoEnviarLegenda({ aulaId: aula.id, arquivoId: await enviarBruto(SRT), idioma: "pt-BR", rotulo: "Português", substituir: null }));

    expect((await pedirVtt(cabecalhos(c.slug), id)).status).toBe(401);
    const equipe = await pedirVtt(hDono, id);
    expect(equipe.status).toBe(200);
    expect(equipe.headers.get("content-type")).toBe("text/vtt; charset=utf-8");
    expect(equipe.headers.get("cache-control")).toMatch(/^private/);
    expect(equipe.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await equipe.text()).toBe(VTT_NORMALIZADO);
    expect((await pedirVtt(hDono, "nao-e-uuid")).status).toBe(404);

    // ALUNO sem matrícula: 403 e recusa na trilha.
    const aluno = await novoUsuario();
    const membro = await vincular(c.id, aluno.id, "ALUNO");
    const hAluno = await cabecalhosLogados(aluno.email, c.slug);
    await db.update(s.produtos).set({ status: "PUBLICADO" }).where(eq(s.produtos.id, produtoId));
    expect((await pedirVtt(hAluno, id)).status).toBe(403);
    expect((await trilhaDe(aluno.id)).some((t) => t.acao === "acesso_negado" && t.registro_id === id)).toBe(true);

    // Matriculado: 200. Aula programada para o futuro: 403 de novo.
    const { matricular } = await import("@/lib/matriculas/servico");
    await db.transaction((tx) => matricular(tx, { criadorId: c.id, membroId: membro.id, produtoId, origem: "MANUAL", autor: dono.id }));
    const r = await pedirVtt(hAluno, id);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(VTT_NORMALIZADO);
    await db.update(s.produtos_modulos_aulas).set({ libera_em: new Date(Date.now() + 86_400_000) }).where(eq(s.produtos_modulos_aulas.id, aula.id));
    expect((await pedirVtt(hAluno, id)).status).toBe(403);

    // Sessão de OUTRO criador pedindo a legenda deste: não existe lá.
    const b = await novoCriador("Outro");
    const donoB = await novoUsuario();
    await vincular(b.id, donoB.id, "DONO");
    expect((await pedirVtt(await cabecalhosLogados(donoB.email, b.slug), id)).status).toBe(404);
    // Cookie de A apresentado no host de B: a sessão não vale lá.
    expect((await pedirVtt(new Headers({ host: `${b.slug}.localhost:3011`, cookie: hDono.get("cookie")! }), id)).status).toBe(401);
  });

  it("A x B e papéis: B não envia/remove na aula de A nem usa o arquivo de A; ALUNO recebe 'Sem permissão'", async () => {
    const a = await cenario("A");
    const arquivoDeA = await enviarBruto(SRT);
    const legA = ok(await leg.acaoEnviarLegenda({ aulaId: a.aula.id, arquivoId: arquivoDeA, idioma: "pt-BR", rotulo: "Português", substituir: null }));
    const versaoA = await versaoDe(s.produtos_modulos_aulas_legendas, legA.id);
    const outroBrutoDeA = await enviarBruto(SRT);

    const b = await cenario("B");
    const arquivoDeB = await enviarBruto(SRT);
    expect(await leg.acaoEnviarLegenda({ aulaId: a.aula.id, arquivoId: arquivoDeB, idioma: "en", rotulo: "English", substituir: null })).toMatchObject({ ok: false, erro: expect.stringMatching(/não encontrada/) });
    expect(await leg.acaoEnviarLegenda({ aulaId: b.aula.id, arquivoId: outroBrutoDeA, idioma: "pt-BR", rotulo: "Português", substituir: null })).toMatchObject({ ok: false, erro: expect.stringMatching(/inválido/) });
    expect(await leg.acaoEnviarLegenda({ aulaId: b.aula.id, arquivoId: arquivoDeB, idioma: "pt-BR", rotulo: "Português", substituir: { legendaId: legA.id, versao: versaoA } })).toMatchObject({ ok: false });
    expect(await leg.acaoRemoverLegenda({ legendaId: legA.id, versao: versaoA })).toMatchObject({ ok: false });
    expect((await pedirVtt(req.h, legA.id)).status).toBe(404);
    const [intacta] = await db.select().from(s.produtos_modulos_aulas_legendas).where(and(eq(s.produtos_modulos_aulas_legendas.id, legA.id)));
    expect(intacta.is_deleted).toBe(false);

    // ALUNO de A: nem inicia o envio, nem envia, nem remove.
    const aluno = await novoUsuario();
    await vincular(a.c.id, aluno.id, "ALUNO");
    req.h = await cabecalhosLogados(aluno.email, a.c.slug);
    expect(await arq.acaoIniciarEnvio({ finalidade: "LEGENDA", nome: "a.srt", mime: "application/x-subrip", tamanho: 10 })).toMatchObject({ ok: false, erro: "Sem permissão para esta ação." });
    expect(await leg.acaoEnviarLegenda({ aulaId: a.aula.id, arquivoId: outroBrutoDeA, idioma: "pt-BR", rotulo: "Português", substituir: null })).toMatchObject({ ok: false, erro: "Sem permissão para esta ação." });
    expect(await leg.acaoRemoverLegenda({ legendaId: legA.id, versao: versaoA })).toMatchObject({ ok: false, erro: "Sem permissão para esta ação." });
  });
});
