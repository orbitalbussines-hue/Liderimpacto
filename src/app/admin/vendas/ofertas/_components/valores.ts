/**
 * Texto digitado ⇄ inteiro em centésimos, usado pelas telas de Vendas e pela /plataforma: preço em reais
 * ("97,00" → 9700 centavos) e percentual ("8,25" → 825 bps). Sem ponto flutuante na conta.
 */

const RE_NUMERO = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;

/** "97" · "97,5" · "1.234,56" · "97.50" → centésimos; texto inválido → null. Faixas ficam com o Zod da action. */
export function centesimos(texto: string): number | null {
  // "97.50" (ponto decimal, sem vírgula) vira "97,50"; "1.234" continua milhar.
  const t = texto.trim().replace(/^R\$/i, "").replace(/\s/g, "").replace(/^(\d+)\.(\d{1,2})$/, "$1,$2");
  if (!RE_NUMERO.test(t)) return null;
  const [inteiro, decimais = ""] = t.replace(/\./g, "").split(",");
  const n = Number(inteiro) * 100 + Number(decimais.padEnd(2, "0"));
  return Number.isSafeInteger(n) ? n : null;
}

/** 9700 → "97,00" (valor inicial do campo ao editar). */
export const textoDeCentesimos = (n: number): string => `${Math.floor(n / 100)},${String(n % 100).padStart(2, "0")}`;

/** 825 → "8,25%" · 800 → "8%". */
export const formatarPercentual = (bps: number): string => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** 21/09/26, no fuso de Brasília. */
export const dataCurta = (d: Date) =>
  d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
