import { describe, expect, it } from "vitest";
import { resumoDoResgate } from "./formulario-resgate";

describe("resumoDoResgate", () => {
  it("conta só os cursos novos e avisa os que a pessoa já tinha", () => {
    expect(resumoDoResgate([{ resultado: "criada" }])).toBe("1 curso liberado.");
    expect(resumoDoResgate([{ resultado: "criada" }, { resultado: "reativada" }])).toBe("2 cursos liberados.");
    expect(resumoDoResgate([{ resultado: "criada" }, { resultado: "ja-existia" }])).toBe("1 curso liberado. Você já tinha 1 deles.");
  });
});
