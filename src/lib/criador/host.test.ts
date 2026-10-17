import { describe, expect, it } from "vitest";
import { criadorDoHost, slugValido, urlDaArea } from "./host";

const PRD = "lideresdeimpacto.com.br";

describe("criadorDoHost", () => {
  it("subdominio vira criador, com ou sem porta e em qualquer caixa", () => {
    expect(criadorDoHost("lider-de-impacto.lideresdeimpacto.com.br", PRD)).toEqual({ tipo: "criador", slug: "lider-de-impacto" });
    expect(criadorDoHost("Lider-De-Impacto.LideresDeImpacto.com.br:443", PRD)).toEqual({ tipo: "criador", slug: "lider-de-impacto" });
    expect(criadorDoHost("lider-de-impacto.localhost:3011", "localhost")).toEqual({ tipo: "criador", slug: "lider-de-impacto" });
    expect(criadorDoHost("a.lideresdeimpacto.com.br.", PRD)).toEqual({ tipo: "criador", slug: "a" });
  });

  it("apex e www sao a plataforma", () => {
    expect(criadorDoHost("lideresdeimpacto.com.br", PRD)).toEqual({ tipo: "plataforma" });
    expect(criadorDoHost("www.lideresdeimpacto.com.br", PRD)).toEqual({ tipo: "plataforma" });
    expect(criadorDoHost("localhost:3013", "localhost")).toEqual({ tipo: "plataforma" });
  });

  it("outro host e dominio proprio", () => {
    expect(criadorDoHost("cursos.valmer.com.br", PRD)).toEqual({ tipo: "dominioProprio", host: "cursos.valmer.com.br" });
    // Sufixo parecido nao engana: precisa do ponto antes do dominio.
    expect(criadorDoHost("xlideresdeimpacto.com.br", PRD)).toEqual({ tipo: "dominioProprio", host: "xlideresdeimpacto.com.br" });
    expect(criadorDoHost("127.0.0.1:3013", "localhost")).toEqual({ tipo: "dominioProprio", host: "127.0.0.1" });
  });

  it("recusa slug invalido, reservado, dois niveis e host ilegivel", () => {
    expect(criadorDoHost("-ruim.lideresdeimpacto.com.br", PRD)).toBeNull();
    expect(criadorDoHost("ruim-.lideresdeimpacto.com.br", PRD)).toBeNull();
    expect(criadorDoHost("a.b.lideresdeimpacto.com.br", PRD)).toBeNull();
    expect(criadorDoHost("api.lideresdeimpacto.com.br", PRD)).toBeNull();
    expect(criadorDoHost("s3.hml.lideresdeimpacto.com.br", "hml.lideresdeimpacto.com.br")).toBeNull();
    expect(criadorDoHost(`${"a".repeat(64)}.lideresdeimpacto.com.br`, PRD)).toBeNull();
    expect(criadorDoHost("mal_formado.lideresdeimpacto.com.br", PRD)).toBeNull();
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
    expect(urlDaArea("https://lideresdeimpacto.com.br", null)).toBe("https://lideresdeimpacto.com.br");
    expect(urlDaArea("https://lideresdeimpacto.com.br/", "lider-de-impacto")).toBe("https://lider-de-impacto.lideresdeimpacto.com.br");
    expect(urlDaArea("http://localhost:3011", "lider-de-impacto")).toBe("http://lider-de-impacto.localhost:3011");
  });
});
