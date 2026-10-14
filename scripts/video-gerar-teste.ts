/**
 * Gera vídeos SINTÉTICOS de teste com o próprio FFmpeg (testsrc2 + seno + relógio queimado).
 * Saída SEMPRE fora do repositório (vídeo e binário não entram no git).
 *
 *   npx tsx scripts/video-gerar-teste.ts <pasta-de-saida>
 *
 * Gera: 1min-1080p.mp4, 1min-720p.mp4, 10min-1080p.mp4 (pula o que já existe).
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { executar } from "../src/lib/video/processar";

export type VideoTeste = { duracaoSeg: number; altura: number; saida: string; comAudio?: boolean };

function filtroRelogio(): string {
  // drawtext precisa de fonte; sem uma conhecida, o vídeo sai sem relógio (o teste segue valendo).
  const fontes = ["C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"];
  const fonte = fontes.find((f) => existsSync(f));
  if (!fonte) return "null";
  return `drawtext=fontfile='${fonte.replace(":", "\\:")}':text='%{pts\\:hms}':fontsize=h/12:fontcolor=white:box=1:boxcolor=black@0.6:x=40:y=40`;
}

export function argumentosVideoTeste(v: VideoTeste): string[] {
  const largura = Math.round((v.altura * 16) / 9 / 2) * 2;
  const args = ["-hide_banner", "-v", "error", "-nostdin", "-y",
    "-f", "lavfi", "-i", `testsrc2=size=${largura}x${v.altura}:rate=30:duration=${v.duracaoSeg}`];
  if (v.comAudio !== false) args.push("-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=${v.duracaoSeg}`);
  args.push("-vf", filtroRelogio(), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p");
  if (v.comAudio !== false) args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
  args.push(v.saida);
  return args;
}

export async function gerarVideoTeste(v: VideoTeste): Promise<string> {
  await executar("ffmpeg", argumentosVideoTeste(v), 60 * 60_000);
  return v.saida;
}

async function principal() {
  const pasta = process.argv[2];
  if (!pasta) throw new Error("Uso: npx tsx scripts/video-gerar-teste.ts <pasta-de-saida-fora-do-repo>");
  await mkdir(pasta, { recursive: true });
  const lista: VideoTeste[] = [
    { duracaoSeg: 60, altura: 1080, saida: join(pasta, "1min-1080p.mp4") },
    { duracaoSeg: 60, altura: 720, saida: join(pasta, "1min-720p.mp4") },
    { duracaoSeg: 600, altura: 1080, saida: join(pasta, "10min-1080p.mp4") },
  ];
  for (const v of lista) {
    if (existsSync(v.saida)) {
      console.log(`já existe: ${v.saida}`);
      continue;
    }
    const inicio = Date.now();
    await gerarVideoTeste(v);
    console.log(`gerado: ${v.saida} (${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  principal().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
