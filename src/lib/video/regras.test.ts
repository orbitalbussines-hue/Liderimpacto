// @vitest-environment node
import { describe, expect, it } from "vitest";
import { podeAssistir } from "./acesso";
import { faixaDaParte, lerCaminhoHls, mimeDoVideo, TAMANHO_PARTE_VIDEO, totalDePartes, validarEnvioVideo } from "./regras";
import { JANELA_SESSAO_MS, limiteDeSessoes, sessaoViva, sessoesAEncerrar } from "./sessoes";

const GB = 1024 ** 3;

describe("allowlist do envio de vídeo", () => {
  it("aceita MP4/MOV/MKV/WebM até 10 GB, com MIME e extensão batendo", () => {
    expect(validarEnvioVideo({ nome: "Aula 1.mp4", mime: "video/mp4", tamanho: 10 * GB })).toEqual({ mime: "video/mp4", extensao: "mp4" });
    expect(validarEnvioVideo({ nome: "gravacao.MOV", mime: "video/quicktime", tamanho: 1 }).extensao).toBe("mov");
    expect(mimeDoVideo("aula.mkv")).toBe("video/x-matroska");
  });

  it("recusa outro tipo, MIME trocado, vazio ou acima de 10 GB", () => {
    expect(() => validarEnvioVideo({ nome: "a.avi", mime: "video/x-msvideo", tamanho: 1 })).toThrow("não aceito");
    expect(() => validarEnvioVideo({ nome: "a.mp4", mime: "video/webm", tamanho: 1 })).toThrow("não aceito");
    expect(() => validarEnvioVideo({ nome: "a.exe", mime: "video/mp4", tamanho: 1 })).toThrow("não aceito");
    expect(() => validarEnvioVideo({ nome: "a.mp4", mime: "video/mp4", tamanho: 0 })).toThrow("vazio");
    expect(() => validarEnvioVideo({ nome: "a.mp4", mime: "video/mp4", tamanho: 10 * GB + 1 })).toThrow("grande demais");
  });

  it("partes de 16 MB, a última menor", () => {
    expect(totalDePartes(1)).toBe(1);
    expect(totalDePartes(TAMANHO_PARTE_VIDEO * 2 + 1)).toBe(3);
    expect(faixaDaParte(3, TAMANHO_PARTE_VIDEO * 2 + 1)).toEqual({ inicio: TAMANHO_PARTE_VIDEO * 2, fim: TAMANHO_PARTE_VIDEO * 2 + 1 });
    expect(totalDePartes(10 * GB)).toBe(640);
  });
});

describe("caminho HLS aceito na rota", () => {
  it("só master, playlist de degrau e segmento", () => {
    expect(lerCaminhoHls(["master.m3u8"])).toEqual({ tipo: "playlist", relativo: "master.m3u8" });
    expect(lerCaminhoHls(["720p", "index.m3u8"])).toEqual({ tipo: "playlist", relativo: "720p/index.m3u8" });
    expect(lerCaminhoHls(["480p", "seg_00012.ts"])).toEqual({ tipo: "segmento", relativo: "480p/seg_00012.ts" });
    for (const ruim of [["..", "master.m3u8"], ["thumb.jpg"], ["720p", "..", "x.ts"], ["720p", "seg_1.ts"], ["original.mp4"], []]) {
      expect(lerCaminhoHls(ruim)).toBeNull();
    }
  });
});

describe("podeAssistir (RN-114)", () => {
  const aula = { liberaEm: null };
  it("nesta fase: DONO e ADMIN (SUPER_ADMIN chega como DONO); ALUNO e sem vínculo não", () => {
    expect(podeAssistir({ papel: "DONO" }, aula)).toBe(true);
    expect(podeAssistir({ papel: "ADMIN" }, aula)).toBe(true);
    expect(podeAssistir({ papel: "ALUNO", matriculaAtiva: true }, aula)).toBe(false);
    expect(podeAssistir({ papel: null }, aula)).toBe(false);
  });
});

describe("limite de telas (RN-115)", () => {
  const agora = new Date("2026-10-14T12:00:00Z");
  const ha = (ms: number) => new Date(agora.getTime() - ms);

  it("encerra as mais antigas para a nova caber", () => {
    const vivas = [
      { id: "b", ultimo_sinal_em: ha(1000) },
      { id: "a", ultimo_sinal_em: ha(5000) },
    ];
    expect(sessoesAEncerrar(vivas, 2)).toEqual(["a"]);
    expect(sessoesAEncerrar(vivas, 3)).toEqual([]);
    expect(sessoesAEncerrar(vivas, 1)).toEqual(["a", "b"]);
    expect(sessoesAEncerrar([], 2)).toEqual([]);
  });

  it("viva = não encerrada e com sinal dentro da janela", () => {
    expect(sessaoViva({ encerrada_em: null, ultimo_sinal_em: ha(JANELA_SESSAO_MS - 1) }, agora)).toBe(true);
    expect(sessaoViva({ encerrada_em: null, ultimo_sinal_em: ha(JANELA_SESSAO_MS) }, agora)).toBe(false);
    expect(sessaoViva({ encerrada_em: agora, ultimo_sinal_em: agora }, agora)).toBe(false);
  });

  it("limite configurável por VIDEO_LIMITE_SESSOES (1..10), padrão 2", () => {
    expect(limiteDeSessoes({})).toBe(2);
    expect(limiteDeSessoes({ VIDEO_LIMITE_SESSOES: "3" })).toBe(3);
    expect(limiteDeSessoes({ VIDEO_LIMITE_SESSOES: "0" })).toBe(2);
    expect(limiteDeSessoes({ VIDEO_LIMITE_SESSOES: "abc" })).toBe(2);
  });
});
