import { describe, expect, it } from "vitest";
import { dobrarLinha, escaparIcs, gerarIcs, nomeDoIcs } from "./agenda-ics";

const BASE = {
  id: "00000000-0000-4000-8000-000000000001",
  titulo: "Mentoria; ao vivo, com Q&A",
  descricao: "Traga suas dúvidas\nsobre liderança.",
  inicioEm: new Date("2026-10-21T22:30:00.000Z"),
  fimEm: new Date("2026-10-21T23:30:00.000Z"),
  cancelado: false,
  url: "https://demo.lideresdeimpacto.com.br/eventos/00000000-0000-4000-8000-000000000001",
  host: "demo.lideresdeimpacto.com.br",
};

describe("gerarIcs", () => {
  const ics = gerarIcs(BASE, new Date("2026-10-14T12:00:00.000Z"));
  const desdobrado = ics.replace(/\r\n /g, "");

  it("VCALENDAR/VEVENT com CRLF, UTC e UID estável por evento e host", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
    expect(desdobrado).toContain("DTSTART:20261021T223000Z");
    expect(desdobrado).toContain("DTEND:20261021T233000Z");
    expect(desdobrado).toContain("DTSTAMP:20261014T120000Z");
    expect(desdobrado).toContain(`UID:evento-${BASE.id}@demo.lideresdeimpacto.com.br`);
    expect(desdobrado).toContain("STATUS:CONFIRMED");
  });

  it("escapa ; , \\ e quebra de linha; leva a página, NUNCA o link da sala", () => {
    expect(desdobrado).toContain("SUMMARY:Mentoria\\; ao vivo\\, com Q&A");
    expect(desdobrado).toContain("Traga suas dúvidas\\nsobre liderança.");
    expect(desdobrado).toContain(`URL:${BASE.url}`);
    expect(desdobrado).not.toMatch(/meet\.google|zoom\.us/);
  });

  it("cancelado = STATUS:CANCELLED", () => {
    expect(gerarIcs({ ...BASE, cancelado: true }, new Date())).toContain("STATUS:CANCELLED");
  });

  it("linhas dobradas em até 75 octetos sem partir caractere", () => {
    for (const l of ics.split("\r\n")) expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
    const longa = `DESCRIPTION:${"ação ".repeat(40)}`;
    const d = dobrarLinha(longa);
    expect(d.replace(/\r\n /g, "")).toBe(longa);
    for (const l of d.split("\r\n")) expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
  });
});

describe("escaparIcs e nomeDoIcs", () => {
  it("escape do TEXT", () => expect(escaparIcs("a\\b;c,d\r\ne")).toBe("a\\\\b\\;c\\,d\\ne"));
  it("nome só com [a-z0-9-]", () => {
    expect(nomeDoIcs("Mentoria: Liderança 360°!")).toBe("encontro-mentoria-lideranca-360.ics");
    expect(nomeDoIcs("???")).toBe("encontro.ics");
  });
});
