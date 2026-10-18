/**
 * Conversão etapa a etapa do funil (RN-246). PURO (tela e teste). Cada etapa tem os números brutos do
 * período; a conversão de uma etapa para a próxima é visitas(próxima) / visitas(atual). Dentro da etapa:
 * leads e cliques no checkout sobre as visitas, vendas sobre os cliques. Divisão por zero = null ("—").
 */

export interface NumerosEtapa {
  visitas: number;
  leads: number;
  cliques: number;
  vendas: number;
  receitaCentavos: number;
}

export interface ConversaoEtapa extends NumerosEtapa {
  /** % das visitas da etapa ANTERIOR que chegaram aqui (1ª etapa = null). */
  daAnterior: number | null;
  taxaLead: number | null;
  taxaClique: number | null;
  taxaVenda: number | null;
}

/** Percentual com 1 casa (12,3). */
export const percentual = (parte: number, todo: number): number | null => (todo > 0 ? Math.round((parte / todo) * 1000) / 10 : null);

export function conversoes(etapas: readonly NumerosEtapa[]): ConversaoEtapa[] {
  return etapas.map((e, i) => ({
    ...e,
    daAnterior: i === 0 ? null : percentual(e.visitas, etapas[i - 1].visitas),
    taxaLead: percentual(e.leads, e.visitas),
    taxaClique: percentual(e.cliques, e.visitas),
    taxaVenda: percentual(e.vendas, e.cliques),
  }));
}

/** Do início ao fim: vendas do funil inteiro sobre as visitas da 1ª etapa. */
export function conversaoTotal(etapas: readonly NumerosEtapa[]): number | null {
  if (!etapas.length) return null;
  return percentual(
    etapas.reduce((s, e) => s + e.vendas, 0),
    etapas[0].visitas,
  );
}

export const textoPercentual = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR")}%`);
