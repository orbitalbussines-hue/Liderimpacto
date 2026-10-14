import { describe, expect, it } from "vitest";
import { tempoRelativo } from "./tempo";

const agora = new Date("2026-10-14T12:00:00Z");
const antes = (seg: number) => new Date(agora.getTime() - seg * 1000);

describe("tempoRelativo", () => {
  it("agora, minutos, horas, ontem, dias e data", () => {
    expect(tempoRelativo(antes(20), agora)).toBe("agora");
    expect(tempoRelativo(antes(5 * 60), agora)).toBe("há 5 min");
    expect(tempoRelativo(antes(3 * 3600), agora)).toBe("há 3 h");
    expect(tempoRelativo(antes(30 * 3600), agora)).toBe("ontem");
    expect(tempoRelativo(antes(4 * 86400), agora)).toBe("há 4 dias");
    expect(tempoRelativo(antes(20 * 86400), agora)).toBe("24/09");
  });
});
