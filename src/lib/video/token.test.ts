// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assinarToken, lerSegredoToken, VALIDADE_TOKEN_SEG, verificarToken } from "./token";

const SEGREDO = "s".repeat(32) + "-segredo-de-teste";
const AGORA = Date.UTC(2026, 9, 14, 12, 0, 0);
const EXP = AGORA / 1000 + VALIDADE_TOKEN_SEG;
const DADOS = { videoId: "v-1", criadorId: "c-1", usuarioId: "u-1", sessaoId: "s-1", exp: EXP };

describe("token de reprodução", () => {
  it("formato compacto para URL: <exp>.<payload>.<mac>", () => {
    const token = assinarToken(DADOS, SEGREDO);
    expect(token).toMatch(/^\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(token.startsWith(`${EXP}.`)).toBe(true);
  });

  it("válido devolve os dados", () => {
    const token = assinarToken(DADOS, SEGREDO);
    expect(verificarToken(token, { videoId: "v-1", criadorId: "c-1", usuarioId: "u-1" }, AGORA, SEGREDO)).toEqual({ ok: true, dados: DADOS });
  });

  it("expirado é recusado (inclusive no segundo exato)", () => {
    const token = assinarToken(DADOS, SEGREDO);
    expect(verificarToken(token, { videoId: "v-1", criadorId: "c-1" }, EXP * 1000, SEGREDO)).toEqual({ ok: false, motivo: "expirado", dados: DADOS });
    expect(verificarToken(token, { videoId: "v-1", criadorId: "c-1" }, EXP * 1000 - 1, SEGREDO).ok).toBe(true);
  });

  it("adulterado (exp, payload ou mac) é recusado", () => {
    const token = assinarToken(DADOS, SEGREDO);
    const [exp, payload, mac] = token.split(".");
    const outroPayload = Buffer.from(JSON.stringify(["v-1", "c-1", "u-2", "s-1"])).toString("base64url");
    const trocaMac = (mac[0] === "A" ? "B" : "A") + mac.slice(1);
    for (const ruim of [`${Number(exp) + 3600}.${payload}.${mac}`, `${exp}.${outroPayload}.${mac}`, `${exp}.${payload}.${trocaMac}`, `${exp}.${payload}.${mac.slice(0, 20)}`]) {
      expect(verificarToken(ruim, { videoId: "v-1", criadorId: "c-1" }, AGORA, SEGREDO)).toEqual({ ok: false, motivo: "assinatura" });
    }
    expect(verificarToken(token, { videoId: "v-1", criadorId: "c-1" }, AGORA, "x".repeat(40))).toEqual({ ok: false, motivo: "assinatura" });
  });

  it("de outro vídeo, de outro criador ou de outro usuário é recusado", () => {
    const token = assinarToken(DADOS, SEGREDO);
    expect(verificarToken(token, { videoId: "v-1", criadorId: "c-2" }, AGORA, SEGREDO)).toEqual({ ok: false, motivo: "outro-criador" });
    // Vencido E de outro usuário: nunca devolve os dados (não vira "expirado").
    expect(verificarToken(token, { videoId: "v-1", criadorId: "c-1", usuarioId: "u-2" }, EXP * 1000, SEGREDO)).toEqual({ ok: false, motivo: "outro-usuario" });
    expect(verificarToken(token, { videoId: "v-2", criadorId: "c-1" }, AGORA, SEGREDO)).toEqual({ ok: false, motivo: "outro-video" });
    expect(verificarToken(token, { videoId: "v-1", criadorId: "c-1", usuarioId: "u-2" }, AGORA, SEGREDO)).toEqual({ ok: false, motivo: "outro-usuario" });
  });

  it("lixo é recusado sem lançar", () => {
    for (const ruim of ["", "abc", "1.2", "x.y.z", "1.2.3.4", `${EXP}.@@@.abc`]) {
      expect(verificarToken(ruim, { videoId: "v-1", criadorId: "c-1" }, AGORA, SEGREDO).ok).toBe(false);
    }
  });

  it("segredo ausente ou curto falha cedo", () => {
    expect(() => lerSegredoToken({})).toThrow("VIDEO_SEGREDO_TOKEN");
    expect(() => lerSegredoToken({ VIDEO_SEGREDO_TOKEN: "curto" })).toThrow("mínimo");
  });
});
