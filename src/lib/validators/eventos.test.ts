import { describe, expect, it } from "vitest";
import { opcoesDoJobLembrete } from "@/lib/eventos/fila";
import { campoDeBrasilia, camposDoFormulario, camposEventoSchema, instanteDeBrasilia } from "./eventos";

const G1 = "00000000-0000-4000-8000-000000000001";
const G2 = "00000000-0000-4000-8000-000000000002";

const valido = {
  titulo: "  Mentoria em grupo ",
  descricao: "Traga dúvidas.",
  inicio: "2026-10-21T19:30",
  duracaoMin: 60,
  link: "https://meet.google.com/abc-defg-hij",
  publico: "TODOS",
  produtoId: null,
  grupoIds: [],
  gravacaoAulaId: null,
};

describe("instanteDeBrasilia / campoDeBrasilia", () => {
  it("lê o datetime-local como horário de Brasília (UTC−3) e volta igual", () => {
    expect(instanteDeBrasilia("2026-10-21T19:30")?.toISOString()).toBe("2026-10-21T22:30:00.000Z");
    expect(instanteDeBrasilia("2026-12-31T22:00")?.toISOString()).toBe("2027-01-01T01:00:00.000Z");
    expect(campoDeBrasilia(new Date("2027-01-01T01:00:00.000Z"))).toBe("2026-12-31T22:00");
  });
  it("recusa data impossível e formato errado", () => {
    for (const t of ["2026-02-30T10:00", "2026-10-21T24:00", "21/10/2026 19:30", "", "2026-10-21"]) expect(instanteDeBrasilia(t)).toBeNull();
  });
});

describe("camposEventoSchema", () => {
  it("normaliza título, link vazio vira null e descarta o que não é do público", () => {
    const r = camposEventoSchema.parse({ ...valido, link: "  ", publico: "TODOS", produtoId: G1, grupoIds: [G1] });
    expect(r).toMatchObject({ titulo: "Mentoria em grupo", link: null, produtoId: null, grupoIds: [] });
    expect(r.inicio.toISOString()).toBe("2026-10-21T22:30:00.000Z");
  });
  it("link só https válido; duração 5–720; PRODUTO exige curso; GRUPOS exige grupo", () => {
    const msg = (o: object) => camposEventoSchema.safeParse({ ...valido, ...o }).error?.issues[0]?.message;
    expect(msg({ link: "http://zoom.us/j/1" })).toMatch(/Link inválido/);
    expect(msg({ link: "javascript:alert(1)" })).toMatch(/Link inválido/);
    expect(msg({ duracaoMin: 4 })).toMatch(/Duração/);
    expect(msg({ duracaoMin: Number.NaN })).toMatch(/Duração/);
    expect(msg({ publico: "PRODUTO" })).toBe("Escolha o curso do público.");
    expect(msg({ publico: "GRUPOS" })).toBe("Escolha ao menos um grupo.");
    expect(msg({ titulo: "<b>oi</b>" })).toMatch(/caracteres inválidos/);
    expect(msg({ inicio: "amanhã" })).toBe("Informe a data e a hora de início.");
    expect(camposEventoSchema.safeParse({ ...valido, extra: 1 }).success).toBe(false);
  });
});

describe("camposDoFormulario", () => {
  it("lê o form campo a campo (grupos múltiplos, vazios viram null)", () => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ titulo: "Live", descricao: "", inicio: "2026-10-21T19:30", duracaoMin: "90", link: "", publico: "GRUPOS", produtoId: "", gravacaoAulaId: "" })) f.set(k, v);
    f.append("grupoIds", G1);
    f.append("grupoIds", G2);
    f.set("intruso", "x");
    expect(camposDoFormulario(f)).toEqual({ titulo: "Live", descricao: "", inicio: "2026-10-21T19:30", duracaoMin: 90, link: "", publico: "GRUPOS", produtoId: null, grupoIds: [G1, G2], gravacaoAulaId: null });
    expect(camposEventoSchema.safeParse(camposDoFormulario(f)).success).toBe(true);
  });
});

describe("opcoesDoJobLembrete (fila eventos)", () => {
  const job = { criadorId: G1, eventoId: G2, inicioEm: "2026-10-21T22:30:00.000Z" };
  it("jobId por evento+início sem ':' e delay até 1 h antes", () => {
    const o = opcoesDoJobLembrete(job, new Date("2026-10-21T20:30:00.000Z"));
    expect(o.jobId).toBe(`lembrete-${G2}-${Date.parse(job.inicioEm)}`);
    expect(o.jobId).not.toContain(":");
    expect(o.delay).toBe(60 * 60_000);
    expect(o.attempts).toBe(3);
  });
  it("já passou do momento do lembrete: roda agora (delay 0)", () => {
    expect(opcoesDoJobLembrete(job, new Date("2026-10-21T22:00:00.000Z")).delay).toBe(0);
  });
});
