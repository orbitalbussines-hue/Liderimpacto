import { describe, expect, it } from "vitest";
import { avisoDeBloqueio, avisoDoVideo, dataDeLiberacao, eyebrowDaAula } from "./textos";

const produto = { titulo: "Líder de Impacto", slug: "lider-de-impacto" };

describe("avisoDeBloqueio", () => {
  it("matrícula: explica e leva ao curso", () => {
    const a = avisoDeBloqueio("MATRICULA", { produto, liberaEm: null, preRequisito: null });
    expect(a.titulo).toMatch(/matriculados/);
    expect(a.descricao).toContain("Líder de Impacto");
    expect(a.acao).toEqual({ rotulo: "Ver o curso", href: "/cursos/lider-de-impacto" });
  });

  it("liberação: data e hora de Brasília", () => {
    const a = avisoDeBloqueio("LIBERACAO", { produto, liberaEm: new Date("2026-10-26T11:00:00Z"), preRequisito: null });
    expect(a.descricao).toBe("Ela fica disponível em 26/10/2026 às 08:00.");
  });

  it("pré-requisito: nomeia a aula exigida e linka para ela", () => {
    const a = avisoDeBloqueio("PRE_REQUISITO", { produto, liberaEm: null, preRequisito: { id: "abc", numero: "3.5", titulo: "O que são os riscos" } });
    expect(a.descricao).toContain("3.5 · O que são os riscos");
    expect(a.acao).toEqual({ rotulo: "Ir para a aula 3.5", href: "/aula/abc" });
  });

  it("indisponível: sem ação", () => {
    expect(avisoDeBloqueio("INDISPONIVEL", { produto, liberaEm: null, preRequisito: null }).acao).toBeUndefined();
  });
});

describe("avisoDoVideo", () => {
  it("PRONTO toca (sem aviso); os outros estados explicam", () => {
    expect(avisoDoVideo({ situacao: "PRONTO" })).toBeNull();
    expect(avisoDoVideo(null)?.titulo).toMatch(/ainda não tem vídeo/);
    expect(avisoDoVideo({ situacao: "PROCESSANDO" })?.titulo).toMatch(/sendo preparado/);
    expect(avisoDoVideo({ situacao: "ENVIANDO" })?.titulo).toMatch(/sendo preparado/);
    expect(avisoDoVideo({ situacao: "FALHOU" })?.icone).toBe("alerta");
  });
});

describe("formatos", () => {
  it("eyebrow e data", () => {
    expect(eyebrowDaAula("3.2")).toBe("Módulo 3 · Aula 2");
    expect(dataDeLiberacao(new Date("2026-01-05T02:30:00Z"))).toBe("04/01/2026 às 23:30");
  });
});
