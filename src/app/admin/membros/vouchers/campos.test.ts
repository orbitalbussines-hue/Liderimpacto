import { describe, expect, it } from "vitest";
import { criarVoucherSchema } from "@/lib/validators/vouchers";
import { CAMPOS_VAZIOS, camposDoVoucher, entradaDoVoucher } from "./campos";

const CURSO = "0b8f0d7e-6f5e-4c1a-9a51-0d6f7b6c3a10";

describe("campos do voucher (tela ⇄ action)", () => {
  it("vazios viram nulos, por pessoa padrão 1, validade = fim do dia em Brasília, e o schema da action aceita", () => {
    const r = entradaDoVoucher({ ...CAMPOS_VAZIOS, validoAte: "2030-03-10", diasAcesso: " 30 ", produtoIds: [CURSO] });
    expect(r).toEqual({
      ok: true,
      entrada: { descricao: "", validoAte: "2030-03-11T02:59:59.999Z", limiteUsos: null, limitePorPessoa: 1, diasAcesso: 30, produtoIds: [CURSO] },
    });
    if (r.ok) expect(criarVoucherSchema.safeParse({ codigo: null, ...r.entrada }).success).toBe(true);
  });

  it("recusa número que não é inteiro e data inexistente antes de chamar a action", () => {
    expect(entradaDoVoucher({ ...CAMPOS_VAZIOS, limiteUsos: "1.5" })).toMatchObject({ ok: false });
    expect(entradaDoVoucher({ ...CAMPOS_VAZIOS, validoAte: "2030-02-31" })).toEqual({ ok: false, erro: "Data de validade inválida." });
  });

  it("editar: a validade gravada volta como a mesma data do calendário", () => {
    const c = camposDoVoucher({ descricao: "X", validoAte: new Date("2030-03-11T02:59:59.999Z"), limiteUsos: 50, limitePorPessoa: 2, diasAcesso: null, produtoIds: [CURSO] });
    expect(c).toMatchObject({ validoAte: "2030-03-10", limiteUsos: "50", limitePorPessoa: "2", diasAcesso: "" });
  });
});
