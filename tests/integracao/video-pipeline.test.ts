/**
 * Pipeline REAL de ponta a ponta (lento, opcional): vídeo de 5 s gerado pelo FFmpeg -> envio
 * multipart real ao SeaweedFS -> fila (Redis) -> worker em PROCESSO SEPARADO -> PRONTO ->
 * playlist reescrita -> chave só para quem pode -> segmento baixado do storage decifra para
 * MPEG-TS. E a falha: arquivo que não é vídeo termina FALHOU com erro legível.
 *
 *   VIDEO_TESTE_REAL=1 npx vitest run --config config/vitest.config.mts --project integracao tests/integracao/video-pipeline.test.ts
 *
 * Precisa de: Postgres de teste, S3 (npm run db:up && npm run armazenamento:preparar), Redis
 * (REDIS_URL) e ffmpeg/ffprobe no PATH.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { gerarVideoTeste } from "../../scripts/video-gerar-teste";
import { cabecalhosLogados, novoCriador, novoUsuario, vincular } from "./_apoio";
import { ok } from "./_catalogo";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

const ligado = !!process.env.VIDEO_TESTE_REAL && !!process.env.REDIS_URL && !!process.env.S3_ENDPOINT;

describe.skipIf(!ligado)("pipeline de vídeo real (FFmpeg + fila + worker)", () => {
  let pasta = "";
  let worker: ChildProcess | null = null;
  let logWorker = "";

  beforeAll(async () => {
    pasta = await mkdtemp(join(tmpdir(), "video-e2e-"));
    // O worker é outro processo (como em produção), com o MESMO ambiente do teste (banco de teste, prefixo da fila de teste).
    worker = spawn(process.execPath, [join("node_modules", "tsx", "dist", "cli.mjs"), "--conditions=react-server", join("scripts", "worker-video.ts")], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    worker.stdout?.on("data", (b: Buffer) => (logWorker += b.toString()));
    worker.stderr?.on("data", (b: Buffer) => (logWorker += b.toString()));
  });

  afterAll(async () => {
    worker?.kill();
    if (pasta) await rm(pasta, { recursive: true, force: true });
  });

  async function esperarSituacao(db: typeof import("@/lib/db").db, s: typeof import("@/lib/db/schema"), videoId: string, prazoMs: number) {
    const limite = Date.now() + prazoMs;
    for (;;) {
      const [v] = await db.select().from(s.produtos_modulos_aulas_videos).where(eq(s.produtos_modulos_aulas_videos.id, videoId));
      if (v.situacao === "PRONTO" || v.situacao === "FALHOU" || Date.now() > limite) return v;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  it("envio real -> worker -> PRONTO -> playlist, chave e segmento que decifra", async () => {
    const vid = await import("@/lib/actions/videos");
    const est = await import("@/lib/actions/produtos-estrutura");
    const prod = await import("@/lib/actions/produtos");
    const entrega = await import("@/lib/video/entrega");
    const seg = await import("@/lib/video/segmento");
    const s = await import("@/lib/db/schema");
    const { db } = await import("@/lib/db");

    const c = await novoCriador("Pipeline");
    const dono = await novoUsuario();
    await vincular(c.id, dono.id, "DONO");
    req.h = await cabecalhosLogados(dono.email, c.slug);
    const p = ok(await prod.acaoCriarProduto({ titulo: "Curso Pipeline", tipo: "CURSO" }));
    const m = ok(await est.acaoCriarModulo({ produtoId: p.id, titulo: "Módulo" }));
    const aula = ok(await est.acaoCriarAula({ moduloId: m.id, titulo: "Aula" }));

    const origem = await gerarVideoTeste({ duracaoSeg: 5, altura: 720, saida: join(pasta, "aula.mp4") });
    const bytes = await readFile(origem);
    const e = ok(await vid.acaoIniciarEnvioVideo({ aulaId: aula.id, nome: "aula.mp4", mime: "video/mp4", tamanho: bytes.byteLength, substituir: false }));
    const urls = ok(await vid.acaoAssinarPartesVideo({ videoId: e.videoId, partes: Array.from({ length: e.totalPartes }, (_, i) => i + 1) }));
    const partes = [];
    for (const u of urls) {
      const corpo = bytes.subarray((u.numero - 1) * e.tamanhoParte, u.numero * e.tamanhoParte);
      const put = await fetch(u.url, { method: "PUT", body: corpo });
      expect(put.status).toBe(200);
      partes.push({ numero: u.numero, etag: put.headers.get("etag") });
    }
    expect(ok(await vid.acaoConcluirEnvioVideo({ videoId: e.videoId, partes }))).toEqual({ enfileirado: true });

    const v = await esperarSituacao(db, s, e.videoId, 120_000);
    expect(v.situacao, `worker:\n${logWorker}`).toBe("PRONTO");
    expect(v).toMatchObject({ duracao_seg: 5, resolucoes: ["720p", "480p"], erro: null, tentativas: 1 });
    const [a] = await db.select().from(s.produtos_modulos_aulas).where(eq(s.produtos_modulos_aulas.id, aula.id));
    expect(a.duracao_seg).toBe(5);
    const [proc] = await db.select().from(s.produtos_modulos_aulas_videos_processamentos).where(eq(s.produtos_modulos_aulas_videos_processamentos.video_id, e.videoId));
    expect(proc).toMatchObject({ situacao: "PRONTO", tentativa: 1 });
    expect(proc.terminado_em).not.toBeNull();

    // Reprodução pela entrega protegida.
    const r = ok(await vid.acaoIniciarReproducao({ aulaId: aula.id }));
    const tk = new URL(r.urlMaster, "http://x").searchParams.get("t")!;
    const master = await (await entrega.servirHls(req.h, tk, e.videoId, ["master.m3u8"])).text();
    expect(master).toMatch(/720p\/index\.m3u8\?t=/);
    expect(master).toMatch(/480p\/index\.m3u8\?t=/);
    const variante = await (await entrega.servirHls(req.h, tk, e.videoId, ["720p", "index.m3u8"])).text();
    expect(variante).toContain(`URI="/api/video/${e.videoId}/chave?t=`);
    const chave = Buffer.from(await (await entrega.servirChave(req.h, tk, e.videoId)).arrayBuffer());
    expect(chave).toHaveLength(16);
    const redirecionado = await entrega.servirHls(req.h, tk, e.videoId, ["720p", "seg_00000.ts"]);
    expect(redirecionado.status).toBe(302);
    const cifrado = Buffer.from(await (await fetch(redirecionado.headers.get("location")!)).arrayBuffer());
    expect(seg.pareceMpegTs(cifrado)).toBe(false);
    expect(seg.pareceMpegTs(seg.decifrarSegmento(cifrado, chave, seg.ivDaPlaylist(variante)))).toBe(true);

    // ALUNO do mesmo criador sem matrícula (e com o token de outra pessoa): sem chave.
    const aluno = await novoUsuario();
    await vincular(c.id, aluno.id, "ALUNO");
    const hAluno = await cabecalhosLogados(aluno.email, c.slug);
    expect((await entrega.servirChave(hAluno, tk, e.videoId)).status).toBe(403);
  }, 180_000);

  it("arquivo que não é vídeo: última tentativa vira FALHOU com erro legível", async () => {
    const { processarJob } = await import("@/lib/video/worker");
    const { provedorVideo } = await import("@/lib/video/provedor-proprio");
    const cliente = await import("@/lib/armazenamento/cliente");
    const s = await import("@/lib/db/schema");
    const { db } = await import("@/lib/db");
    const est = await import("@/lib/actions/produtos-estrutura");
    const prod = await import("@/lib/actions/produtos");

    const c = await novoCriador("Falha");
    const dono = await novoUsuario();
    await vincular(c.id, dono.id, "DONO");
    req.h = await cabecalhosLogados(dono.email, c.slug);
    const p = ok(await prod.acaoCriarProduto({ titulo: "Curso Falha", tipo: "CURSO" }));
    const m = ok(await est.acaoCriarModulo({ produtoId: p.id, titulo: "Módulo" }));
    const aula = ok(await est.acaoCriarAula({ moduloId: m.id, titulo: "Aula" }));
    const lixo = Buffer.from("isto nao e um video ".repeat(100));
    const e = await provedorVideo.criarEnvio({ criadorId: c.id, usuarioId: dono.id }, { aulaId: aula.id, nome: "lixo.mp4", mime: "video/mp4", tamanho: lixo.byteLength, substituir: false });
    const [u] = await provedorVideo.assinarPartes({ criadorId: c.id, usuarioId: dono.id }, e.videoId, [1]);
    const put = await fetch(u.url, { method: "PUT", body: lixo });
    // Sem passar pela fila: o job roda aqui mesmo, como última tentativa.
    await db.update(s.produtos_modulos_aulas_videos).set({ situacao: "PROCESSANDO" }).where(eq(s.produtos_modulos_aulas_videos.id, e.videoId));
    const [v0] = await db.select().from(s.produtos_modulos_aulas_videos).where(eq(s.produtos_modulos_aulas_videos.id, e.videoId));
    await cliente.concluirEnvioMultipart({ bucket: "videosOriginais", criadorId: c.id, chave: v0.chave_origem, uploadId: v0.upload_id!, partes: [{ numero: 1, etag: put.headers.get("etag")! }] });

    await expect(processarJob(e.videoId, 3, 3)).rejects.toThrow();
    const [v] = await db.select().from(s.produtos_modulos_aulas_videos).where(eq(s.produtos_modulos_aulas_videos.id, e.videoId));
    expect(v.situacao).toBe("FALHOU");
    expect(v.erro).toMatch(/não parece ser um vídeo|Arquivo sem faixa/);
    const [proc] = await db.select().from(s.produtos_modulos_aulas_videos_processamentos).where(eq(s.produtos_modulos_aulas_videos_processamentos.video_id, e.videoId));
    expect(proc).toMatchObject({ situacao: "FALHOU", tentativa: 3 });
    // Job repetido depois de FALHOU: ignorado (idempotente).
    expect(await processarJob(e.videoId, 1, 3)).toBe("ignorado");
  }, 60_000);
});
