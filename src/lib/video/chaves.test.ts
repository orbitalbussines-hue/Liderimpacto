// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cifrarChave, decifrarChave, gerarChaveVideo, lerChaveMestra } from "./chaves";

const MESTRA = randomBytes(32);
const VIDEO = "6f1c9f8e-2a4b-4c1d-9e3f-0a1b2c3d4e5f";

describe("chave do vídeo", () => {
  it("gera 16 bytes aleatórios por vídeo", () => {
    const a = gerarChaveVideo();
    expect(a).toHaveLength(16);
    expect(a.equals(gerarChaveVideo())).toBe(false);
  });

  it("ida e volta com formato versionado (e IV novo a cada cifra)", () => {
    const chave = gerarChaveVideo();
    const guardada = cifrarChave(chave, VIDEO, MESTRA);
    expect(guardada).toMatch(/^v1:[A-Za-z0-9_-]+$/);
    expect(guardada).not.toBe(cifrarChave(chave, VIDEO, MESTRA));
    expect(decifrarChave(guardada, VIDEO, MESTRA).equals(chave)).toBe(true);
  });

  it("detecta adulteração em qualquer byte", () => {
    const guardada = cifrarChave(gerarChaveVideo(), VIDEO, MESTRA);
    const bruto = Buffer.from(guardada.slice(3), "base64url");
    for (const pos of [0, 15, 30, bruto.length - 1]) {
      const alterado = Buffer.from(bruto);
      alterado[pos] ^= 0x01;
      expect(() => decifrarChave(`v1:${alterado.toString("base64url")}`, VIDEO, MESTRA)).toThrow();
    }
  });

  it("não decifra se copiada para outro vídeo nem com outra mestra", () => {
    const guardada = cifrarChave(gerarChaveVideo(), VIDEO, MESTRA);
    expect(() => decifrarChave(guardada, "00000000-0000-4000-8000-000000000000", MESTRA)).toThrow();
    expect(() => decifrarChave(guardada, VIDEO, randomBytes(32))).toThrow();
  });

  it("recusa versão desconhecida e tamanho errado", () => {
    const guardada = cifrarChave(gerarChaveVideo(), VIDEO, MESTRA);
    expect(() => decifrarChave(guardada.replace("v1:", "v9:"), VIDEO, MESTRA)).toThrow("Formato");
    expect(() => decifrarChave("v1:AAAA", VIDEO, MESTRA)).toThrow("tamanho");
    expect(() => cifrarChave(randomBytes(32), VIDEO, MESTRA)).toThrow("16 bytes");
  });
});

describe("lerChaveMestra", () => {
  it("falha cedo se ausente ou curta", () => {
    expect(() => lerChaveMestra({})).toThrow("ausente");
    expect(() => lerChaveMestra({ VIDEO_CHAVE_MESTRA: randomBytes(16).toString("base64") })).toThrow("32 bytes");
  });

  it("aceita 32 bytes em base64", () => {
    expect(lerChaveMestra({ VIDEO_CHAVE_MESTRA: MESTRA.toString("base64") }).equals(MESTRA)).toBe(true);
  });
});
