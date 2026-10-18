import { dataEmBrasilia, fimDoDiaEmBrasilia } from "@/lib/matriculas/regras";

/** Formulário do voucher como a tela guarda (texto dos inputs) ⇄ entrada das actions (RN-201). */

export interface CamposVoucher {
  /** Só na criação; vazio = o sistema gera. */
  codigo: string;
  descricao: string;
  /** "AAAA-MM-DD" do `<input type="date">`; vazio = sem prazo. */
  validoAte: string;
  limiteUsos: string;
  limitePorPessoa: string;
  diasAcesso: string;
  produtoIds: string[];
}

export const CAMPOS_VAZIOS: CamposVoucher = { codigo: "", descricao: "", validoAte: "", limiteUsos: "", limitePorPessoa: "1", diasAcesso: "", produtoIds: [] };

export interface VoucherParaEditar {
  descricao: string;
  validoAte: Date | string | null;
  limiteUsos: number | null;
  limitePorPessoa: number;
  diasAcesso: number | null;
  produtoIds: string[];
}

export const camposDoVoucher = (v: VoucherParaEditar): CamposVoucher => ({
  codigo: "",
  descricao: v.descricao,
  validoAte: v.validoAte ? dataEmBrasilia(new Date(v.validoAte)) : "",
  limiteUsos: v.limiteUsos?.toString() ?? "",
  limitePorPessoa: String(v.limitePorPessoa),
  diasAcesso: v.diasAcesso?.toString() ?? "",
  produtoIds: [...v.produtoIds],
});

const RE_INTEIRO = /^\d+$/;

/**
 * Texto dos campos → entrada da action (sem `codigo`). Só confere o que o Zod não explica bem
 * (número não inteiro, data inexistente); faixas e mensagens de regra vêm da própria action.
 */
export function entradaDoVoucher(c: CamposVoucher) {
  const numeros = [c.limiteUsos, c.limitePorPessoa, c.diasAcesso].map((t) => t.trim());
  if (numeros.some((t) => t !== "" && !RE_INTEIRO.test(t))) return { ok: false, erro: "Use números inteiros nos limites e nos dias de acesso." } as const;
  const [limiteUsos, limitePorPessoa, diasAcesso] = numeros.map((t) => (t === "" ? null : Number(t)));
  const fim = c.validoAte ? fimDoDiaEmBrasilia(c.validoAte) : null;
  if (c.validoAte && !fim) return { ok: false, erro: "Data de validade inválida." } as const;
  return {
    ok: true,
    entrada: {
      descricao: c.descricao,
      validoAte: fim?.toISOString() ?? null,
      limiteUsos,
      limitePorPessoa: limitePorPessoa ?? 1,
      diasAcesso,
      produtoIds: c.produtoIds,
    },
  } as const;
}
