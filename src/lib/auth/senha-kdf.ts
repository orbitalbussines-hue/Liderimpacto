import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * KDF das senhas (auditoria REQ-B1). O padrao do Better Auth e scrypt
 * N=2^14, r=16 (32 MiB) — abaixo do perfil da OWASP. Aqui: **scrypt
 * N=2^17, r=8, p=1 (128 MiB)**, o minimo que a regua aceita sem trocar de
 * biblioteca nativa. Medido: ~450 ms nesta maquina, ~1 s na VPS de 2 vCPU.
 *
 * Formato novo: `s2$<N>$<r>$<p>$<sal hex>$<chave hex>` — os parametros moram no
 * proprio hash, entao subir o custo depois nao invalida senha nenhuma.
 * Formato LEGADO (`<sal hex>:<chave hex>`, do Better Auth) continua abrindo, e
 * o login regrava no formato novo quando a senha e provada (login.ts).
 */

export const PARAMETROS = { N: 2 ** 17, r: 8, p: 1, dkLen: 64 } as const;
/** Os do Better Auth 1.7.5 (@better-auth/utils/dist/password.node.mjs). */
const LEGADO = { N: 2 ** 14, r: 16, p: 1, dkLen: 64 } as const;
const PREFIXO = "s2";

type Parametros = { N: number; r: number; p: number; dkLen: number };

/**
 * FILA do KDF: cada derivacao usa 128 MiB e uma thread do pool do libuv (o
 * mesmo pool do `fs`). Sem limite, um punhado de tentativas simultaneas trava o
 * processo inteiro — a defesa e o teto por IP MAIS esta fila (auditoria REQ-C5).
 */
const MAX_SIMULTANEO = 2;
let emCurso = 0;
const espera: (() => void)[] = [];

async function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
  if (emCurso >= MAX_SIMULTANEO) await new Promise<void>((seguir) => espera.push(seguir));
  emCurso++;
  try {
    return await tarefa();
  } finally {
    emCurso--;
    espera.shift()?.();
  }
}

function derivar(senha: string, sal: string, cfg: Parametros): Promise<Buffer> {
  return naFila(() => derivarAgora(senha, sal, cfg));
}

function derivarAgora(senha: string, sal: string, cfg: Parametros): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    // `normalize("NFKC")`: a MESMA normalizacao da biblioteca, senao acento
    // digitado de dois jeitos viraria senha diferente.
    scrypt(senha.normalize("NFKC"), sal, cfg.dkLen, { ...cfg, maxmem: 256 * cfg.N * cfg.r }, (erro, chave) => {
      if (erro) rejeitar(erro);
      else resolver(chave);
    });
  });
}

export async function hashDeSenha(senha: string): Promise<string> {
  const sal = randomBytes(16).toString("hex");
  const chave = await derivar(senha, sal, PARAMETROS);
  return `${PREFIXO}$${PARAMETROS.N}$${PARAMETROS.r}$${PARAMETROS.p}$${sal}$${chave.toString("hex")}`;
}

/** `true` se a senha confere. Aceita o formato novo e o legado; nunca lanca. */
export async function conferirSenha(hash: string, senha: string): Promise<boolean> {
  try {
    const [sal, esperado, cfg] = separar(hash);
    const chave = await derivar(senha, sal, cfg);
    const alvo = Buffer.from(esperado, "hex");
    // Comparacao em tempo constante: o tempo nao conta quantos bytes bateram.
    return alvo.length === chave.length && timingSafeEqual(alvo, chave);
  } catch {
    return false;
  }
}

/** Hash ja esta no formato/custo atuais? (senao o login regrava) */
export const ehHashAtual = (hash: string) =>
  hash.startsWith(`${PREFIXO}$${PARAMETROS.N}$${PARAMETROS.r}$${PARAMETROS.p}$`);

function separar(hash: string): [sal: string, chave: string, cfg: Parametros] {
  if (hash.startsWith(`${PREFIXO}$`)) {
    const [, n, r, p, sal, chave] = hash.split("$");
    if (!sal || !chave) throw new Error("hash inválido");
    return [sal, chave, { N: Number(n), r: Number(r), p: Number(p), dkLen: PARAMETROS.dkLen }];
  }
  const [sal, chave] = hash.split(":");
  if (!sal || !chave) throw new Error("hash inválido");
  return [sal, chave, LEGADO];
}
