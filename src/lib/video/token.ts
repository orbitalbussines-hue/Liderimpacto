/**
 * Token de reprodução: HMAC-SHA256 curto, amarrado a vídeo + criador + usuário + sessão de reprodução,
 * que vai na URL das playlists, segmentos e da chave (`?t=<exp>.<payload>.<mac>`).
 *
 * É segredo de máquina na query string, por isso: assinado (nunca o segredo em si), com
 * expiração curta e comparado em tempo constante (docs/seguranca-login.md).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** 10 min; o player renova a cada ~4 min sem interromper a reprodução. */
export const VALIDADE_TOKEN_SEG = 600;
const MIN_SEGREDO = 32;

export type DadosToken = {
  videoId: string;
  /** Criador dono do vídeo: token de A apresentado no host de B é recusado sem ir ao banco. */
  criadorId: string;
  usuarioId: string;
  sessaoId: string;
  /** Expiração em segundos desde a época (Unix). */
  exp: number;
};

export type Verificacao =
  | { ok: true; dados: DadosToken }
  | { ok: false; motivo: "expirado"; dados: DadosToken }
  | { ok: false; motivo: "formato" | "assinatura" | "outro-video" | "outro-criador" | "outro-usuario" };

export function lerSegredoToken(env: Record<string, string | undefined> = process.env): string {
  const segredo = env.VIDEO_SEGREDO_TOKEN ?? "";
  if (segredo.length < MIN_SEGREDO) throw new Error(`VIDEO_SEGREDO_TOKEN ausente ou curto (mínimo ${MIN_SEGREDO} caracteres).`);
  return segredo;
}

function mac(segredo: string, mensagem: string): Buffer {
  return createHmac("sha256", segredo).update(mensagem).digest();
}

export function expiracaoPadrao(agoraMs: number = Date.now()): number {
  return Math.floor(agoraMs / 1000) + VALIDADE_TOKEN_SEG;
}

export function assinarToken(dados: DadosToken, segredo: string = lerSegredoToken()): string {
  const payload = Buffer.from(JSON.stringify([dados.videoId, dados.criadorId, dados.usuarioId, dados.sessaoId]), "utf8").toString("base64url");
  const mensagem = `${dados.exp}.${payload}`;
  return `${mensagem}.${mac(segredo, mensagem).toString("base64url")}`;
}

/**
 * Confere assinatura, validade e a quem o token pertence. `esperado.videoId` vem da ROTA
 * (o caminho pedido) e `criadorId` do HOST, nunca do próprio token; `usuarioId` vem da sessão.
 * `expirado` só sai com assinatura VÁLIDA e do vídeo/criador/usuário certos, e traz os dados:
 * quem chama pode aceitar token vencido se conferir a sessão inteira de novo (Safari nativo).
 */
export function verificarToken(
  token: string,
  esperado: { videoId: string; criadorId: string; usuarioId?: string },
  agoraMs: number = Date.now(),
  segredo: string = lerSegredoToken(),
): Verificacao {
  const partes = token.split(".");
  if (partes.length !== 3 || !/^\d{1,12}$/.test(partes[0])) return { ok: false, motivo: "formato" };
  const [expTexto, payload, macTexto] = partes;

  const recebido = Buffer.from(macTexto, "base64url");
  const calculado = mac(segredo, `${expTexto}.${payload}`);
  if (recebido.length !== calculado.length || !timingSafeEqual(recebido, calculado)) {
    return { ok: false, motivo: "assinatura" };
  }

  let ids: unknown;
  try {
    ids = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, motivo: "formato" };
  }
  if (!Array.isArray(ids) || ids.length !== 4 || !ids.every((x) => typeof x === "string")) {
    return { ok: false, motivo: "formato" };
  }
  const [videoId, criadorId, usuarioId, sessaoId] = ids as [string, string, string, string];
  if (videoId !== esperado.videoId) return { ok: false, motivo: "outro-video" };
  if (criadorId !== esperado.criadorId) return { ok: false, motivo: "outro-criador" };
  if (esperado.usuarioId !== undefined && usuarioId !== esperado.usuarioId) return { ok: false, motivo: "outro-usuario" };
  const dados = { videoId, criadorId, usuarioId, sessaoId, exp: Number(expTexto) };
  if (dados.exp * 1000 <= agoraMs) return { ok: false, motivo: "expirado", dados };
  return { ok: true, dados };
}
