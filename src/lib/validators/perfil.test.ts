import { describe, expect, it } from "vitest";
import { digitosDoWhatsapp, mascararWhatsapp, perfilSchema } from "./perfil";

const versao = new Date().toISOString();

describe("WhatsApp do perfil", () => {
  it("máscara de digitação (parcial e completa)", () => {
    expect(mascararWhatsapp("1")).toBe("(1");
    expect(mascararWhatsapp("1199")).toBe("(11) 99");
    expect(mascararWhatsapp("11999990000")).toBe("(11) 99999-0000");
    expect(mascararWhatsapp("1133330000")).toBe("(11) 3333-0000");
    expect(mascararWhatsapp("+55 11 99999-0000")).toBe("(11) 99999-0000");
  });

  it("aceita celular/fixo BR, vazio vira nulo; recusa DDD ou número inválido", () => {
    expect(digitosDoWhatsapp("+55 (11) 99999-0000")).toBe("11999990000");
    const ok = (w: string) => perfilSchema.safeParse({ nome: "Ana Demo", whatsapp: w, empresaCargo: "", versao });
    expect(ok("(11) 99999-0000").data?.whatsapp).toBe("11999990000");
    expect(ok("(21) 3333-0000").success).toBe(true);
    expect(ok("").data?.whatsapp).toBeNull();
    for (const ruim of ["(01) 99999-0000", "(11) 89999-0000", "1199999", "abc", "(11) 1333-0000"]) expect(ok(ruim).success).toBe(false);
  });

  it("recusa campo a mais (ex.: usuarioId no corpo) e < > na empresa", () => {
    expect(perfilSchema.safeParse({ nome: "Ana", whatsapp: "", empresaCargo: "", versao, usuarioId: "x" }).success).toBe(false);
    expect(perfilSchema.safeParse({ nome: "Ana", whatsapp: "", empresaCargo: "<b>", versao }).success).toBe(false);
  });
});
