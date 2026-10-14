import "server-only";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
import { chavePertenceAoCriador } from "./regras";

/**
 * Cliente S3 UNICO do app (SeaweedFS em dev, R2 em producao: muda so o env). O servidor Next
 * nunca recebe o binario: ele so assina URLs curtas e confere o objeto (HEAD) depois.
 * TODA funcao recebe o `criadorId` do HOST e recusa chave que nao seja `criadores/<criadorId>/`.
 * Credenciais ficam so aqui (server-only); a tela recebe apenas URLs assinadas.
 */

export type Bucket = "arquivos" | "videosOriginais" | "hls";

const VARIAVEIS_BUCKET: Record<Bucket, string> = {
  arquivos: "S3_BUCKET_ARQUIVOS",
  videosOriginais: "S3_BUCKET_VIDEOS_ORIGINAIS",
  hls: "S3_BUCKET_HLS",
};
const OBRIGATORIAS = ["S3_ENDPOINT", "S3_REGIAO", "S3_CHAVE", "S3_SEGREDO", ...Object.values(VARIAVEIS_BUCKET)];

function variavel(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} ausente (variáveis do armazenamento em docs/back.md).`);
  return v;
}

/** Todas as S3_* presentes? (O teste de ida e volta pula com aviso se nao.) */
export const armazenamentoConfigurado = () => OBRIGATORIAS.every((n) => !!process.env[n]);

export const nomeDoBucket = (b: Bucket) => variavel(VARIAVEIS_BUCKET[b]);

let cliente: S3Client | null = null;

export function clienteS3(): S3Client {
  cliente ??= new S3Client({
    endpoint: variavel("S3_ENDPOINT"),
    region: variavel("S3_REGIAO"),
    credentials: { accessKeyId: variavel("S3_CHAVE"), secretAccessKey: variavel("S3_SEGREDO") },
    // SeaweedFS e R2 aceitam caminho (endpoint/bucket/chave); sem DNS curinga em dev.
    forcePathStyle: process.env.S3_FORCAR_CAMINHO !== "false",
    // Sem checksum automatico (CRC32) na URL assinada: o navegador nao o calcula e R2/SeaweedFS
    // recusariam o PUT. Integridade conferida pelo HEAD (tamanho e tipo) na confirmacao.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return cliente;
}

/** Alvo de toda operacao: bucket + chave, conferida contra o criador do host. */
export interface Alvo {
  bucket: Bucket;
  criadorId: string;
  chave: string;
}

function conferir(a: Alvo): { Bucket: string; Key: string } {
  if (!chavePertenceAoCriador(a.chave, a.criadorId)) throw new Error("chave de objeto fora da área do criador");
  return { Bucket: nomeDoBucket(a.bucket), Key: a.chave };
}

export interface UrlDeEnvio {
  url: string;
  metodo: "PUT";
  /** Cabecalhos que o navegador TEM de mandar iguais (entram na assinatura). */
  cabecalhos: Record<string, string>;
  expiraEm: string;
}

/**
 * URL pre-assinada de PUT para UM objeto (ate 5 GB; maior que isso, multipart). `Content-Type` e
 * `Content-Length` entram na assinatura: o navegador so consegue subir exatamente o que o
 * servidor validou na allowlist.
 */
export async function urlDeEnvio(a: Alvo & { mime: string; tamanho: number; validadeSeg?: number }): Promise<UrlDeEnvio> {
  const validade = a.validadeSeg ?? 600;
  const comando = new PutObjectCommand({ ...conferir(a), ContentType: a.mime, ContentLength: a.tamanho });
  const url = await getSignedUrl(clienteS3(), comando, { expiresIn: validade, signableHeaders: new Set(["content-type", "content-length"]) });
  return { url, metodo: "PUT", cabecalhos: { "Content-Type": a.mime }, expiraEm: new Date(Date.now() + validade * 1000).toISOString() };
}

/** Multipart (arquivos de GB, retomavel): inicia e devolve o `uploadId`. */
export async function iniciarEnvioMultipart(a: Alvo & { mime: string }): Promise<{ uploadId: string }> {
  const r = await clienteS3().send(new CreateMultipartUploadCommand({ ...conferir(a), ContentType: a.mime }));
  if (!r.UploadId) throw new Error("storage nao devolveu UploadId");
  return { uploadId: r.UploadId };
}

/** URLs pre-assinadas de cada parte (1..10000; partes de 5 MB a 5 GB, menos a ultima). */
export async function assinarPartesMultipart(
  a: Alvo & { uploadId: string; partes: readonly number[]; validadeSeg?: number },
): Promise<{ numero: number; url: string }[]> {
  const alvo = conferir(a);
  if (a.partes.some((n) => !Number.isInteger(n) || n < 1 || n > 10_000)) throw new Error("numero de parte fora de 1..10000");
  return Promise.all(
    a.partes.map(async (numero) => ({
      numero,
      url: await getSignedUrl(clienteS3(), new UploadPartCommand({ ...alvo, UploadId: a.uploadId, PartNumber: numero }), {
        expiresIn: a.validadeSeg ?? 3600,
      }),
    })),
  );
}

/** Conclui com as partes enviadas (`etag` vem do cabecalho ETag de cada PUT; CORS expoe ETag). */
export async function concluirEnvioMultipart(a: Alvo & { uploadId: string; partes: readonly { numero: number; etag: string }[] }): Promise<void> {
  await clienteS3().send(
    new CompleteMultipartUploadCommand({
      ...conferir(a),
      UploadId: a.uploadId,
      MultipartUpload: { Parts: [...a.partes].sort((x, y) => x.numero - y.numero).map((p) => ({ PartNumber: p.numero, ETag: p.etag })) },
    }),
  );
}

export async function abortarEnvioMultipart(a: Alvo & { uploadId: string }): Promise<void> {
  await clienteS3().send(new AbortMultipartUploadCommand({ ...conferir(a), UploadId: a.uploadId }));
}

/** URL pre-assinada de leitura CURTA (padrao 5 min). `nomeDownload` forca "baixar como". */
export async function urlDeLeitura(a: Alvo & { validadeSeg?: number; nomeDownload?: string }): Promise<string> {
  const disposicao = a.nomeDownload ? `attachment; filename*=UTF-8''${encodeURIComponent(a.nomeDownload)}` : undefined;
  return getSignedUrl(clienteS3(), new GetObjectCommand({ ...conferir(a), ResponseContentDisposition: disposicao }), {
    expiresIn: a.validadeSeg ?? 300,
  });
}

const JANELA_IMAGEM_SEG = 3600;

/**
 * URL de IMAGEM (capa, thumb) para o `next/image`. Assinada com a data arredondada para a hora:
 * a URL fica IGUAL durante a janela, entao o cache do otimizador (chave = URL) acerta em vez de
 * criar uma entrada nova por requisicao. Vale de 1 a 2 h. Imagem trocada = chave nova = URL nova.
 */
export async function urlDeImagem(criadorId: string, chave: string): Promise<string> {
  const inicio = new Date(Math.floor(Date.now() / (JANELA_IMAGEM_SEG * 1000)) * JANELA_IMAGEM_SEG * 1000);
  return getSignedUrl(clienteS3(), new GetObjectCommand(conferir({ bucket: "arquivos", criadorId, chave })), {
    expiresIn: 2 * JANELA_IMAGEM_SEG,
    signingDate: inicio,
  });
}

/** HEAD: tamanho e tipo reais do objeto. `null` = nao existe (envio nao aconteceu). */
export async function cabecalhoDoObjeto(a: Alvo): Promise<{ tamanho: number; mime: string } | null> {
  try {
    const r = await clienteS3().send(new HeadObjectCommand(conferir(a)));
    return { tamanho: r.ContentLength ?? 0, mime: (r.ContentType ?? "").toLowerCase() };
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (e as { name?: string }).name === "NotFound") return null;
    throw e;
  }
}

/** Apaga SO o objeto no storage (o registro no banco e soft delete, feito por quem chama). */
export async function apagarObjeto(a: Alvo): Promise<void> {
  await clienteS3().send(new DeleteObjectCommand(conferir(a)));
}

/** Leitura em STREAM (worker de video: original de GB direto para o disco, sem memoria). */
export async function lerObjeto(a: Alvo): Promise<Readable> {
  const r = await clienteS3().send(new GetObjectCommand(conferir(a)));
  if (!r.Body) throw new Error("storage devolveu objeto sem corpo");
  return r.Body as Readable;
}

/** Gravacao pelo SERVIDOR (worker de video: playlists, segmentos, thumb). */
export async function gravarObjeto(a: Alvo & { corpo: Buffer | Readable; mime: string; tamanho: number; cacheControl?: string }): Promise<void> {
  await clienteS3().send(
    new PutObjectCommand({ ...conferir(a), Body: a.corpo, ContentType: a.mime, ContentLength: a.tamanho, CacheControl: a.cacheControl }),
  );
}

/**
 * Apaga TODOS os objetos sob um prefixo do criador (pasta HLS de um video trocado). Ate 1.000
 * por chamada ao storage, em lotes. Devolve quantos apagou.
 */
export async function apagarPrefixo(a: Alvo): Promise<number> {
  const { Bucket, Key } = conferir(a);
  const prefixo = Key.endsWith("/") ? Key : `${Key}/`;
  let apagados = 0;
  let continuacao: string | undefined;
  do {
    const lista = await clienteS3().send(new ListObjectsV2Command({ Bucket, Prefix: prefixo, ContinuationToken: continuacao }));
    const chaves = (lista.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k && chavePertenceAoCriador(k, a.criadorId));
    if (chaves.length) {
      await clienteS3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: chaves.map((Key) => ({ Key })), Quiet: true } }));
      apagados += chaves.length;
    }
    continuacao = lista.IsTruncated ? lista.NextContinuationToken : undefined;
  } while (continuacao);
  return apagados;
}

/** Cria o bucket se faltar e aplica o CORS (idempotente). Usado por scripts/armazenamento-preparar.ts. */
export async function prepararBucket(b: Bucket, origens: readonly string[]): Promise<"criado" | "existente"> {
  const Bucket = nomeDoBucket(b);
  let estado: "criado" | "existente" = "existente";
  try {
    await clienteS3().send(new HeadBucketCommand({ Bucket }));
  } catch {
    await clienteS3().send(new CreateBucketCommand({ Bucket }));
    estado = "criado";
  }
  await clienteS3().send(
    new PutBucketCorsCommand({
      Bucket,
      CORSConfiguration: {
        CORSRules: [{ AllowedOrigins: [...origens], AllowedMethods: ["GET", "PUT", "HEAD"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600 }],
      },
    }),
  );
  return estado;
}

/** Para telas: URL da imagem ou `null` (sem chave, ou storage indisponivel: a tela mostra o vazio). */
export async function urlDeImagemOuNula(criadorId: string, chave: string | null): Promise<string | null> {
  if (!chave) return null;
  try {
    return await urlDeImagem(criadorId, chave);
  } catch (e) {
    console.error("[armazenamento] falha ao assinar imagem:", e);
    return null;
  }
}
