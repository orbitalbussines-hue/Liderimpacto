/**
 * Vídeo da aula (ADR-0005) com PostgreSQL e storage S3 reais, SEM FFmpeg (o vídeo PRONTO é
 * montado com playlists de verdade gravadas no bucket): envio multipart real, troca, isolamento
 * A x B em actions e rotas, token vencido/adulterado/de outra pessoa, limite de telas e ALUNO
 * sem acesso nesta fase. O pipeline com FFmpeg + worker está em video-pipeline.test.ts.
 * Sem S3 no ar, PULA com aviso (suba: npm run db:up && npm run armazenamento:preparar).
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador, novoUsuario, trilhaDe, vincular } from "./_apoio";
import { ok } from "./_catalogo";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

const VARIAVEIS = ["S3_ENDPOINT", "S3_REGIAO", "S3_CHAVE", "S3_SEGREDO", "S3_BUCKET_ARQUIVOS", "S3_BUCKET_VIDEOS_ORIGINAIS", "S3_BUCKET_HLS"];
const noAr = VARIAVEIS.every((v) => !!process.env[v]) && (await fetch(`${process.env.S3_ENDPOINT}/healthz`).then((r) => r.ok).catch(() => false));
it.runIf(!noAr)("AVISO: vídeo (storage real) PULADO", () => {
  process.stderr.write("\nAVISO: video.test.ts PULADO — storage S3 fora do ar ou variáveis S3_* ausentes.\n");
});

let est: typeof import("@/lib/actions/produtos-estrutura");
let prod: typeof import("@/lib/actions/produtos");
let vid: typeof import("@/lib/actions/videos");
let entrega: typeof import("@/lib/video/entrega");
let cliente: typeof import("@/lib/armazenamento/cliente");
let chaves: typeof import("@/lib/video/chaves");
let token: typeof import("@/lib/video/token");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let rotaChave: typeof import("@/app/api/video/[id]/chave/route");

beforeAll(async () => {
  est = await import("@/lib/actions/produtos-estrutura");
  prod = await import("@/lib/actions/produtos");
  vid = await import("@/lib/actions/videos");
  entrega = await import("@/lib/video/entrega");
  cliente = await import("@/lib/armazenamento/cliente");
  chaves = await import("@/lib/video/chaves");
  token = await import("@/lib/video/token");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  rotaChave = await import("@/app/api/video/[id]/chave/route");
});

const MASTER = "#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\n720p/index.m3u8\n";
const VARIANTE =
  '#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-TARGETDURATION:6\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-KEY:METHOD=AES-128,URI="chave",IV=0x00000000000000000000000000000000\n#EXTINF:6.000000,\nseg_00000.ts\n#EXT-X-ENDLIST\n';

/** Criador com DONO logado no host e uma aula. */
async function cenario(nome: string) {
  const c = await novoCriador(nome);
  const dono = await novoUsuario();
  await vincular(c.id, dono.id, "DONO");
  req.h = await cabecalhosLogados(dono.email, c.slug);
  const p = ok(await prod.acaoCriarProduto({ titulo: `Curso ${nome}`, tipo: "CURSO" }));
  const m = ok(await est.acaoCriarModulo({ produtoId: p.id, titulo: "Módulo" }));
  const aula = ok(await est.acaoCriarAula({ moduloId: m.id, titulo: "Aula" }));
  return { c, dono, aula };
}

/** Vídeo PRONTO direto no banco + playlists reais no bucket hls. */
async function videoPronto(criadorId: string, aulaId: string, autorId: string) {
  const id = randomUUID();
  const chave = chaves.gerarChaveVideo();
  const pasta = `criadores/${criadorId}/videos/${id}`;
  await db.insert(s.produtos_modulos_aulas_videos).values({
    id,
    criador_id: criadorId,
    aula_id: aulaId,
    situacao: "PRONTO",
    nome_original: "aula.mp4",
    mime: "video/mp4",
    tamanho_bytes: 10,
    chave_origem: `${pasta}/original.mp4`,
    prefixo_hls: pasta,
    chave_cifrada: chaves.cifrarChave(chave, id),
    duracao_seg: 6,
    resolucoes: ["720p"],
    modified_by: autorId,
  });
  const gravar = (rel: string, texto: string, mime: string) =>
    cliente.gravarObjeto({ bucket: "hls", criadorId, chave: `${pasta}/${rel}`, corpo: Buffer.from(texto), tamanho: Buffer.byteLength(texto), mime });
  await gravar("master.m3u8", MASTER, "application/vnd.apple.mpegurl");
  await gravar("720p/index.m3u8", VARIANTE, "application/vnd.apple.mpegurl");
  await gravar("720p/seg_00000.ts", "segmento-cifrado-de-teste", "video/mp2t");
  return { id, chave };
}

const t = (r: { urlMaster: string }) => new URL(r.urlMaster, "http://x").searchParams.get("t");

describe.skipIf(!noAr)("vídeo da aula (storage real)", () => {
  it("envio multipart real -> concluir (HEAD) -> PROCESSANDO; trocar exige confirmação e apaga o antigo", async () => {
    const { c, aula } = await cenario("Envio");
    const corpo = new TextEncoder().encode("conteudo-de-video-pequeno");
    const pedido = { aulaId: aula.id, nome: "aula.mp4", mime: "video/mp4", tamanho: corpo.byteLength, substituir: false };
    expect(await vid.acaoIniciarEnvioVideo({ ...pedido, nome: "aula.avi", mime: "video/x-msvideo" })).toMatchObject({ ok: false });

    const e = ok(await vid.acaoIniciarEnvioVideo(pedido));
    expect(e).toMatchObject({ totalPartes: 1 });
    const [url] = ok(await vid.acaoAssinarPartesVideo({ videoId: e.videoId, partes: [1] }));
    expect(url.url).toContain(`/criadores/${c.id}/videos/${e.videoId}/original.mp4`);
    const put = await fetch(url.url, { method: "PUT", body: corpo });
    expect(put.status).toBe(200);
    expect(await vid.acaoConcluirEnvioVideo({ videoId: e.videoId, partes: [] })).toMatchObject({ ok: false });
    ok(await vid.acaoConcluirEnvioVideo({ videoId: e.videoId, partes: [{ numero: 1, etag: put.headers.get("etag") }] }));
    const [linha] = await db.select().from(s.produtos_modulos_aulas_videos).where(eq(s.produtos_modulos_aulas_videos.id, e.videoId));
    expect(linha).toMatchObject({ situacao: "PROCESSANDO", upload_id: null, criador_id: c.id });
    expect(linha.chave_cifrada).toMatch(/^v1:/);

    // Já tem vídeo: sem confirmar a troca, recusa; confirmando, o antigo sai do banco e do storage.
    expect(await vid.acaoIniciarEnvioVideo(pedido)).toMatchObject({ ok: false, erro: expect.stringMatching(/Trocar/) });
    const e2 = ok(await vid.acaoIniciarEnvioVideo({ ...pedido, substituir: true }));
    const [antigo] = await db.select().from(s.produtos_modulos_aulas_videos).where(eq(s.produtos_modulos_aulas_videos.id, e.videoId));
    expect(antigo.is_deleted).toBe(true);
    expect(await cliente.cabecalhoDoObjeto({ bucket: "videosOriginais", criadorId: c.id, chave: antigo.chave_origem })).toBeNull();
    // Cancelar o envio novo: aborta o multipart e exclui.
    ok(await vid.acaoCancelarEnvioVideo({ videoId: e2.videoId }));
    const [cancelado] = await db.select().from(s.produtos_modulos_aulas_videos).where(eq(s.produtos_modulos_aulas_videos.id, e2.videoId));
    expect(cancelado.is_deleted).toBe(true);
  });

  it("reprodução: playlist reescrita, segmento por 302 curto, chave só com sessão; token ruim recusado", async () => {
    const { c, dono, aula } = await cenario("Play");
    const v = await videoPronto(c.id, aula.id, dono.id);
    const h = req.h;
    const r = ok(await vid.acaoIniciarReproducao({ aulaId: aula.id }));
    const tk = t(r)!;

    const master = await entrega.servirHls(h, tk, v.id, ["master.m3u8"]);
    expect(master.status).toBe(200);
    expect(master.headers.get("cache-control")).toContain("no-store");
    expect(await master.text()).toContain(`720p/index.m3u8?t=${encodeURIComponent(tk)}`);
    const variante = await (await entrega.servirHls(h, tk, v.id, ["720p", "index.m3u8"])).text();
    expect(variante).toContain(`URI="/api/video/${v.id}/chave?t=${encodeURIComponent(tk)}"`);
    const seg = await entrega.servirHls(new Headers({ host: h.get("host")! }), tk, v.id, ["720p", "seg_00000.ts"]);
    expect(seg.status).toBe(302);
    expect(await (await fetch(seg.headers.get("location")!)).text()).toBe("segmento-cifrado-de-teste");

    // Chave pela rota de verdade (route handler): 16 bytes iguais aos do vídeo, no-store.
    const chave = await rotaChave.GET(new NextRequest(`http://${h.get("host")}/api/video/${v.id}/chave?t=${encodeURIComponent(tk)}`, { headers: h }), {
      params: Promise.resolve({ id: v.id }),
    });
    expect(chave.status).toBe(200);
    expect(chave.headers.get("cache-control")).toContain("no-store");
    expect(Buffer.from(await chave.arrayBuffer()).equals(v.chave)).toBe(true);

    // Sem cookie (link copiado): chave e playlist recusadas.
    const semCookie = new Headers({ host: h.get("host")! });
    expect((await entrega.servirChave(semCookie, tk, v.id)).status).toBe(403);
    expect((await entrega.servirHls(semCookie, tk, v.id, ["master.m3u8"])).status).toBe(403);

    // Adulterado e sem token.
    const adulterado = tk.slice(0, -2) + (tk.endsWith("A") ? "BB" : "AA");
    expect((await entrega.servirHls(h, adulterado, v.id, ["720p", "seg_00000.ts"])).status).toBe(403);
    expect((await entrega.servirChave(h, adulterado, v.id)).status).toBe(403);
    expect((await entrega.servirChave(h, null, v.id)).status).toBe(403);

    // Vencido: segmento sem sessão recusado; com a sessão inteira valendo, aceito (Safari nativo).
    const dados = { videoId: v.id, criadorId: c.id, usuarioId: dono.id, sessaoId: r.sessaoId, exp: Math.floor(Date.now() / 1000) - 5 };
    const vencido = token.assinarToken(dados);
    expect((await entrega.servirHls(semCookie, vencido, v.id, ["720p", "seg_00000.ts"])).status).toBe(403);
    expect((await entrega.servirHls(h, vencido, v.id, ["720p", "seg_00000.ts"])).status).toBe(302);

    // De outra pessoa (mesmo criador, com o PRÓPRIO cookie): recusado.
    const outro = await novoUsuario();
    await vincular(c.id, outro.id, "ADMIN");
    const hOutro = await cabecalhosLogados(outro.email, c.slug);
    expect((await entrega.servirChave(hOutro, tk, v.id)).status).toBe(403);
    expect((await entrega.servirHls(hOutro, tk, v.id, ["master.m3u8"])).status).toBe(403);
    expect((await trilhaDe(outro.id)).some((l) => l.acao === "acesso_negado" && l.tabela === "produtos_modulos_aulas_videos")).toBe(true);

    // Caminho fora do formato.
    expect((await entrega.servirHls(h, tk, v.id, ["..", "original.mp4"])).status).toBe(404);
  });

  it("limite de 2 telas: a terceira encerra a mais antiga (chave e renovação recusadas)", async () => {
    const { c, dono, aula } = await cenario("Telas");
    const v = await videoPronto(c.id, aula.id, dono.id);
    const logins = [req.h, await cabecalhosLogados(dono.email, c.slug), await cabecalhosLogados(dono.email, c.slug)];
    const reps = [];
    for (const h of logins) {
      req.h = h;
      reps.push(ok(await vid.acaoIniciarReproducao({ aulaId: aula.id })));
    }
    // Mesma aba de novo: reaproveita a sessão (não conta como tela nova).
    req.h = logins[2];
    expect(ok(await vid.acaoIniciarReproducao({ aulaId: aula.id })).sessaoId).toBe(reps[2].sessaoId);

    expect((await entrega.servirChave(logins[0], t(reps[0]), v.id)).status).toBe(403);
    expect((await entrega.servirChave(logins[1], t(reps[1]), v.id)).status).toBe(200);
    expect((await entrega.servirChave(logins[2], t(reps[2]), v.id)).status).toBe(200);
    req.h = logins[0];
    expect(await vid.acaoRenovarReproducao({ aulaId: aula.id, videoId: v.id, sessaoId: reps[0].sessaoId })).toMatchObject({ ok: false, erro: expect.stringMatching(/outra tela/) });
    req.h = logins[1];
    const renovado = ok(await vid.acaoRenovarReproducao({ aulaId: aula.id, videoId: v.id, sessaoId: reps[1].sessaoId }));
    expect(renovado.sessaoId).toBe(reps[1].sessaoId);
    expect(new Date(renovado.expiraEm).getTime()).toBeGreaterThanOrEqual(new Date(reps[1].expiraEm).getTime());
    expect((await entrega.servirChave(logins[1], renovado.token, v.id)).status).toBe(200);
  });

  it("isolamento A x B: vídeo de B no host de A = 404/recusa em todas as rotas e actions", async () => {
    const B = await cenario("B");
    const vB = await videoPronto(B.c.id, B.aula.id, B.dono.id);
    const hB = req.h;
    const repB = ok(await vid.acaoIniciarReproducao({ aulaId: B.aula.id }));
    const tkB = t(repB);
    const antes = await db.select().from(s.produtos_modulos_aulas_videos).where(eq(s.produtos_modulos_aulas_videos.criador_id, B.c.id));

    await cenario("A");
    const hA = req.h;
    const tentativas = {
      iniciarNaAulaDeB: vid.acaoIniciarEnvioVideo({ aulaId: B.aula.id, nome: "x.mp4", mime: "video/mp4", tamanho: 10, substituir: true }),
      partes: vid.acaoAssinarPartesVideo({ videoId: vB.id, partes: [1] }),
      concluir: vid.acaoConcluirEnvioVideo({ videoId: vB.id, partes: [{ numero: 1, etag: '"x"' }] }),
      cancelar: vid.acaoCancelarEnvioVideo({ videoId: vB.id }),
      reprocessar: vid.acaoReprocessarVideo({ videoId: vB.id }),
      reproduzir: vid.acaoIniciarReproducao({ aulaId: B.aula.id }),
      renovar: vid.acaoRenovarReproducao({ aulaId: B.aula.id, videoId: vB.id, sessaoId: repB.sessaoId }),
    };
    for (const [nome, promessa] of Object.entries(tentativas)) expect((await promessa).ok, `${nome} deveria ser recusada`).toBe(false);
    expect(await db.select().from(s.produtos_modulos_aulas_videos).where(eq(s.produtos_modulos_aulas_videos.criador_id, B.c.id))).toEqual(antes);

    // Token VÁLIDO de B apresentado no host de A (com cookie de A): o vídeo não existe aqui.
    expect((await entrega.servirHls(hA, tkB, vB.id, ["master.m3u8"])).status).toBe(404);
    expect((await entrega.servirHls(hA, tkB, vB.id, ["720p", "seg_00000.ts"])).status).toBe(404);
    expect((await entrega.servirChave(hA, tkB, vB.id)).status).toBe(404);
    expect((await entrega.situacaoParaEquipe(hA, vB.id)).status).toBe(404);
    // No host de B, com o cookie de B, tudo segue funcionando.
    expect((await entrega.servirChave(hB, tkB, vB.id)).status).toBe(200);
    expect((await entrega.situacaoParaEquipe(hB, vB.id)).status).toBe(200);
  });

  it("ALUNO não assiste nesta fase (nem com token forjado) e não vê a situação", async () => {
    const { c, dono, aula } = await cenario("Aluno");
    const v = await videoPronto(c.id, aula.id, dono.id);
    const aluno = await novoUsuario();
    await vincular(c.id, aluno.id, "ALUNO");
    req.h = await cabecalhosLogados(aluno.email, c.slug);
    expect(await vid.acaoIniciarReproducao({ aulaId: aula.id })).toMatchObject({ ok: false });
    const forjado = token.assinarToken({ videoId: v.id, criadorId: c.id, usuarioId: aluno.id, sessaoId: randomUUID(), exp: Math.floor(Date.now() / 1000) + 60 });
    expect((await entrega.servirChave(req.h, forjado, v.id)).status).toBe(403);
    expect((await entrega.servirHls(req.h, forjado, v.id, ["master.m3u8"])).status).toBe(403);
    expect((await entrega.situacaoParaEquipe(req.h, v.id)).status).toBe(403);
    expect(await vid.acaoReprocessarVideo({ videoId: v.id })).toMatchObject({ ok: false });
  });
});
