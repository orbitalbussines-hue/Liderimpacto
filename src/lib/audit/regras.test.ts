// @vitest-environment node
import { describe, expect, it } from "vitest";
import { codificarCursor, detalheSeguro, ehNomeDeTabela, lerCursor, rotuloEntidade, tituloDoDetalhe } from "./regras";

describe("detalheSeguro (o que a tela de Logs mostra)", () => {
  it("mascara e-mail, IPv4 e IPv6", () => {
    expect(detalheSeguro("Papel de joana.silva@empresa.com.br: ALUNO → ADMIN")).toBe("Papel de j•••@empresa.com.br: ALUNO → ADMIN");
    expect(detalheSeguro("Entrou por senha · IP 189.40.12.200 · Chrome")).toBe("Entrou por senha · IP 189.40.12.x · Chrome");
    expect(detalheSeguro("IP 2804:14c:5b:8001::1")).toBe("IP 2804:14c:…");
  });
  it("esconde cara de segredo (token, hash, chave=valor) e mantém UUID", () => {
    expect(detalheSeguro("link #token=abc123 enviado")).toBe("link #token=[oculto] enviado");
    expect(detalheSeguro("hash e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 fim")).toBe("hash [oculto] fim");
    expect(detalheSeguro("senha: hunter2")).toBe("senha=[oculto]");
    const uuid = "0b9d7a3e-2f4c-4f7a-9b1e-3c2d1e0f9a8b";
    expect(detalheSeguro(`Concluiu a aula ${uuid}`)).toBe(`Concluiu a aula ${uuid}`);
    // impressão curta do e-mail (12 hex) e textos comuns passam
    expect(detalheSeguro("e-mail inexistente 3f2a9c0d1b7e")).toBe("e-mail inexistente 3f2a9c0d1b7e");
  });
});

describe("rótulos e título", () => {
  it("entidade conhecida ganha nome; desconhecida fica técnica", () => {
    expect(rotuloEntidade("produtos")).toBe("Produto");
    expect(rotuloEntidade("tabela_nova")).toBe("tabela_nova");
  });
  it("título = primeiro trecho entre aspas", () => {
    expect(tituloDoDetalhe('Removeu o produto "Curso X" (Cód. 3)')).toBe("Curso X");
    expect(tituloDoDetalhe("Saiu do sistema")).toBeNull();
  });
  it("nome de tabela do filtro só no formato do Postgres", () => {
    expect(ehNomeDeTabela("produtos_modulos")).toBe(true);
    expect(ehNomeDeTabela("produtos; drop")).toBe(false);
    expect(ehNomeDeTabela(undefined)).toBe(false);
  });
});

describe("cursor e período", () => {
  it("cursor vai e volta; formato errado = null", () => {
    const c = { em: new Date("2026-10-14T12:00:00.123Z"), id: "0b9d7a3e-2f4c-4f7a-9b1e-3c2d1e0f9a8b" };
    expect(lerCursor(codificarCursor(c))).toEqual(c);
    expect(lerCursor("abc")).toBeNull();
    expect(lerCursor("1_nao-uuid")).toBeNull();
    expect(lerCursor(undefined)).toBeNull();
  });
});
