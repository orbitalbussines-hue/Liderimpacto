/**
 * Renderizador MÍNIMO da resposta do assistente (ADR-0014) — PURO. O texto do modelo vira blocos
 * (parágrafo ou lista) de partes (texto, negrito, citação `[n]`). A tela monta elementos React com
 * isso: nunca HTML, nunca `dangerouslySetInnerHTML`. Títulos de markdown viram parágrafo, crases e
 * marcadores soltos ficam como texto.
 */

export type Parte = { tipo: "texto"; texto: string } | { tipo: "negrito"; texto: string } | { tipo: "citacao"; n: number };
export type Bloco = { tipo: "paragrafo"; partes: Parte[] } | { tipo: "lista"; ordenada: boolean; itens: Parte[][] };

const ITEM = /^\s*(?:([-*•])|(\d{1,2})[.)])\s+(.*)$/;

/** Uma linha -> partes: `**negrito**` e `[n]` (1 ou 2 dígitos). O resto é texto literal. */
export function partesDaLinha(linha: string): Parte[] {
  const partes: Parte[] = [];
  const re = /\*\*([^*\n]+)\*\*|\[(\d{1,2})\]/g;
  let fim = 0;
  for (const m of linha.matchAll(re)) {
    if (m.index > fim) partes.push({ tipo: "texto", texto: linha.slice(fim, m.index) });
    partes.push(m[1] !== undefined ? { tipo: "negrito", texto: m[1] } : { tipo: "citacao", n: Number(m[2]) });
    fim = m.index + m[0].length;
  }
  if (fim < linha.length) partes.push({ tipo: "texto", texto: linha.slice(fim) });
  return partes;
}

export function blocosDoTexto(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];
  const fecharParagrafo = () => {
    if (paragrafo.length) blocos.push({ tipo: "paragrafo", partes: partesDaLinha(paragrafo.join(" ")) });
    paragrafo = [];
  };
  for (const bruta of texto.replace(/\r\n?/g, "\n").split("\n")) {
    const linha = bruta.replace(/^\s*#{1,6}\s+/, "").trimEnd();
    if (!linha.trim()) {
      fecharParagrafo();
      continue;
    }
    const item = ITEM.exec(linha);
    if (item) {
      fecharParagrafo();
      const ordenada = item[2] !== undefined;
      const ultimo = blocos[blocos.length - 1];
      const partes = partesDaLinha(item[3]);
      if (ultimo?.tipo === "lista" && ultimo.ordenada === ordenada) ultimo.itens.push(partes);
      else blocos.push({ tipo: "lista", ordenada, itens: [partes] });
      continue;
    }
    paragrafo.push(linha.trim());
  }
  fecharParagrafo();
  return blocos;
}
