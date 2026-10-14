import { describe, expect, it } from "vitest";
import { criadorDoHost, slugValido, urlDaArea } from "./host";

const PRD = "liderdeimpacto.com.br";

describe("criadorDoHost", () => {
  it("subdominio vira criador, com ou sem porta e em qualquer caixa", () => {
    expect(criadorDoHost("lider-de-impacto.liderdeimpacto.com.br", PRD)).toEqual({ tipo: "criador", slug: "lider-de-impacto" });
    expect(criadorDoHost("Lider-De-Impacto.LiderDeImpacto.com.br:443", PRD)).toEqual({ tipo: "criador", slug: "lider-de-impacto" });
    expect(criadorDoHost("lider-de-impacto.localhost:3011", "localhost")).toEqual({ tipo: "criador", slug: "lider-de-impacto" });
    expect(criadorDoHost("a.liderdeimpacto.com.br.", PRD)).toEqual({ tipo: "criador", slug: "a" });
  });

  it("apex e www sao a plataforma", () => {
    expect(criadorDoHost("liderdeimpacto.com.br", PRD)).toEqual({ tipo: "plataforma" });
    expect(criadorDoHost("www.liderdeimpacto.com.br", PRD)).toEqual({ tipo: "plataforma" });
    expect(criadorDoHost("localhost:3013", "localhost")).toEqual({ tipo: "plataforma" });
  });

  it("outro host e dominio proprio", () => {
    expect(criadorDoHost("cursos.valmer.com.br", PRD)).toEqual({ tipo: "dominioProprio", host: "cursos.valmer.com.br" });
    // Sufixo parecido nao engana: precisa do ponto antes do dominio.
    expect(criadorDoHost("xliderdeimpacto.com.br", PRD)).toEqual({ tipo: "dominioProprio", host: "xliderdeimpacto.com.br" });
    expect(criadorDoHost("127.0.0.1:3013", "localhost")).toEqual({ tipo: "dominioProprio", host: "127.0.0.1" });
  });

  it("recusa slug invalido, reservado, dois niveis e host ilegivel", () => {
    expect(criadorDoHost("-ruim.liderdeimpacto.com.br", PRD)).toBeNull();
    expect(criadorDoHost("ruim-.liderdeimpacto.com.br", PRD)).toBeNull();
    expect(criadorDoHost("a.b.liderdeimpacto.com.br", PRD)).toBeNull();
    expect(criadorDoHost("api.liderdeimpacto.com.br", PRD)).toBeNull();
    expect(criadorDoHost(`${"a".repeat(64)}.liderdeimpacto.com.br`, PRD)).toBeNull();
    expect(criadorDoHost("mal_formado.liderdeimpacto.com.br", PRD)).toBeNull();
    expect(criadorDoHost("", PRD)).toBeNull();
    expect(criadorDoHost(null, PRD)).toBeNull();
    expect(criadorDoHost("[::1]:3000", "localhost")).toBeNull();
    expect(criadorDoHost("x.localhost", "")).toBeNull();
  });

  it("slugValido segue a regra do banco", () => {
    expect(slugValido("lider-de-impacto")).toBe(true);
    expect(slugValido("a1")).toBe(true);
    expect(slugValido("www")).toBe(false);
    expect(slugValido("Lider")).toBe(false);
  });

  it("urlDaArea monta a origem da area a partir da URL da plataforma", () => {
    expect(urlDaArea("https://liderdeimpacto.com.br", null)).toBe("https://liderdeimpacto.com.br");
    expect(urlDaArea("https://liderdeimpacto.com.br/", "lider-de-impacto")).toBe("https://lider-de-impacto.liderdeimpacto.com.br");
    expect(urlDaArea("http://localhost:3011", "lider-de-impacto")).toBe("http://lider-de-impacto.localhost:3011");
  });
});
