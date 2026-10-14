import { describe, expect, it } from "vitest";
import {
  capitulosSchema,
  erroDeCapitulosNaDuracao,
  formatarTempo,
  lerTempo,
  materialNovoSchema,
  novaOrdemSchema,
  slugSchema,
  sugerirSlug,
  urlMaterialSchema,
} from "./catalogo";

const ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const V = "2026-10-13T12:00:00.000Z";

describe("slug", () => {
  it("sugere a partir do titulo (sem acento, minusculas, hifens)", () => {
    expect(sugerirSlug("Líder de Impacto 2.0!")).toBe("lider-de-impacto-2-0");
    expect(sugerirSlug("  --Ação & Reação--  ")).toBe("acao-reacao");
    expect(sugerirSlug("x".repeat(100))).toHaveLength(80);
    expect(sugerirSlug(`${"a".repeat(79)} b`)).toBe("a".repeat(79));
  });

  it("aceita so [a-z0-9-] sem hifen nas pontas ou duplo", () => {
    expect(slugSchema.parse("  Lider-2026 ")).toBe("lider-2026");
    for (const ruim of ["-lider", "lider-", "li--der", "líder", "lider de", "a", "x".repeat(81), "lider/../x"]) {
      expect(slugSchema.safeParse(ruim).success, ruim).toBe(false);
    }
  });
});

describe("capitulos", () => {
  it("le e formata mm:ss e h:mm:ss", () => {
    expect(lerTempo("02:05")).toBe(125);
    expect(lerTempo("1:02:05")).toBe(3725);
    expect(lerTempo("2:5")).toBeNull();
    expect(lerTempo("00:60")).toBeNull();
    expect(lerTempo("abc")).toBeNull();
    expect(formatarTempo(125)).toBe("02:05");
    expect(formatarTempo(3725)).toBe("1:02:05");
  });

  it("ordena, recusa tempo repetido, campo extra e titulo vazio", () => {
    expect(capitulosSchema.parse([{ inicioSeg: 90, titulo: "B" }, { inicioSeg: 0, titulo: "A" }])).toEqual([
      { inicioSeg: 0, titulo: "A" },
      { inicioSeg: 90, titulo: "B" },
    ]);
    expect(capitulosSchema.safeParse([{ inicioSeg: 5, titulo: "A" }, { inicioSeg: 5, titulo: "B" }]).success).toBe(false);
    expect(capitulosSchema.safeParse([{ inicioSeg: 5, titulo: "A", extra: 1 }]).success).toBe(false);
    expect(capitulosSchema.safeParse([{ inicioSeg: 5, titulo: "  " }]).success).toBe(false);
    expect(capitulosSchema.safeParse([{ inicioSeg: -1, titulo: "A" }]).success).toBe(false);
    expect(capitulosSchema.safeParse([{ inicioSeg: 1.5, titulo: "A" }]).success).toBe(false);
  });

  it("confere a duracao so quando ela e conhecida", () => {
    expect(erroDeCapitulosNaDuracao([{ inicioSeg: 500 }], null)).toBeNull();
    expect(erroDeCapitulosNaDuracao([{ inicioSeg: 0 }, { inicioSeg: 99 }], 100)).toBeNull();
    expect(erroDeCapitulosNaDuracao([{ inicioSeg: 100 }], 100)).toMatch(/01:40 passa da duração da aula \(01:40\)/);
  });
});

describe("material", () => {
  it("link so https com dominio; arquivo por id; nunca os dois", () => {
    expect(urlMaterialSchema.parse(" https://exemplo.com.br/a?b=1 ")).toBe("https://exemplo.com.br/a?b=1");
    for (const ruim of ["http://exemplo.com", "javascript:alert(1)", "https://", "https://<x>.com", "ftp://x.com", "https://localhost"]) {
      expect(urlMaterialSchema.safeParse(ruim).success, ruim).toBe(false);
    }
    expect(materialNovoSchema.safeParse({ aulaId: ID, nome: "Apostila", arquivoId: ID }).success).toBe(true);
    expect(materialNovoSchema.safeParse({ aulaId: ID, nome: "Site", url: "https://x.com" }).success).toBe(true);
    expect(materialNovoSchema.safeParse({ aulaId: ID, nome: "Os dois", url: "https://x.com", arquivoId: ID }).success).toBe(false);
    expect(materialNovoSchema.safeParse({ aulaId: ID, nome: "Nenhum" }).success).toBe(false);
    expect(materialNovoSchema.safeParse({ aulaId: ID, nome: "<script>", url: "https://x.com" }).success).toBe(false);
  });
});

describe("nova ordem", () => {
  it("recusa lista vazia e id repetido", () => {
    expect(novaOrdemSchema.safeParse([]).success).toBe(false);
    expect(novaOrdemSchema.safeParse([{ id: ID, versao: V }, { id: ID, versao: V }]).success).toBe(false);
    expect(novaOrdemSchema.parse([{ id: ID, versao: V }])[0].versao).toEqual(new Date(V));
  });
});
