// @vitest-environment node
import { describe, expect, it } from "vitest";
import { reescreverPlaylist } from "./playlist";

// Playlists REAIS do FFmpeg 9 (`montarArgumentosHls`, vídeo de 1 min 720p), encurtadas.
const MASTER = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=3046602,AVERAGE-BANDWIDTH=2998374,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
720p/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=1639109,AVERAGE-BANDWIDTH=1597774,RESOLUTION=854x480,CODECS="avc1.64001f,mp4a.40.2"
480p/index.m3u8
`;

const VARIANTE = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-KEY:METHOD=AES-128,URI="chave",IV=0x00000000000000000000000000000000
#EXTINF:6.000000,
seg_00000.ts
#EXTINF:6.000000,
seg_00001.ts
#EXT-X-ENDLIST
`;

const ASSINADOR = { token: "1760443200.WyJ2Il0.abc_-", uriChave: "/api/video/v-1/chave" };

describe("reescreverPlaylist", () => {
  it("master: token em cada variante, tags intactas", () => {
    const saida = reescreverPlaylist(MASTER, ASSINADOR);
    expect(saida).toContain("\n720p/index.m3u8?t=1760443200.WyJ2Il0.abc_-\n");
    expect(saida).toContain("\n480p/index.m3u8?t=1760443200.WyJ2Il0.abc_-\n");
    expect(saida).toContain('CODECS="avc1.64001f,mp4a.40.2"');
    expect(saida.split("\n")).toHaveLength(MASTER.split("\n").length);
  });

  it("variante: token em cada segmento e chave trocada pela rota da API", () => {
    const saida = reescreverPlaylist(VARIANTE, ASSINADOR);
    expect(saida).toContain('#EXT-X-KEY:METHOD=AES-128,URI="/api/video/v-1/chave?t=1760443200.WyJ2Il0.abc_-",IV=0x00000000000000000000000000000000');
    expect(saida).not.toContain('URI="chave"');
    expect(saida.match(/seg_\d{5}\.ts\?t=1760443200\.WyJ2Il0\.abc_-/g)).toHaveLength(2);
    expect(saida).toContain("#EXTINF:6.000000,\n");
    expect(saida).toContain("#EXT-X-ENDLIST");
  });

  it("URI que já tem query ganha &t=; EXT-X-MAP e EXT-X-MEDIA também levam token; CRLF aceito", () => {
    const entrada = '#EXTM3U\r\n#EXT-X-MAP:URI="init.mp4"\r\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio/index.m3u8"\r\nseg.ts?v=2\r\n';
    const saida = reescreverPlaylist(entrada, ASSINADOR);
    expect(saida).toContain('#EXT-X-MAP:URI="init.mp4?t=');
    expect(saida).toContain('URI="audio/index.m3u8?t=');
    expect(saida).toContain("seg.ts?v=2&t=");
  });

  it("token é codificado para a URL", () => {
    expect(reescreverPlaylist("a.ts\n", { token: "a b&c", uriChave: "/k" })).toBe("a.ts?t=a%20b%26c\n");
  });
});
