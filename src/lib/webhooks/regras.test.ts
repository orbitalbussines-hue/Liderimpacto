import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DestinoBloqueado, ipBloqueado, postarWebhook, resolverPublico } from "./rede";
import { atrasoDaProxima, entregaOk, problemaNaUrlWebhook, resumirErroWebhook } from "./regras";
import { assinarCorpo, cifrarSegredo, decifrarSegredo, gerarSegredoWebhook } from "./segredo";

describe("URL do webhook", () => {
  it("só https, sem credencial, sem host interno por nome", () => {
    expect(problemaNaUrlWebhook("https://hooks.exemplo.com/x?y=1")).toBeNull();
    expect(problemaNaUrlWebhook("http://hooks.exemplo.com")).toMatch(/https/);
    expect(problemaNaUrlWebhook("https://u:s@hooks.exemplo.com")).toMatch(/usuário/);
    expect(problemaNaUrlWebhook("https://localhost/x")).toMatch(/não permitido/);
    expect(problemaNaUrlWebhook("https://10.0.0.1/x")).toMatch(/IP/);
    expect(problemaNaUrlWebhook("https://2130706433/x")).toMatch(/IP/);
    expect(problemaNaUrlWebhook("https://[::1]/x")).toMatch(/IP/);
    expect(problemaNaUrlWebhook("https://api.internal")).toMatch(/não permitido/);
    expect(problemaNaUrlWebhook("ftp://x")).toMatch(/https/);
    expect(problemaNaUrlWebhook("isso não é url")).toMatch(/inválida/);
  });

  it("backoff dobra a partir de 30 s; 2xx é sucesso; 3xx não", () => {
    expect([1, 2, 3, 4].map(atrasoDaProxima)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(entregaOk(204)).toBe(true);
    expect(entregaOk(301)).toBe(false);
    expect(resumirErroWebhook(`  a\n\nb ${"x".repeat(400)}`)).toHaveLength(300);
  });
});

describe("bloqueio de SSRF", () => {
  it("recusa loopback, privado, link-local/metadados, CGNAT, IPv6 interno e mapeado", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00:ec2::254", "::ffff:127.0.0.1", "64:ff9b::a00:1", "224.0.0.1", "não-ip"]) {
      expect(ipBloqueado(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(ipBloqueado(ip), ip).toBe(false);
  });

  it("resolve o nome e recusa se algum endereço é interno; IP literal também", async () => {
    await expect(resolverPublico("localhost")).rejects.toBeInstanceOf(DestinoBloqueado);
    await expect(resolverPublico("[::1]")).rejects.toBeInstanceOf(DestinoBloqueado);
    await expect(resolverPublico("169.254.169.254")).rejects.toBeInstanceOf(DestinoBloqueado);
    expect(await resolverPublico("8.8.8.8")).toEqual([{ address: "8.8.8.8", family: 4 }]);
  });

  it("o POST nunca sai para endereço interno", async () => {
    await expect(postarWebhook("https://127.0.0.1:3011/x", "{}", {})).rejects.toBeInstanceOf(DestinoBloqueado);
    await expect(postarWebhook("https://localhost/x", "{}", {})).rejects.toBeInstanceOf(DestinoBloqueado);
    await expect(postarWebhook("http://8.8.8.8/x", "{}", {})).rejects.toThrow(/https/);
  });
});

describe("segredo e assinatura", () => {
  beforeEach(() => vi.stubEnv("BETTER_AUTH_SECRET", "segredo-somente-de-teste-com-mais-de-32-caracteres"));

  it("cifra recuperável, presa ao id do webhook", () => {
    const s = gerarSegredoWebhook();
    expect(s).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    const c = cifrarSegredo(s, "w1");
    expect(c).not.toContain(s);
    expect(decifrarSegredo(c, "w1")).toBe(s);
    expect(() => decifrarSegredo(c, "w2")).toThrow();
    vi.stubEnv("BETTER_AUTH_SECRET", "outro-segredo-de-teste-com-mais-de-32-caracteres");
    expect(() => decifrarSegredo(c, "w1")).toThrow();
  });

  it("assinatura t=<unix>,v1=HMAC(segredo, t.corpo) que o receptor recalcula", () => {
    const quando = new Date("2026-10-17T12:00:00Z");
    const t = Math.floor(quando.getTime() / 1000);
    const esperado = createHmac("sha256", "whsec_x").update(`${t}.{"a":1}`).digest("hex");
    expect(assinarCorpo("whsec_x", '{"a":1}', quando)).toBe(`t=${t},v1=${esperado}`);
  });
});
