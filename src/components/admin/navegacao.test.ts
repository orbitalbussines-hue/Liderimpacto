import { describe, expect, it } from "vitest";
import {
  GRUPOS_NAVEGACAO, RODAPE_NAVEGACAO, TODOS_ITENS, itemAtivo, papelPodeVer, secaoAcessivel, secaoPorSlug,
} from "./navegacao";

describe("secaoPorSlug", () => {
  it("acha pelo slug e devolve null para desconhecido", () => {
    expect(secaoPorSlug("membros")?.href).toBe("/admin/membros");
    expect(secaoPorSlug("nao-existe")).toBeNull();
    expect(secaoPorSlug("")).toBeNull();
  });

  it("slugs são únicos e a Configurações traz o card Aparência", () => {
    const slugs = TODOS_ITENS.map((i) => i.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const cfg = secaoPorSlug("configuracoes")!.molde;
    expect(cfg.tipo === "cards" && cfg.cards.some((c) => c.titulo === "Aparência")).toBe(true);
  });
});

describe("itemAtivo", () => {
  it("/admin é a Home", () => {
    expect(itemAtivo("/admin")?.slug).toBe("home");
    expect(itemAtivo("/admin/")?.slug).toBe("home");
  });
  it("subrotas e query ativam a seção", () => {
    expect(itemAtivo("/admin/membros")?.slug).toBe("membros");
    expect(itemAtivo("/admin/membros/42?x=1")?.slug).toBe("membros");
  });
  it("fora do admin ou desconhecido = null", () => {
    expect(itemAtivo("/")).toBeNull();
    expect(itemAtivo("/admin/xyz")).toBeNull();
    expect(itemAtivo("/administrador")).toBeNull();
  });
});

describe("regra de papel", () => {
  const donos = TODOS_ITENS.filter((i) => i.papelMinimo === "DONO").map((i) => i.slug);

  it("só financeiro, configurações e portal exigem DONO", () => {
    expect(donos.sort()).toEqual(["configuracoes", "portal-do-cliente", "vendas-e-financeiro"]);
  });
  it("DONO vê tudo", () => {
    expect(TODOS_ITENS.every((i) => papelPodeVer("DONO", i))).toBe(true);
  });
  it("ADMIN não vê o que é do DONO", () => {
    expect(donos.some((s) => papelPodeVer("ADMIN", secaoPorSlug(s)!))).toBe(false);
    expect(papelPodeVer("ADMIN", secaoPorSlug("membros")!)).toBe(true);
  });
  it("rota: ADMIN em seção do DONO = null (404); Home e desconhecido = null", () => {
    expect(secaoAcessivel("vendas-e-financeiro", "ADMIN")).toBeNull();
    expect(secaoAcessivel("vendas-e-financeiro", "DONO")?.slug).toBe("vendas-e-financeiro");
    expect(secaoAcessivel("home", "DONO")).toBeNull();
    expect(secaoAcessivel("zzz", "DONO")).toBeNull();
  });
});

describe("estrutura", () => {
  it("tem os grupos do README e rodapé", () => {
    expect(GRUPOS_NAVEGACAO.map((g) => g.titulo)).toEqual(["", "Educação", "Inteligência artificial", "Marketing", "Relatórios"]);
    expect(RODAPE_NAVEGACAO.map((i) => i.slug)).toEqual(["configuracoes", "portal-do-cliente"]);
  });
});
