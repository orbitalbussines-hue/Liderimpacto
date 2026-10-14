/**
 * Vídeos de DEMONSTRAÇÃO para o player — SÓ DESENVOLVIMENTO. Roda depois do `npm run seed:demo`.
 *
 *   npx tsx --conditions=react-server scripts/seed-demo-video.ts <pasta-com-os-mp4>
 *
 * Recusa NODE_ENV=production e DATABASE_URL/S3_ENDPOINT fora do localhost. Envia os arquivos
 * para algumas aulas do criador `demo` pelo MESMO caminho do envio real (provedor: multipart
 * pré-assinado → PUT das partes → concluir → fila), sobe o worker (`scripts/worker-video.ts`) em
 * outro processo até todos ficarem PRONTO (ou FALHOU) e o derruba no fim. Idempotente: aula com
 * vídeo PRONTO ou PROCESSANDO não é reenviada; ENVIANDO/FALHOU é substituído.
 */
import { spawn } from "node:child_process";
import { openSync, readSync, closeSync, statSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { criadores, criadores_membros, produtos_modulos_aulas, produtos_modulos_aulas_videos as videos, usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { provedorVideo } from "@/lib/video/provedor-proprio";
import { videoVivoDaAula } from "@/lib/video/registro";

/** Aula (título no seed-demo) → arquivo na pasta. A 3.2 tem capítulos em 3 e 9 min. */
const PLANO = [
  { aula: "O que é cultura organizacional", arquivo: "1min-720p.mp4" },
  { aula: "Cultura organizacional do líder", arquivo: "demo-10min-720p.mp4" },
  { aula: "Cultura forte × cultura tóxica", arquivo: "demo-40s-720p.mp4" },
  { aula: "Qual é o papel do líder na criação da cultura", arquivo: "demo-40s-720p.mp4" },
] as const;

const LOCAIS = ["localhost", "127.0.0.1", "::1", "[::1]"];
const PRAZO_MS = 30 * 60_000;

function exigirDesenvolvimento(): string {
  if (process.env.NODE_ENV === "production") throw new Error("Recusado: NODE_ENV=production.");
  for (const nome of ["DATABASE_URL", "S3_ENDPOINT"]) {
    const valor = process.env[nome];
    if (!valor) throw new Error(`${nome} ausente (rode com o env de dev).`);
    const host = new URL(valor).hostname;
    if (!LOCAIS.includes(host)) throw new Error(`Recusado: ${nome} aponta para "${host}", não para o ambiente local.`);
  }
  const pasta = process.argv[2];
  if (!pasta) throw new Error("Uso: npx tsx --conditions=react-server scripts/seed-demo-video.ts <pasta-com-os-mp4>");
  return pasta;
}

async function contexto() {
  const [c] = await db.select({ id: criadores.id }).from(criadores).where(and(eq(criadores.slug, "demo"), vivos(criadores)));
  if (!c) throw new Error("Criador `demo` não existe: rode `npm run seed:demo` antes.");
  const [dono] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .innerJoin(criadores_membros, and(eq(criadores_membros.usuario_id, usuarios.id), eq(criadores_membros.criador_id, c.id), vivos(criadores_membros)))
    .where(and(eq(usuarios.email, "dono@demo.local"), eq(criadores_membros.papel, "DONO"), vivos(usuarios)));
  if (!dono) throw new Error("DONO do demo não encontrado.");
  return { criadorId: c.id, usuarioId: dono.id };
}

/** Lê a parte `n` (1..) do arquivo sem carregar o vídeo inteiro na memória. */
function lerParte(caminho: string, n: number, tamanhoParte: number, total: number): Buffer {
  const inicio = (n - 1) * tamanhoParte;
  const buf = Buffer.alloc(Math.min(tamanhoParte, total - inicio));
  const fd = openSync(caminho, "r");
  try {
    readSync(fd, buf, 0, buf.length, inicio);
  } finally {
    closeSync(fd);
  }
  return buf;
}

async function enviar(ctx: { criadorId: string; usuarioId: string }, aulaId: string, caminho: string, substituir: boolean): Promise<string> {
  const tamanho = statSync(caminho).size;
  const envio = await provedorVideo.criarEnvio(ctx, { aulaId, nome: caminho.split(/[\\/]/).pop()!, mime: "video/mp4", tamanho, substituir });
  const numeros = Array.from({ length: envio.totalPartes }, (_, i) => i + 1);
  const partes: { numero: number; etag: string }[] = [];
  for (let i = 0; i < numeros.length; i += 50) {
    for (const { numero, url } of await provedorVideo.assinarPartes(ctx, envio.videoId, numeros.slice(i, i + 50))) {
      const r = await fetch(url, { method: "PUT", body: new Uint8Array(lerParte(caminho, numero, envio.tamanhoParte, tamanho)) });
      const etag = r.headers.get("etag");
      if (!r.ok || !etag) throw new Error(`PUT da parte ${numero} falhou (${r.status}).`);
      partes.push({ numero, etag });
    }
  }
  const { enfileirado } = await provedorVideo.concluirEnvio(ctx, envio.videoId, { partes });
  if (!enfileirado) throw new Error("Fila fora do ar (REDIS_URL).");
  return envio.videoId;
}

/** Sobe o worker em outro processo e espera os vídeos saírem de PROCESSANDO. */
async function processar(ids: string[]): Promise<void> {
  const worker = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/worker-video.ts"], { stdio: ["ignore", "inherit", "inherit"], env: process.env });
  const inicio = Date.now();
  try {
    for (;;) {
      const linhas = await db.select({ id: videos.id, situacao: videos.situacao, erro: videos.erro }).from(videos).where(inArray(videos.id, ids));
      const pendentes = linhas.filter((l) => l.situacao === "PROCESSANDO");
      console.log(`[seed-demo-video] ${linhas.length - pendentes.length}/${ids.length} prontos (${Math.round((Date.now() - inicio) / 1000)} s)`);
      if (pendentes.length === 0) {
        for (const l of linhas.filter((x) => x.situacao !== "PRONTO")) console.error(`[seed-demo-video] ${l.id} ${l.situacao}: ${l.erro ?? ""}`);
        return;
      }
      if (Date.now() - inicio > PRAZO_MS) throw new Error("Prazo de processamento estourado.");
      if (worker.exitCode !== null) throw new Error(`Worker saiu com código ${worker.exitCode}.`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  } finally {
    worker.kill();
  }
}

async function main() {
  const pasta = exigirDesenvolvimento();
  const ctx = await contexto();
  const aulas = await db
    .select({ id: produtos_modulos_aulas.id, titulo: produtos_modulos_aulas.titulo })
    .from(produtos_modulos_aulas)
    .where(and(eq(produtos_modulos_aulas.criador_id, ctx.criadorId), vivos(produtos_modulos_aulas)));
  const aEsperar: string[] = [];
  for (const item of PLANO) {
    const aula = aulas.find((a) => a.titulo === item.aula);
    if (!aula) throw new Error(`Aula "${item.aula}" não existe no demo.`);
    const atual = await videoVivoDaAula(ctx.criadorId, aula.id);
    if (atual?.situacao === "PRONTO") {
      console.log(`[seed-demo-video] ${item.aula}: já PRONTO`);
      continue;
    }
    if (atual?.situacao === "PROCESSANDO") {
      aEsperar.push(atual.id);
      continue;
    }
    const id = await enviar(ctx, aula.id, join(pasta, item.arquivo), !!atual);
    console.log(`[seed-demo-video] ${item.aula}: enviado ${item.arquivo} -> ${id}`);
    aEsperar.push(id);
  }
  if (aEsperar.length) await processar(aEsperar);
  console.log("[seed-demo-video] pronto.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? `${e.message}${e.cause ? ` (${String(e.cause)})` : ""}` : e);
    process.exit(1);
  });
