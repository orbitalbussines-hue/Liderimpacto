/**
 * Chave AES-128 do HLS: 16 bytes aleatórios POR VÍDEO, guardada no banco CIFRADA com
 * AES-256-GCM e a chave mestra do ambiente (`VIDEO_CHAVE_MESTRA`, 32 bytes em base64).
 *
 * Formato guardado: `v1:<base64url(iv[12] | tag[16] | cifra[16])>`. O prefixo é a versão
 * da chave mestra: rotacionar = nova mestra com `v2:` e ler `v1:` pela mestra anterior.
 * O `videoId` entra como AAD: a chave cifrada de um vídeo não decifra se copiada para outro.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSAO = "v1";
const BYTES_CHAVE_VIDEO = 16;
const BYTES_MESTRA = 32;
const BYTES_IV = 12;
const BYTES_TAG = 16;

/** Lê e valida a chave mestra. Falha cedo: sem ela nenhum vídeo é cifrado nem tocado. */
export function lerChaveMestra(env: Record<string, string | undefined> = process.env): Buffer {
  const texto = env.VIDEO_CHAVE_MESTRA;
  if (!texto) throw new Error("VIDEO_CHAVE_MESTRA ausente (32 bytes em base64).");
  const mestra = Buffer.from(texto, "base64");
  if (mestra.length !== BYTES_MESTRA) {
    throw new Error(`VIDEO_CHAVE_MESTRA precisa ter ${BYTES_MESTRA} bytes em base64 (tem ${mestra.length}).`);
  }
  return mestra;
}

export function gerarChaveVideo(): Buffer {
  return randomBytes(BYTES_CHAVE_VIDEO);
}

function aad(videoId: string): Buffer {
  return Buffer.from(`video-chave:${VERSAO}:${videoId}`, "utf8");
}

export function cifrarChave(chave: Buffer, videoId: string, mestra: Buffer = lerChaveMestra()): string {
  if (chave.length !== BYTES_CHAVE_VIDEO) throw new Error("Chave de vídeo precisa ter 16 bytes.");
  const iv = randomBytes(BYTES_IV);
  const cifrador = createCipheriv("aes-256-gcm", mestra, iv);
  cifrador.setAAD(aad(videoId));
  const cifra = Buffer.concat([cifrador.update(chave), cifrador.final()]);
  return `${VERSAO}:${Buffer.concat([iv, cifrador.getAuthTag(), cifra]).toString("base64url")}`;
}

/** Decifra e AUTENTICA. Lança se o texto foi adulterado, é de outro vídeo ou de outra mestra. */
export function decifrarChave(guardada: string, videoId: string, mestra: Buffer = lerChaveMestra()): Buffer {
  const [versao, corpo] = guardada.split(":");
  if (versao !== VERSAO || !corpo) throw new Error("Formato de chave cifrada desconhecido.");
  const bruto = Buffer.from(corpo, "base64url");
  if (bruto.length !== BYTES_IV + BYTES_TAG + BYTES_CHAVE_VIDEO) throw new Error("Chave cifrada com tamanho inválido.");
  const decifrador = createDecipheriv("aes-256-gcm", mestra, bruto.subarray(0, BYTES_IV));
  decifrador.setAAD(aad(videoId));
  decifrador.setAuthTag(bruto.subarray(BYTES_IV, BYTES_IV + BYTES_TAG));
  return Buffer.concat([decifrador.update(bruto.subarray(BYTES_IV + BYTES_TAG)), decifrador.final()]);
}
