import { describe, expect, it } from "vitest";
import { chaveDeIp, ipDoCliente } from "@/lib/auth/ip";

describe("IP do cliente e chave dos tetos", () => {
  it("le o X-Real-IP do proxy; sem ele, o ultimo item do x-forwarded-for", () => {
    expect(ipDoCliente(new Headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(ipDoCliente(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(ipDoCliente(new Headers())).toBe("local");
  });

  it("IPv6 do mesmo /64 vira UMA chave (trocar de endereco nao zera o teto)", () => {
    const a = chaveDeIp("2001:db8:abcd:12:1::5");
    expect(a).toBe("2001:0db8:abcd:0012::/64");
    expect(chaveDeIp("2001:db8:abcd:12:ffff:ffff:ffff:ffff")).toBe(a);
    expect(chaveDeIp("2001:DB8:ABCD:12::")).toBe(a);
    expect(chaveDeIp("2001:db8:abcd:13::1")).not.toBe(a);
    expect(chaveDeIp("::1")).toBe("0000:0000:0000:0000::/64");
  });

  it("IPv4 e IPv4 mapeado ficam inteiros", () => {
    expect(chaveDeIp("203.0.113.9")).toBe("203.0.113.9");
    expect(chaveDeIp("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(chaveDeIp("local")).toBe("local");
  });
});
