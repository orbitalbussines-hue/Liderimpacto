import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { apagarPrefixo, gravarObjeto, lerObjeto } from "@/lib/armazenamento/cliente";
import { chaveDoCriador } from "@/lib/armazenamento/regras";
import { decifrarChave } from "./chaves";
import { ErroProcessamento, processarVideo } from "./processar";
import { pastaDoVideo, provedorVideo } from "./provedor-proprio";
import { videoParaProcessar } from "./registro";

/**
 * Um job do worker (processo separado: `npm run worker:video`). Idempotente: só processa vídeo
 * vivo em PROCESSANDO; reprocessar sobrescreve as mesmas chaves no storage. Tudo em pasta
 * temporária própria, apagada no fim (original de GB em disco, nunca em memória).
 */

const TIPOS: Record<string, { mime: string; cache: string }> = {
  ".m3u8": { mime: "application/vnd.apple.mpegurl", cache: "no-cache" },
  // Segmento cifrado: cache longo. Reprocessar regrava os mesmos nomes (com CDN: purgar a pasta).
  ".ts": { mime: "video/mp2t", cache: "public, max-age=31536000, immutable" },
  ".jpg": { mime: "image/jpeg", cache: "private, max-age=3600" },
};
const ENVIOS_PARALELOS = 8;

/** Mensagem para a TELA (o detalhe técnico vai para o log da tentativa). */
export function erroLegivel(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/^(Arquivo sem faixa de vídeo|Duração do vídeo ilegível|Taxa de quadros ilegível)/.test(msg)) return msg;
  if (e instanceof ErroProcessamento && msg.startsWith("ffprobe")) return "O arquivo não parece ser um vídeo válido.";
  if (e instanceof ErroProcessamento) return "Não foi possível converter o vídeo (arquivo corrompido ou formato não suportado).";
  if (/NoSuchKey|NotFound|ECONNREFUSED|storage/i.test(msg)) return "Falha ao acessar o armazenamento. Tente reprocessar.";
  return "Falha inesperada no processamento. Tente reprocessar.";
}

async function subirPasta(criadorId: string, videoId: string, pasta: string, arquivos: readonly string[]): Promise<void> {
  const fila = [...arquivos];
  const trabalhador = async () => {
    for (let rel = fila.shift(); rel; rel = fila.shift()) {
      const tipo = TIPOS[extname(rel)];
      if (!tipo) continue;
      const caminho = join(pasta, ...rel.split("/"));
      await gravarObjeto({
        bucket: "hls",
        criadorId,
        chave: chaveDoCriador(criadorId, "videos", videoId, ...rel.split("/")),
        corpo: createReadStream(caminho),
        tamanho: (await stat(caminho)).size,
        mime: tipo.mime,
        cacheControl: tipo.cache,
      });
    }
  };
  await Promise.all(Array.from({ length: ENVIOS_PARALELOS }, trabalhador));
}

export async function processarJob(videoId: string, tentativa: number, tentativas: number): Promise<"pronto" | "ignorado"> {
  const v = await videoParaProcessar(videoId);
  if (!v || v.situacao !== "PROCESSANDO") return "ignorado";
  if (!(await provedorVideo.aoReceberEvento({ tipo: "video.processando", videoId, tentativa }))) return "ignorado";

  const pasta = await mkdtemp(join(tmpdir(), "video-job-"));
  try {
    const origem = join(pasta, `original${extname(v.chave_origem)}`);
    await pipeline(await lerObjeto({ bucket: "videosOriginais", criadorId: v.criador_id, chave: v.chave_origem }), createWriteStream(origem));
    const r = await processarVideo({ origem, destinoDir: join(pasta, "hls"), chave: decifrarChave(v.chave_cifrada, v.id) });
    await subirPasta(v.criador_id, v.id, join(pasta, "hls"), r.arquivos);

    const prefixoHls = pastaDoVideo(v.criador_id, v.id);
    const aplicado = await provedorVideo.aoReceberEvento({
      tipo: "video.pronto",
      videoId,
      tentativa,
      duracaoSeg: r.duracaoSeg,
      resolucoes: r.resolucoes,
      prefixoHls,
      thumbChave: `${prefixoHls}/${r.thumb}`,
      cpuSeg: r.cpuSeg,
      log: r.log.slice(-1500),
    });
    // Trocado/excluído durante o processamento: o HLS recém-subido vira órfão — sai agora.
    if (!aplicado) await apagarPrefixo({ bucket: "hls", criadorId: v.criador_id, chave: prefixoHls });
    return aplicado ? "pronto" : "ignorado";
  } catch (e) {
    const log = e instanceof ErroProcessamento ? `${e.message}\n${e.log}` : e instanceof Error ? (e.stack ?? e.message) : String(e);
    await provedorVideo
      .aoReceberEvento({ tipo: "video.falhou", videoId, tentativa, erro: erroLegivel(e), log: log.slice(-3000), definitivo: tentativa >= tentativas })
      .catch((falha: unknown) => console.error("CRITICAL [video] não registrou a falha:", videoId, falha));
    throw e;
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}
