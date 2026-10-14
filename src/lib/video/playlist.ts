/**
 * Reescrita PURA de playlist HLS na hora de servir ao aluno:
 * - toda URI (variante, segmento, EXT-X-MAP, EXT-X-MEDIA...) ganha `t=<token>`;
 * - a URI do `#EXT-X-KEY`/`#EXT-X-SESSION-KEY` vira a rota da API da chave (com o token).
 * O arquivo guardado no storage nunca tem token: ele é colocado por requisição.
 */

export type AssinadorPlaylist = {
  /** Token já assinado (`assinarToken`), sem o `t=`. */
  token: string;
  /** Rota da API que entrega a chave, ex.: `/api/video/<id>/chave`. */
  uriChave: string;
};

const RE_URI_ATRIBUTO = /URI="([^"]*)"/;

export function comToken(uri: string, token: string): string {
  return `${uri}${uri.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}`;
}

export function reescreverPlaylist(m3u8: string, assinador: AssinadorPlaylist): string {
  const { token, uriChave } = assinador;
  return m3u8
    .split(/\r?\n/)
    .map((linha) => {
      const limpa = linha.trim();
      if (limpa === "") return linha;
      if (!limpa.startsWith("#")) return comToken(limpa, token);
      if (!RE_URI_ATRIBUTO.test(limpa)) return linha;
      const ehChave = limpa.startsWith("#EXT-X-KEY:") || limpa.startsWith("#EXT-X-SESSION-KEY:");
      return limpa.replace(RE_URI_ATRIBUTO, (_, uri: string) => `URI="${comToken(ehChave ? uriChave : uri, token)}"`);
    })
    .join("\n");
}
