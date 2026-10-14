/**
 * Ida e volta REAL no storage S3 de dev (SeaweedFS do docker-compose): URL pre-assinada -> PUT do
 * "navegador" -> confirmar (HEAD confere tamanho e tipo) -> usar como capa -> trocar (o objeto
 * antigo some do storage). Tambem: allowlist no servidor, PUT adulterado recusado pela assinatura,
 * confirmacao sem envio, arquivo de A nao confirmado no host de B.
 * Sem as variaveis S3_* ou com o storage fora do ar, PULA com aviso (suba: npm run db:up).
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador, novoUsuario, vincular } from "./_apoio";
import { ok, versaoDe } from "./_catalogo";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

const VARIAVEIS = ["S3_ENDPOINT", "S3_REGIAO", "S3_CHAVE", "S3_SEGREDO", "S3_BUCKET_ARQUIVOS", "S3_BUCKET_VIDEOS_ORIGINAIS", "S3_BUCKET_HLS"];
const configurado = VARIAVEIS.every((v) => !!process.env[v]);
const noAr = configurado && (await fetch(`${process.env.S3_ENDPOINT}/healthz`).then((r) => r.ok).catch(() => false));
const motivo = configurado ? `storage fora do ar em ${process.env.S3_ENDPOINT}` : "variáveis S3_* ausentes";
// Aviso VISIVEL (log de arquivo todo pulado o Vitest nao mostra): um teste que so avisa.
it.runIf(!noAr)("AVISO: ida e volta no storage PULADA", () => {
  process.stderr.write(`
AVISO: armazenamento.test.ts PULADO — ${motivo}. Suba com npm run db:up e npm run armazenamento:preparar.
`);
});

let arq: typeof import("@/lib/actions/arquivos");
let prod: typeof import("@/lib/actions/produtos");
let cliente: typeof import("@/lib/armazenamento/cliente");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  arq = await import("@/lib/actions/arquivos");
  prod = await import("@/lib/actions/produtos");
  cliente = await import("@/lib/armazenamento/cliente");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

/** PNG minimo valido (1x1). */
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

async function enviar(nome: string, mime: string, corpo: Uint8Array<ArrayBuffer>, finalidade: "IMAGEM" | "MATERIAL" = "IMAGEM") {
  const r = ok(await arq.acaoIniciarEnvio({ finalidade, nome, mime, tamanho: corpo.byteLength }));
  const put = await fetch(r.envio.url, { method: r.envio.metodo, headers: r.envio.cabecalhos, body: corpo });
  return { ...r, put };
}

describe.skipIf(!noAr)("armazenamento S3 (ida e volta real)", () => {
  it("URL pre-assinada -> PUT -> confirmar -> HEAD -> capa -> troca apaga o objeto antigo", async () => {
    const a = await novoCriador("Criador Storage");
    const dono = await novoUsuario();
    await vincular(a.id, dono.id, "DONO");
    req.h = await cabecalhosLogados(dono.email, a.slug);

    const e1 = await enviar("capa.png", "image/png", PNG);
    expect(e1.put.status).toBe(200);
    expect(e1.envio.url).toContain(`/criadores/${a.id}/imagens/${e1.arquivoId}.png`);
    const [pendente] = await db.select().from(s.arquivos).where(eq(s.arquivos.id, e1.arquivoId));
    expect(pendente).toMatchObject({ status: "ENVIADO_PENDENTE", criador_id: a.id, tamanho_bytes: PNG.byteLength });
    // Ainda pendente: nao vira capa.
    const p = ok(await prod.acaoCriarProduto({ titulo: "Curso com Capa", tipo: "CURSO" }));
    expect(await prod.acaoDefinirCapaProduto({ produtoId: p.id, versao: await versaoDe(s.produtos, p.id), formato: "16x9", arquivoId: e1.arquivoId })).toMatchObject({ ok: false });

    expect(ok(await arq.acaoConfirmarEnvio({ arquivoId: e1.arquivoId }))).toMatchObject({ arquivoId: e1.arquivoId, mime: "image/png", tamanho: PNG.byteLength });
    expect(await arq.acaoConfirmarEnvio({ arquivoId: e1.arquivoId })).toMatchObject({ ok: false });
    expect(await cliente.cabecalhoDoObjeto({ bucket: "arquivos", criadorId: a.id, chave: pendente.chave })).toEqual({ tamanho: PNG.byteLength, mime: "image/png" });

    ok(await prod.acaoDefinirCapaProduto({ produtoId: p.id, versao: await versaoDe(s.produtos, p.id), formato: "16x9", arquivoId: e1.arquivoId }));
    // A URL da imagem e estavel na janela (cache do next/image) e serve o objeto.
    const url = await cliente.urlDeImagem(a.id, pendente.chave);
    expect(await cliente.urlDeImagem(a.id, pendente.chave)).toBe(url);
    expect((await fetch(url)).status).toBe(200);

    const e2 = await enviar("nova.png", "image/png", PNG);
    ok(await arq.acaoConfirmarEnvio({ arquivoId: e2.arquivoId }));
    ok(await prod.acaoDefinirCapaProduto({ produtoId: p.id, versao: await versaoDe(s.produtos, p.id), formato: "16x9", arquivoId: e2.arquivoId }));
    expect(await cliente.cabecalhoDoObjeto({ bucket: "arquivos", criadorId: a.id, chave: pendente.chave })).toBeNull();
    expect((await db.select().from(s.arquivos).where(eq(s.arquivos.id, e1.arquivoId)))[0].is_deleted).toBe(true);
  });

  it("allowlist no servidor; PUT adulterado e envio que nao chegou sao recusados; A nao confirma em B", async () => {
    const a = await novoCriador("Criador A");
    const b = await novoCriador("Criador B");
    const donoA = await novoUsuario();
    const donoB = await novoUsuario();
    await vincular(a.id, donoA.id, "DONO");
    await vincular(b.id, donoB.id, "DONO");
    req.h = await cabecalhosLogados(donoA.email, a.slug);

    const recusados = [
      { finalidade: "IMAGEM", nome: "x.svg", mime: "image/svg+xml", tamanho: 10 },
      { finalidade: "IMAGEM", nome: "x.exe", mime: "image/png", tamanho: 10 },
      { finalidade: "IMAGEM", nome: "x.png", mime: "application/pdf", tamanho: 10 },
      { finalidade: "IMAGEM", nome: "x.png", mime: "image/png", tamanho: 10 * 1024 * 1024 + 1 },
      { finalidade: "MATERIAL", nome: "x.pdf", mime: "application/pdf", tamanho: 50 * 1024 * 1024 + 1 },
      { finalidade: "MATERIAL", nome: "x.zip", mime: "application/zip", tamanho: 10 },
      { finalidade: "VIDEO", nome: "x.mp4", mime: "video/mp4", tamanho: 10 },
    ];
    for (const r of recusados) expect(await arq.acaoIniciarEnvio(r), r.nome).toMatchObject({ ok: false });
    expect(ok(await arq.acaoIniciarEnvio({ finalidade: "MATERIAL", nome: "Apostila.PDF", mime: "application/pdf", tamanho: 50 * 1024 * 1024 }))).toHaveProperty("arquivoId");

    // Tamanho/tipo diferentes do assinado: o storage recusa o PUT.
    const r = ok(await arq.acaoIniciarEnvio({ finalidade: "IMAGEM", nome: "a.png", mime: "image/png", tamanho: PNG.byteLength }));
    expect((await fetch(r.envio.url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: new Uint8Array(PNG.byteLength + 5) })).status).toBe(403);
    expect((await fetch(r.envio.url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: PNG })).status).toBe(403);
    // Nada chegou: confirmar recusa e descarta o registro.
    expect(await arq.acaoConfirmarEnvio({ arquivoId: r.arquivoId })).toMatchObject({ ok: false, erro: expect.stringMatching(/não chegou/) });
    expect((await db.select().from(s.arquivos).where(eq(s.arquivos.id, r.arquivoId)))[0].is_deleted).toBe(true);

    // Arquivo enviado por A: no host de B nao confirma (nem mexe no registro).
    const deA = await enviar("de-a.png", "image/png", PNG);
    req.h = await cabecalhosLogados(donoB.email, b.slug);
    expect(await arq.acaoConfirmarEnvio({ arquivoId: deA.arquivoId })).toMatchObject({ ok: false, erro: expect.stringMatching(/não encontrado/) });
    expect((await db.select().from(s.arquivos).where(eq(s.arquivos.id, deA.arquivoId)))[0]).toMatchObject({ status: "ENVIADO_PENDENTE", is_deleted: false });
    // A camada do storage recusa chave de outro criador antes de assinar.
    const [linha] = await db.select().from(s.arquivos).where(eq(s.arquivos.id, deA.arquivoId));
    await expect(cliente.urlDeLeitura({ bucket: "arquivos", criadorId: b.id, chave: linha.chave })).rejects.toThrow(/fora da área/);
  });
});
